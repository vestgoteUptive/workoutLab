// T-0310b unit tests for the `account` function (D-0135 §2–§4, UF-11.4, NFR-PRIV-5): DELETE
// /account through createAccountHandler with injected fakes (AC1–AC5, AC7), admin.ts's missing-key
// guard (AC4) and the [functions.account] config entry (AC11). No Docker, no Deno.serve.
import { assert, assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Ajv2020 } from "npm:ajv@8.20.0/dist/2020.js";
import { parse as parseYaml } from "npm:yaml@2";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { authenticate as realAuthenticate } from "../../../functions/_shared/auth.ts";
import type { AuthContext } from "../../../functions/_shared/auth.ts";
import { unauthorized } from "../../../functions/_shared/errors.ts";
import { createAccountHandler } from "../../../functions/account/core.ts";
import { deleteAuthUser as adminDeleteAuthUser } from "../../../functions/account/admin.ts";
import { expiredAccessToken } from "./fixtures/jwt.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..", "..");
const REQUEST_ID_RE = /^req_[0-9a-f-]{36}$/;
const ORIGIN = "http://localhost:5173";
const FULL_URL = "http://localhost/functions/v1/account";
const ADMIN_TEST_USER_ID = "11111111-2222-4333-8444-555555555555";

// --- fakes -------------------------------------------------------------------------------------

function fakeAuth(userId: string): (req: Request) => Promise<AuthContext> {
  return () => Promise.resolve({ userId, supabase: {} as AuthContext["supabase"] });
}

function recordingDelete(impl: (id: string) => Promise<void> = () => Promise.resolve()) {
  const calls: string[] = [];
  const fn = (id: string) => {
    calls.push(id);
    return impl(id);
  };
  return { calls, fn };
}

async function captureLogs<T>(run: () => Promise<T>): Promise<{ result: T; lines: string[] }> {
  const originalLog = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => {
    lines.push(args.map((a) => String(a)).join(" "));
  };
  try {
    const result = await run();
    return { result, lines };
  } finally {
    console.log = originalLog;
  }
}

async function apiErrorValidator() {
  const spec = parseYaml(await Deno.readTextFile(join(REPO_ROOT, "api", "openapi.yaml"))) as {
    components: { schemas: Record<string, object> };
  };
  const ajv = new Ajv2020({ strict: false });
  for (const [name, schema] of Object.entries(spec.components.schemas)) {
    ajv.addSchema(schema, `#/components/schemas/${name}`);
  }
  return ajv.getSchema("#/components/schemas/ApiError")!;
}

// --- AC1: success ------------------------------------------------------------------------------

for (const url of [FULL_URL, "http://localhost/account"]) {
  Deno.test(
    `T-0310b AC1: DELETE ${new URL(url).pathname} is 204, empty body, deletes U1 once`,
    async () => {
      const del = recordingDelete();
      const handler = createAccountHandler({
        authenticate: fakeAuth("U1"),
        deleteAuthUser: del.fn,
      });
      const res = await handler(
        new Request(url, { method: "DELETE", headers: { Origin: ORIGIN } }),
      );
      assertEquals(res.status, 204);
      assertEquals(await res.text(), "");
      assertMatch(res.headers.get("x-request-id") ?? "", REQUEST_ID_RE);
      assertEquals(res.headers.get("Access-Control-Allow-Origin"), ORIGIN);
      assertEquals(del.calls, ["U1"]);
    },
  );
}

// --- AC2: the user id only comes from the verified token -----------------------------------------

Deno.test(
  "T-0310b AC2: body, query and x-user-id naming U2 are ignored; only U1 is deleted",
  async () => {
    const del = recordingDelete();
    const handler = createAccountHandler({ authenticate: fakeAuth("U1"), deleteAuthUser: del.fn });
    const res = await handler(
      new Request(`${FULL_URL}?userId=U2`, {
        method: "DELETE",
        headers: { Origin: ORIGIN, "Content-Type": "application/json", "x-user-id": "U2" },
        body: JSON.stringify({ userId: "U2" }),
      }),
    );
    // The query string doesn't change the route: still DELETE /account.
    assertEquals(res.status, 204);
    assertEquals(del.calls, ["U1"]);
    assert(!del.calls.includes("U2"));
  },
);

// --- AC3: 401 ----------------------------------------------------------------------------------

