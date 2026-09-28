// T-0203b unit tests for the shared function platform: CORS (AC15), routing/404 (AC16), auth 401
// (AC14) and the error-envelope/log-line shape (AC23). No Docker, no Deno.serve: the route table
// is exercised directly through createHandler's returned function.
import { assert, assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { corsHeaders, preflightResponse } from "../../../functions/_shared/cors.ts";
import { createHandler } from "../../../functions/_shared/http.ts";
import { unauthorized, internalError } from "../../../functions/_shared/errors.ts";

const REQUEST_ID_RE = /^req_[0-9a-f-]{36}$/;

// --- AC15: CORS ---------------------------------------------------------------------------

Deno.test("AC15: OPTIONS with an allowed origin returns 204 with CORS headers", () => {
  const res = preflightResponse("http://localhost:5173");
  assertEquals(res.status, 204);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "http://localhost:5173");
  const allowedHeaders = res.headers.get("Access-Control-Allow-Headers") ?? "";
  assertMatch(allowedHeaders, /authorization/);
  assertMatch(allowedHeaders, /content-type/);
});

Deno.test(
  "AC15: OPTIONS with a disallowed origin has no Access-Control-Allow-Origin header",
  () => {
    const res = preflightResponse("https://evil.example");
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), null);
  },
);

Deno.test("AC15: corsHeaders() is empty for a disallowed origin", () => {
  assertEquals(corsHeaders("https://evil.example"), {});
});

// --- AC16: routing / 404 -------------------------------------------------------------------

Deno.test("AC16: GET on a POST-only route is 404 with the envelope", async () => {
  const handler = createHandler("workouts", {
    "POST /workouts/suggest": () => new Response("{}", { status: 200 }),
  });
  const res = await handler(new Request("http://localhost/workouts/suggest", { method: "GET" }));
  assertEquals(res.status, 404);
  const body = await res.json();
  assertEquals(body.error.code, "not_found");
  assertMatch(body.error.requestId, REQUEST_ID_RE);
  assertEquals(res.headers.get("x-request-id"), body.error.requestId);
});

Deno.test("AC16: an unknown sub-path is 404", async () => {
  const handler = createHandler("workouts", {
    "POST /workouts/suggest": () => new Response("{}", { status: 200 }),
  });
  const res = await handler(new Request("http://localhost/workouts/other", { method: "POST" }));
  assertEquals(res.status, 404);
});

Deno.test("AC16: POST /balance (balance fn only serves GET /balance) is 404", async () => {
  const handler = createHandler("balance", {
    "GET /balance": () => new Response("{}", { status: 200 }),
  });
  const res = await handler(new Request("http://localhost/balance", { method: "POST" }));
  assertEquals(res.status, 404);
});

// --- gateway path form: /functions/v1/<fn>[...] (D-0053 §3) --------------------------------

Deno.test(
  "the gateway's full /functions/v1/workouts/suggest path routes to POST /workouts/suggest",
  async () => {
    const handler = createHandler("workouts", {
      "POST /workouts/suggest": () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    });
    const res = await handler(
      new Request("http://localhost/functions/v1/workouts/suggest", { method: "POST" }),
    );
    assertEquals(res.status, 200);
  },
);

Deno.test("the gateway's full /functions/v1/balance path routes to GET /balance", async () => {
  const handler = createHandler("balance", {
    "GET /balance": () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
  });
  const res = await handler(
    new Request("http://localhost/functions/v1/balance?tz=Europe/Stockholm", { method: "GET" }),
  );
  assertEquals(res.status, 200);
});

// --- AC14: 401 never the gateway's own body --------------------------------------------------

Deno.test("AC14: a route that throws unauthorized() returns 401 with the envelope", async () => {
  const handler = createHandler("workouts", {
    "POST /workouts/suggest": () => {
      throw unauthorized();
    },
  });
  const res = await handler(new Request("http://localhost/workouts/suggest", { method: "POST" }));
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error.code, "unauthorized");
  assertMatch(body.error.requestId, REQUEST_ID_RE);
  assertEquals(res.headers.get("x-request-id"), body.error.requestId);
});

// --- AC23: 500 body + no leak -----------------------------------------------------------------

Deno.test(
  "AC23: an unexpected error is mapped to 500 internal with no stack/email in the body",
  async () => {
    const handler = createHandler("workouts", {
      "POST /workouts/suggest": () => {
        throw new Error("db down: user@example.com");
      },
    });
    const res = await handler(new Request("http://localhost/workouts/suggest", { method: "POST" }));
    assertEquals(res.status, 500);
    const body = await res.json();
    assertEquals(body.error.code, "internal");
    assertEquals(body.error.message, "Something went wrong");
    const raw = JSON.stringify(body);
    assert(!raw.includes("user@example.com"));
    assert(!raw.includes("db down"));
  },
);

Deno.test("AC23: internalError() never carries a message with an email", () => {
  const err = internalError();
  assertEquals(err.message, "Something went wrong");
});

Deno.test("requestId format: req_<uuid>", () => {
  assertMatch("req_" + crypto.randomUUID(), REQUEST_ID_RE);
});
