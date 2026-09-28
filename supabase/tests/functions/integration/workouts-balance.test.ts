// T-0203b integration tests (CI only): POST /workouts/suggest and GET /balance against a real
// `supabase functions serve` + seeded local stack. Needs SERVICE_ROLE_KEY to provision fixture
// users (test-only; never used by function code, D-0053 §4).
import { assert, assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Ajv2020 } from "npm:ajv@8.20.0/dist/2020.js";
import { parse as parseYaml } from "npm:yaml@2";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  callFunction as callFunctionRaw,
  createTestUser as createTestUserRaw,
  seedFullProfile,
} from "./helpers.ts";
import { expiredAccessToken } from "../unit/fixtures/jwt.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..", "..");
const SPEC_PATH = join(REPO_ROOT, "api", "openapi.yaml");

const REQUEST_ID_RE = /^req_[0-9a-f-]{36}$/;

const SESSION_INPUT_30 = {
  budgetMin: 30,
  warmupInBudget: true,
  energy: "normal",
  shuffle: 0,
  mainLiftId: null,
  pinnedIds: [],
  excludeIds: [],
};

async function loadSpec(): Promise<Record<string, unknown>> {
  const text = await Deno.readTextFile(SPEC_PATH);
  return parseYaml(text) as Record<string, unknown>;
}

async function schemaValidator(schemaName: string) {
  const spec = await loadSpec();
  const ajv = new Ajv2020({ strict: false });
  const schemas = (spec.components as Record<string, unknown>).schemas as Record<string, unknown>;
  for (const [name, schema] of Object.entries(schemas)) {
    ajv.addSchema(schema as object, `#/components/schemas/${name}`);
  }
  return ajv.getSchema(`#/components/schemas/${schemaName}`)!;
}

async function assertValidatesAgainst(schemaName: string, body: unknown): Promise<void> {
  const validate = await schemaValidator(schemaName);
  const ok = validate(body);
  assert(ok, `body did not validate against ${schemaName}: ${JSON.stringify(validate.errors)}`);
}

function assertEnvelope(body: unknown, code: string, namedField?: string): void {
  const err = (body as { error: { code: string; message: string; requestId: string } }).error;
  assertEquals(err.code, code);
  assertMatch(err.requestId, REQUEST_ID_RE);
  if (namedField !== undefined) {
    assert(
      err.message.includes(namedField),
      `expected the message to name "${namedField}": ${err.message}`,
    );
  }
}

// --- AC23 sweep bookkeeping --------------------------------------------------------------------
// Every user id/email this file provisions, and every error response body this file produces, are
// recorded here so the final AC23 sweep test (below) can assert none of the former ever appears
// in any of the latter — across the whole suite, not just one hand-picked 400.
const knownIdentities: string[] = [];
const errorResponseBodies: string[] = [];

async function createTestUser(): ReturnType<typeof createTestUserRaw> {
  const user = await createTestUserRaw();
  knownIdentities.push(user.userId);
  return user;
}

async function callFunction(...args: Parameters<typeof callFunctionRaw>): Promise<Response> {
  const res = await callFunctionRaw(...args);
  if (res.status >= 400) {
    const raw = await res.clone().text();
    errorResponseBodies.push(raw);
  }
  return res;
}

// --- AC14: 401 for all three functions --------------------------------------------------------

Deno.test("AC14: POST /workouts/suggest with no Authorization is 401 envelope", async () => {
  const res = await callFunction("/workouts/suggest", {
    method: "POST",
    body: JSON.stringify({ sessionInput: SESSION_INPUT_30, tz: "Europe/Stockholm" }),
    headers: { "Content-Type": "application/json" },
  });
  assertEquals(res.status, 401);
  assertEnvelope(await res.json(), "unauthorized");
});

Deno.test("AC14: POST /workouts/suggest with Bearer garbage is 401 envelope", async () => {
  const res = await callFunction("/workouts/suggest", {
    method: "POST",
    accessToken: "garbage",
    body: JSON.stringify({ sessionInput: SESSION_INPUT_30, tz: "Europe/Stockholm" }),
    headers: { "Content-Type": "application/json" },
  });
  assertEquals(res.status, 401);
  assertEnvelope(await res.json(), "unauthorized");
});

Deno.test("AC14: GET /balance with no Authorization is 401 envelope", async () => {
  const res = await callFunction("/balance?tz=Europe/Stockholm");
  assertEquals(res.status, 401);
  assertEnvelope(await res.json(), "unauthorized");
});