Deno.test(
  "T-0310b AC3: authenticate throwing unauthorized() is 401 ApiError, no delete",
  async () => {
    const del = recordingDelete();
    const handler = createAccountHandler({
      authenticate: () => Promise.reject(unauthorized()),
      deleteAuthUser: del.fn,
    });
    const res = await handler(
      new Request(FULL_URL, { method: "DELETE", headers: { Origin: ORIGIN } }),
    );
    assertEquals(res.status, 401);
    const body = await res.json();
    const validate = await apiErrorValidator();
    assert(validate(body), `not an ApiError: ${JSON.stringify(validate.errors)}`);
    assertEquals(body.error.code, "unauthorized");
    assertEquals(del.calls, []);
  },
);

const EXPIRED = await expiredAccessToken("test-jwt-secret-for-unit-tests-only");
const REAL_AUTH_CASES: Array<[string, Record<string, string>]> = [
  ["no Authorization header", {}],
  ["Authorization: Basic x", { Authorization: "Basic x" }],
  ["a JWT with exp 1 h in the past", { Authorization: `Bearer ${EXPIRED}` }],
];
for (const [label, headers] of REAL_AUTH_CASES) {
  Deno.test(`T-0310b AC3: real authenticate, ${label}: 401, no delete`, async () => {
    const del = recordingDelete();
    const handler = createAccountHandler({
      authenticate: realAuthenticate,
      deleteAuthUser: del.fn,
    });
    const res = await handler(new Request(FULL_URL, { method: "DELETE", headers }));
    assertEquals(res.status, 401);
    assertEquals((await res.json()).error.code, "unauthorized");
    assertEquals(del.calls, []);
  });
}

// --- AC4: 500 ----------------------------------------------------------------------------------

Deno.test(
  "T-0310b AC4: an admin error is 500 internal with the fixed message and no leak",
  async () => {
    const del = recordingDelete(() => Promise.reject(new Error("admin down: a@b.se")));
    const handler = createAccountHandler({ authenticate: fakeAuth("U1"), deleteAuthUser: del.fn });
    const res = await handler(
      new Request(FULL_URL, { method: "DELETE", headers: { Origin: ORIGIN } }),
    );
    assertEquals(res.status, 500);
    const raw = await res.text();
    const body = JSON.parse(raw);
    const requestId = res.headers.get("x-request-id");
    assertMatch(requestId ?? "", REQUEST_ID_RE);
    assertEquals(body, { error: { code: "internal", message: "Something went wrong", requestId } });
    assert(!raw.includes("a@b.se"));
    assert(!raw.includes("admin down"));
    assertEquals(del.calls, ["U1"]);
  },
);

Deno.test(
  "T-0310b AC4: admin.ts deleteAuthUser rejects without a network call when the service-role key is unset",
  async () => {
    const originalGet = Deno.env.get;
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    Deno.env.get = (key: string) => (key === "SUPABASE_URL" ? "http://127.0.0.1:54321" : undefined);
    globalThis.fetch = () => {
      fetchCalls += 1;
      return Promise.reject(new Error("no network in this test"));
    };
    let rejected = false;
    try {
      await adminDeleteAuthUser("U1");
    } catch {
      rejected = true;
    } finally {
      Deno.env.get = originalGet;
      globalThis.fetch = originalFetch;
    }
    assert(rejected, "expected deleteAuthUser to reject with no service-role key");
    assertEquals(fetchCalls, 0);
  },
);

