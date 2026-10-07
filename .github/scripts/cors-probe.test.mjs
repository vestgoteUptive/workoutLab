// T-0515: cors-probe.mjs with a fake fetch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { run } from "../../infra/scripts/cors-probe.mjs";

const APP = "https://app.workout.vestgote.com";
const REF = "csgjsdwuxqtuqpuazzpz";

function harness(echo) {
  const calls = [];
  const out = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const origin = init.headers.Origin;
    return { headers: new Headers(echo(origin) ? { "access-control-allow-origin": origin } : {}) };
  };
  return { calls, out, fetchImpl, stdout: (s) => out.push(s) };
}

test("T-0515 AC-1 only the app host reflected: exit 0, 20 bare OPTIONS", async () => {
  const h = harness((o) => o === APP);
  assert.equal(await run({ fetchImpl: h.fetchImpl, stdout: h.stdout }), 0);
  assert.equal(h.calls.length, 20);
  for (const c of h.calls) {
    assert.equal(c.init.method, "OPTIONS");
    assert.equal(c.init.body, undefined);
    assert.ok(!Object.keys(c.init.headers).some((k) => k.toLowerCase() === "authorization"));
    assert.match(c.url, new RegExp(`^https://${REF}\\.supabase\\.co/functions/v1/(workouts|balance|sessions|account)$`));
  }
});

test("T-0515 AC-1 a reflected localhost fails with a table", async () => {
  const h = harness((o) => o === APP || o === "http://localhost:5173");
  assert.equal(await run({ fetchImpl: h.fetchImpl, stdout: h.stdout }), 1);
  assert.ok(h.out.join("\n").includes("workouts http://localhost:5173 reflected"));
});

test("T-0515 AC-1 app host not echoed also fails", async () => {
  const h = harness(() => false);
  assert.equal(await run({ fetchImpl: h.fetchImpl, stdout: h.stdout }), 1);
});