Deno.test("AC14: GET /balance with Bearer garbage is 401 envelope", async () => {
  const res = await callFunction("/balance?tz=Europe/Stockholm", {
    accessToken: "garbage",
  });
  assertEquals(res.status, 401);
  assertEnvelope(await res.json(), "unauthorized");
});

// An access token signed with the local stack's own JWT_SECRET (from `supabase status -o env`,
// present in the CI job env), but with `exp` in the past — a real, correctly-signed, expired
// token, as opposed to `Bearer garbage`. This is the case an `auth.getUser` round-trip alone would
// still reject, but proves the platform's own 401 envelope (not the gateway's) covers it too.
Deno.test(
  "AC14: POST /workouts/suggest with an expired (but correctly signed) token is 401 envelope",
  async () => {
    const jwtSecret = Deno.env.get("JWT_SECRET");
    if (!jwtSecret)
      throw new Error("JWT_SECRET is not set (expected from `supabase status -o env`)");
    const token = await expiredAccessToken(jwtSecret);
    const res = await callFunction("/workouts/suggest", {
      method: "POST",
      accessToken: token,
      body: JSON.stringify({ sessionInput: SESSION_INPUT_30, tz: "Europe/Stockholm" }),
      headers: { "Content-Type": "application/json" },
    });
    assertEquals(res.status, 401);
    assertEnvelope(await res.json(), "unauthorized");
  },
);

Deno.test(
  "AC14: GET /balance with an expired (but correctly signed) token is 401 envelope",
  async () => {
    const jwtSecret = Deno.env.get("JWT_SECRET");
    if (!jwtSecret)
      throw new Error("JWT_SECRET is not set (expected from `supabase status -o env`)");
    const token = await expiredAccessToken(jwtSecret);
    const res = await callFunction("/balance?tz=Europe/Stockholm", {
      accessToken: token,
    });
    assertEquals(res.status, 401);
    assertEnvelope(await res.json(), "unauthorized");
  },
);

// --- AC17: one bad-request call per endpoint ----------------------------------------------------

Deno.test("AC17: POST /workouts/suggest with budgetMin 0 is 400 invalid_request", async () => {
  const user = await createTestUser();
  await seedFullProfile(user.client);
  const res = await callFunction("/workouts/suggest", {
    method: "POST",
    accessToken: user.accessToken,
    body: JSON.stringify({
      sessionInput: { ...SESSION_INPUT_30, budgetMin: 0 },
      tz: "Europe/Stockholm",
    }),
    headers: { "Content-Type": "application/json" },
  });
  assertEquals(res.status, 400);
  assertEnvelope(await res.json(), "invalid_request", "budgetMin");
});

Deno.test("AC17: GET /balance with tz=Mars/Base is 400 invalid_request", async () => {
  const user = await createTestUser();
  await seedFullProfile(user.client);
  const res = await callFunction("/balance?tz=Mars/Base", {
    accessToken: user.accessToken,
  });
  assertEquals(res.status, 400);
  assertEnvelope(await res.json(), "invalid_request", "tz");
});

// --- AC18: profile missing ----------------------------------------------------------------------

Deno.test("AC18: user B with no profiles row gets 422 on suggest and balance", async () => {
  const userB = await createTestUser();
  const suggestRes = await callFunction("/workouts/suggest", {
    method: "POST",
    accessToken: userB.accessToken,
    body: JSON.stringify({ sessionInput: SESSION_INPUT_30, tz: "Europe/Stockholm" }),
    headers: { "Content-Type": "application/json" },
  });
  assertEquals(suggestRes.status, 422);
  assertEnvelope(await suggestRes.json(), "profile_missing");

  const balanceRes = await callFunction("/balance?tz=Europe/Stockholm", {
    accessToken: userB.accessToken,
  });
  assertEquals(balanceRes.status, 422);
  assertEnvelope(await balanceRes.json(), "profile_missing");
});

Deno.test(
  "AC18: user C with a profile but 8 area_targets gets 422 on suggest and balance",
  async () => {
    const userC = await createTestUser();
    await seedFullProfile(userC.client, 8);
    const suggestRes = await callFunction("/workouts/suggest", {
      method: "POST",
      accessToken: userC.accessToken,
      body: JSON.stringify({ sessionInput: SESSION_INPUT_30, tz: "Europe/Stockholm" }),
      headers: { "Content-Type": "application/json" },
    });
    assertEquals(suggestRes.status, 422);
    assertEnvelope(await suggestRes.json(), "profile_missing");

    const balanceRes = await callFunction("/balance?tz=Europe/Stockholm", {
      accessToken: userC.accessToken,
    });
    assertEquals(balanceRes.status, 422);
    assertEnvelope(await balanceRes.json(), "profile_missing");
  },
);

