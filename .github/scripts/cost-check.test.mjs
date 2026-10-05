// T-0405: cost guard tests (D-0012, D-0186 §6).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluate, run, QUOTAS_PATH, DOC_PATH } from "../../infra/scripts/cost-check.mjs";

const fixtureQuotas = JSON.parse(readFileSync(new URL("./fixtures/cost-check/quotas.json", import.meta.url), "utf8"));
const SB = "SENTINEL_SB_TOKEN_9f3a";
const CF = "SENTINEL_CF_TOKEN_71bc";
const env = { SUPABASE_ACCESS_TOKEN: SB, SUPABASE_ORG_ID: "org1", CLOUDFLARE_API_TOKEN: CF, CLOUDFLARE_ACCOUNT_ID: "acct1" };
const NOW = new Date("2026-10-15T12:00:00Z");

// routes: substring -> {status, body}; unmatched = 404.
function mk({ plan = "free", status = "ACTIVE_HEALTHY", overrides = {}, deployments = [] } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method });
    const table = [
      ["/organizations/", { status: 200, body: { plan } }],
      ["usage.api-requests-count", { status: 200, body: { result: [{ count: 44 }] } }],
      ["/v1/projects/", { status: 200, body: { status } }],
      ["/deployments", { status: 200, body: { result: deployments } }],
      ["/pages/projects", { status: 200, body: { result: [{ name: "web" }] } }],
    ];
    let hit = null;
    for (const [k, v] of Object.entries(overrides)) if (url.includes(k)) hit = v;
    hit ??= table.find(([k]) => url.includes(k))?.[1] ?? { status: 404, body: {} };
    return { status: hit.status, json: async () => hit.body };
  };
  return { fetchImpl, calls };
}
const exec = async (opts = {}, e = env) => {
  const out = [];
  const { fetchImpl, calls } = mk(opts);
  const code = await run({ fetchImpl, env: e, stdout: (s) => out.push(s), now: NOW, quotas: fixtureQuotas, doc: "Build phase" });
  return { code, out, calls };
};

test("T-0405 AC-1 below 80 % is no alert", () => {
  const r = evaluate({ db_size_mb: 399 }, fixtureQuotas);
  assert.deepEqual(r.alerts, []);
});
test("T-0405 AC-1 exactly 80 % alerts", () => {
  const r = evaluate({ db_size_mb: 400 }, fixtureQuotas);
  assert.deepEqual(r.alerts, ["db_size_mb 400/500 80%"]);
});
test("T-0405 AC-1 450 alerts and run exits 2 with ALERT line", async () => {
  assert.equal(evaluate({ db_size_mb: 450 }, fixtureQuotas).alerts.length, 1);
  const q = { metrics: { cloudflare_pages_builds_month: { quota: 10 } } };
  const out = [];
  const dep = Array.from({ length: 9 }, () => ({ created_on: "2026-10-02T00:00:00Z" }));
  const code = await run({ fetchImpl: mk({ deployments: dep }).fetchImpl, env, stdout: (s) => out.push(s), now: NOW, quotas: q, doc: "Build phase" });
  assert.equal(code, 2);
  assert.match(out.at(-1), /^ALERT: cloudflare_pages_builds_month 9\/10 90%/);
});
test("T-0405 AC-1 below threshold run exits 0", async () => {
  assert.equal((await exec()).code, 0);
});

test("T-0405 AC-2 manual metric prints check by hand and never alerts", () => {
  const r = evaluate({ resend_daily_sends: 9999 }, fixtureQuotas);
  assert.ok(r.rows.includes("resend_daily_sends check by hand: Resend dashboard > Emails"));
  assert.deepEqual(r.alerts, []);
});

test("T-0405 AC-3 pro plan in build phase exits 2", async () => {
  const { code, out } = await exec({ plan: "pro" });
  assert.equal(code, 2);
  assert.ok(out.at(-1).startsWith("ALERT: plan is pro, the doc says Free"));
});
test("T-0405 AC-3 paused project exits 2", async () => {
  const { code, out } = await exec({ status: "PAUSED" });
  assert.equal(code, 2);
  assert.match(out.at(-1), /^ALERT: status PAUSED/);
});

test("T-0405 AC-4 every call is a GET", async () => {
  const { calls } = await exec();
  assert.ok(calls.length >= 4);
  assert.ok(calls.every((c) => c.method === "GET"));
});
test("T-0405 AC-4 tokens never appear in output, incl. exit-3 path", async () => {
  const ok = await exec();
  const bad = await exec({ overrides: { "/organizations/": { status: 500, body: { leak: SB + CF } } } });
  assert.equal(bad.code, 3);
  for (const o of [...ok.out, ...bad.out]) {
    assert.ok(!o.includes(SB) && !o.includes(CF));
  }
  assert.ok(bad.out.some((l) => l.includes("HTTP 500")));
  assert.ok(!bad.out.join("").includes("leak"));
});
test("T-0405 AC-4 403 on a metric gives check by hand with exit 0", async () => {
  const { code, out } = await exec({ overrides: { "usage.api-requests-count": { status: 403, body: {} } } });
  assert.equal(code, 0);
  assert.ok(out.some((l) => l.startsWith("supabase_api_requests check by hand") && l.includes("HTTP 403")));
});
test("T-0405 AC-4 deployments before this UTC month are not counted", async () => {
  const dep = [{ created_on: "2026-10-01T00:00:00Z" }, { created_on: "2026-09-30T23:59:59Z" }];
  const { out } = await exec({ deployments: dep });
  assert.ok(out.includes("cloudflare_deployments_month web 1"));
});

test("T-0405 AC-5 the cost doc has no staging row and has monthly actuals", () => {
  const doc = readFileSync(DOC_PATH, "utf8");
  const tableLines = doc.split("\n").filter((l) => l.startsWith("|"));
  assert.ok(!tableLines.some((l) => /staging/i.test(l)));
  const i = doc.indexOf("## Monthly actuals");
  assert.ok(i >= 0);
  const rows = doc.slice(i).split("\n").filter((l) => l.startsWith("|"));
  assert.ok(rows.length >= 3, "header, separator and one data row");
});
test("T-0405 AC-5 every quota has a source URL and a checked date", () => {
  const q = JSON.parse(readFileSync(QUOTAS_PATH, "utf8"));
  for (const [name, m] of Object.entries(q.metrics)) {
    assert.match(m.source ?? "", /^https:\/\//, name);
    assert.match(m.checked ?? "", /^\d{4}-\d{2}-\d{2}$/, name);
  }
});