Deno.test(
  "T-0310b AC4: admin.ts deleteAuthUser rejects when the admin API returns an error",
  async () => {
    const originalGet = Deno.env.get;
    const originalFetch = globalThis.fetch;
    const requests: Array<{ method: string; url: string; body: Promise<string> }> = [];
    Deno.env.get = (key: string) =>
      key === "SUPABASE_URL"
        ? "http://127.0.0.1:54321"
        : key === "SUPABASE_SERVICE_ROLE_KEY"
          ? "fake-key-for-unit-test"
          : undefined;
    globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(input, init);
      requests.push({ method: req.method, url: req.url, body: req.text() });
      return Promise.resolve(
        new Response(JSON.stringify({ code: 500, msg: "boom" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
      );
    };
    let rejected = false;
    try {
      await adminDeleteAuthUser(ADMIN_TEST_USER_ID);
    } catch {
      rejected = true;
    } finally {
      Deno.env.get = originalGet;
      globalThis.fetch = originalFetch;
    }
    assert(rejected, "expected deleteAuthUser to reject on an admin error");
    // Exactly one admin call: a DELETE of /auth/v1/admin/users/<id> (supabase-js validates the id
    // as a UUID first, so this test uses a real one).
    assertEquals(requests.length, 1);
    assertEquals(requests[0].method, "DELETE");
    assert(requests[0].url.endsWith(`/auth/v1/admin/users/${ADMIN_TEST_USER_ID}`), requests[0].url);
    // A hard delete (D-0135 §2): shouldSoftDelete false.
    assertEquals(JSON.parse(await requests[0].body).should_soft_delete, false);
  },
);

// --- AC5: routing and CORS -----------------------------------------------------------------------

for (const [method, path] of [
  ["GET", "/account"],
  ["POST", "/account"],
  ["PUT", "/account"],
  ["DELETE", "/account/extra"],
] as const) {
  Deno.test(`T-0310b AC5: ${method} ${path} is 404 not_found, no delete`, async () => {
    const del = recordingDelete();
    const handler = createAccountHandler({ authenticate: fakeAuth("U1"), deleteAuthUser: del.fn });
    const res = await handler(
      new Request(`http://localhost/functions/v1${path}`, { method, headers: { Origin: ORIGIN } }),
    );
    assertEquals(res.status, 404);
    assertEquals((await res.json()).error.code, "not_found");
    assertEquals(del.calls, []);
  });
}

Deno.test(
  "T-0310b AC5: OPTIONS /account from an allowed origin is 204 and allows DELETE",
  async () => {
    const del = recordingDelete();
    const handler = createAccountHandler({ authenticate: fakeAuth("U1"), deleteAuthUser: del.fn });
    const res = await handler(
      new Request(FULL_URL, { method: "OPTIONS", headers: { Origin: ORIGIN } }),
    );
    assertEquals(res.status, 204);
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), ORIGIN);
    assertMatch(res.headers.get("Access-Control-Allow-Methods") ?? "", /\bDELETE\b/);
    assertEquals(del.calls, []);
  },
);

Deno.test("T-0310b AC5: a disallowed origin gets no Access-Control-Allow-Origin", async () => {
  const del = recordingDelete();
  const handler = createAccountHandler({ authenticate: fakeAuth("U1"), deleteAuthUser: del.fn });
  const pre = await handler(
    new Request(FULL_URL, { method: "OPTIONS", headers: { Origin: "https://evil.example" } }),
  );
  assertEquals(pre.headers.get("Access-Control-Allow-Origin"), null);
  const res = await handler(
    new Request(FULL_URL, { method: "DELETE", headers: { Origin: "https://evil.example" } }),
  );
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), null);
});

// --- AC7: log line ----------------------------------------------------------------------------

for (const [label, impl, status] of [
  ["AC1 request", () => Promise.resolve(), 204],
  ["AC4 request", () => Promise.reject(new Error("admin down: a@b.se")), 500],
] as const) {
  Deno.test(`T-0310b AC7: one log line {fn, ms, requestId, status} for the ${label}`, async () => {
    const del = recordingDelete(impl);
    const handler = createAccountHandler({ authenticate: fakeAuth("U1"), deleteAuthUser: del.fn });
    const { lines } = await captureLogs(async () => {
      const res = await handler(
        new Request(FULL_URL, { method: "DELETE", headers: { Origin: ORIGIN } }),
      );
      await res.text();
      return res;
    });
    assertEquals(lines.length, 1, `expected one log line, got: ${lines.join("\n")}`);
    const entry = JSON.parse(lines[0]);
    assertEquals(Object.keys(entry).sort(), ["fn", "ms", "requestId", "status"]);
    assertEquals(entry.fn, "account");
    assertEquals(entry.status, status);
    assertMatch(entry.requestId, REQUEST_ID_RE);
    assertEquals(typeof entry.ms, "number");
    assert(!lines[0].includes("U1"));
    assert(!lines[0].includes("a@b.se"));
  });
}

// --- AC11: config -----------------------------------------------------------------------------

Deno.test(
  "T-0310b AC11: config.toml has [functions.account] verify_jwt = false; the other three are unchanged",
  async () => {
    const config = await Deno.readTextFile(join(REPO_ROOT, "supabase", "config.toml"));
    for (const fn of ["account", "workouts", "balance", "sessions"]) {
      const parts = config.split(`\n[functions.${fn}]\n`);
      assertEquals(parts.length, 2, `expected exactly one [functions.${fn}] section`);
      const section = parts[1].split(/\n\[/)[0];
      assertMatch(
        section,
        /^verify_jwt = false\n/,
        `[functions.${fn}] must have verify_jwt = false`,
      );
    }
  },
);