// --- AC19: zero history ---------------------------------------------------------------------

Deno.test("AC19: zero-history suggest and balance are 200 and schema-valid", async () => {
  const user = await createTestUser();
  await seedFullProfile(user.client);

  const suggestRes = await callFunction("/workouts/suggest", {
    method: "POST",
    accessToken: user.accessToken,
    body: JSON.stringify({ sessionInput: SESSION_INPUT_30, tz: "Europe/Stockholm" }),
    headers: { "Content-Type": "application/json" },
  });
  assertEquals(suggestRes.status, 200);
  const workout = await suggestRes.json();
  await assertValidatesAgainst("Workout", workout);
  assertEquals(workout.plan.version, 1);
  assert(workout.plan.items.length >= 1);
  assert(workout.unusedS >= 0);
  for (const reason of workout.sessionReasons ?? []) {
    if (reason.code === "days_since") assertEquals(reason.days, null);
  }
  for (const item of workout.plan.items) {
    for (const reason of item.reasons ?? []) {
      if (reason.code === "days_since") assertEquals(reason.days, null);
    }
  }

  const balanceRes = await callFunction("/balance?tz=Europe/Stockholm", {
    accessToken: user.accessToken,
  });
  assertEquals(balanceRes.status, 200);
  const balance = await balanceRes.json();
  await assertValidatesAgainst("BalanceResult", balance);
  assertEquals(balance.areas.length, 9);
  for (const area of balance.areas) {
    assertEquals(area.load, 0);
    assertEquals(area.coverageStep, 0);
  }
});

// --- AC20: time running out / over budget -----------------------------------------------------

Deno.test("AC20: budgetMin 1 is 200 schema-valid with unusedS >= 0", async () => {
  const user = await createTestUser();
  await seedFullProfile(user.client);
  const res = await callFunction("/workouts/suggest", {
    method: "POST",
    accessToken: user.accessToken,
    body: JSON.stringify({
      sessionInput: { ...SESSION_INPUT_30, budgetMin: 1 },
      tz: "Europe/Stockholm",
    }),
    headers: { "Content-Type": "application/json" },
  });
  assertEquals(res.status, 200);
  const workout = await res.json();
  await assertValidatesAgainst("Workout", workout);
  assert(workout.unusedS >= 0);
});

Deno.test("AC20: budgetMin 480 is 200 with plan.items.length <= 8", async () => {
  const user = await createTestUser();
  await seedFullProfile(user.client);
  const res = await callFunction("/workouts/suggest", {
    method: "POST",
    accessToken: user.accessToken,
    body: JSON.stringify({
      sessionInput: { ...SESSION_INPUT_30, budgetMin: 480 },
      tz: "Europe/Stockholm",
    }),
    headers: { "Content-Type": "application/json" },
  });
  assertEquals(res.status, 200);
  const workout = await res.json();
  assert(workout.plan.items.length <= 8);
});

// --- AC21: returning after 10 days off ---------------------------------------------------------

Deno.test(
  "AC21: chest counts 3 in-window sets, back counts 0 out-of-window sets, 14 days entries",
  async () => {
    const user = await createTestUser();
    await seedFullProfile(user.client);

    const now = Date.now();
    const { data: session, error: sessionError } = await user.client
      .from("sessions")
      .insert({ started_at: new Date(now - 20 * 86400000).toISOString(), time_budget_min: 45 })
      .select("id")
      .single();
    if (sessionError) throw sessionError;

    const sets = [
      ...Array.from({ length: 3 }, (_, i) => ({
        client_id: crypto.randomUUID(),
        session_id: session.id,
        exercise_id: "barbell-bench-press",
        set_index: i,
        kind: "reps",
        reps: 8,
        weight_kg: 60,
        is_warmup: false,
        completed_at: new Date(now - 10 * 86400000).toISOString(),
        edited_at: new Date(now - 10 * 86400000).toISOString(),
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        client_id: crypto.randomUUID(),
        session_id: session.id,
        exercise_id: "barbell-row",
        set_index: i + 3,
        kind: "reps",
        reps: 8,
        weight_kg: 50,
        is_warmup: false,
        completed_at: new Date(now - 16 * 86400000).toISOString(),
        edited_at: new Date(now - 16 * 86400000).toISOString(),
      })),
    ];
    const { error: setsError } = await user.client.from("session_sets").insert(sets);
    if (setsError) throw setsError;

    const balanceRes = await callFunction("/balance?tz=Europe/Stockholm", {
      accessToken: user.accessToken,
    });
    assertEquals(balanceRes.status, 200);
    const balance = await balanceRes.json();
    await assertValidatesAgainst("BalanceResult", balance);
    const chest = balance.areas.find((a: { area: string }) => a.area === "chest");
    const back = balance.areas.find((a: { area: string }) => a.area === "back");
    assertEquals(chest.load, 3);
    assertEquals(back.load, 0);
    assertEquals(chest.days.length, 14);

    const suggestRes = await callFunction("/workouts/suggest", {
      method: "POST",
      accessToken: user.accessToken,
      body: JSON.stringify({ sessionInput: SESSION_INPUT_30, tz: "Europe/Stockholm" }),
      headers: { "Content-Type": "application/json" },
    });
    assertEquals(suggestRes.status, 200);
  },
);

// --- AC22: RLS isolation --------------------------------------------------------------------

Deno.test("AC22: another user's 10 hard sets never change A's balance", async () => {
  const userA = await createTestUser();
  await seedFullProfile(userA.client);

  const before = await callFunction("/balance?tz=Europe/Stockholm", {
    accessToken: userA.accessToken,
  });
  assertEquals(before.status, 200);
  const beforeBody = await before.json();

  const userD = await createTestUser();
  await seedFullProfile(userD.client);
  const { data: sessionD, error: sessionDError } = await userD.client
    .from("sessions")
    .insert({ started_at: new Date().toISOString(), time_budget_min: 30 })
    .select("id")
    .single();
  if (sessionDError) throw sessionDError;
  const setsD = Array.from({ length: 10 }, (_, i) => ({
    client_id: crypto.randomUUID(),
    session_id: sessionD.id,
    exercise_id: "barbell-bench-press",
    set_index: i,
    kind: "reps",
    reps: 8,
    weight_kg: 60,
    is_warmup: false,
    completed_at: new Date().toISOString(),
    edited_at: new Date().toISOString(),
  }));
  const { error: setsDError } = await userD.client.from("session_sets").insert(setsD);
  if (setsDError) throw setsDError;

  const after = await callFunction("/balance?tz=Europe/Stockholm", {
    accessToken: userA.accessToken,
  });
  assertEquals(after.status, 200);
  const afterBody = await after.json();

  // Compare everything but the now-dependent computedAt (both calls are within the same minute).
  const strip = (b: Record<string, unknown>) => {
    const { computedAt: _computedAt, ...rest } = b;
    return rest;
  };
  assertEquals(strip(afterBody), strip(beforeBody));
});

// --- AC23: no leak sweep -------------------------------------------------------------------------

Deno.test(
  "AC23: a fresh 400 error body contains neither the caller's user id nor their email",
  async () => {
    const user = await createTestUser();
    await seedFullProfile(user.client);
    const res = await callFunction("/balance?tz=Mars/Base", {
      accessToken: user.accessToken,
    });
    const body = await res.json();
    const raw = JSON.stringify(body);
    assert(!raw.includes(user.userId));
    assert(!raw.includes("@test.local"));
  },
);

// Runs last (Deno test files execute in declaration order): every error response this whole file
// produced (401/400/422/etc, tracked by the `callFunction` wrapper above) is checked against every
// user id this file provisioned (tracked by the `createTestUser` wrapper above), plus the fixed
// `@test.local` email domain every fixture user uses (NFR-PRIV-7). This is the full-suite sweep,
// not just the one 400 above.
Deno.test(
  "AC23 sweep: no error response produced by this suite leaks any user id, email, or a stack trace",
  () => {
    assert(errorResponseBodies.length > 0, "expected this suite to have produced error responses");
    assert(knownIdentities.length > 0, "expected this suite to have provisioned test users");
    for (const raw of errorResponseBodies) {
      for (const userId of knownIdentities) {
        assert(!raw.includes(userId), `error body leaked a user id: ${raw}`);
      }
      assert(!raw.includes("@test.local"), `error body leaked a test email: ${raw}`);
      assert(
        !/at\s+\S+\s+\(.*:\d+:\d+\)/.test(raw),
        `error body looks like it contains a stack trace: ${raw}`,
      );
    }
  },
);
