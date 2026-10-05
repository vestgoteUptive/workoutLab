import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { run, SPEC_PATH } from "../../infra/scripts/auth-drift-check.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(here, "../../infra/scripts/auth-drift-check.mjs");
const full = JSON.parse(readFileSync(path.join(here, "fixtures/auth-drift/full.json"), "utf8"));
const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8"));
const env = { SUPABASE_ACCESS_TOKEN: "tok-x", GOOGLE_OAUTH_CLIENT_ID: full.external_google_client_id };

async function exec(raw, { argv = [], status = 200, e = env, body } = {}) {
  const calls = [];
  const out = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { status, json: async () => body ?? raw };
  };
  const code = await run({ fetchImpl, env: e, argv, stdout: (s) => out.push(s), spec });
  return { code, calls, text: out.join("\n") };
}
const withList = (v) => ({ ...full, uri_allow_list: v });

test("T-0500 AC-1 filter before print: no secrets or raw client id in output", async () => {
  const cases = [
    await exec(full),
    await exec(full, { argv: ["--print"] }),
    await exec({ ...full, site_url: "https://elsewhere.test" }),
    await exec(full, { status: 500, body: full }),
  ];
  for (const c of cases) {
    for (const s of ["SENTINEL-SMTP", "SENTINEL-GOOGLE", full.external_google_client_id]) {
      assert.ok(!c.text.includes(s), `leaked ${s}`);
    }
  }
  const printed = JSON.parse(cases[1].text);
  assert.deepEqual(Object.keys(printed).sort(), [...spec.keys, ...spec.derived].sort());
});

test("T-0500 AC-2 GET only, one call", async () => {
  const r = await exec(full);
  assert.equal(r.calls.length, 1);
  assert.ok([undefined, "GET"].includes(r.calls[0].init?.method));
  assert.ok(r.calls[0].url.endsWith("/config/auth"));
  const src = readFileSync(scriptPath, "utf8");
  for (const m of ["PATCH", "POST", "PUT", "DELETE"]) assert.ok(!src.includes(m), m);
});

test("T-0500 AC-3 allow-list order does not count", async () => {
  assert.equal((await exec(full)).code, 0);
  const miss = await exec(withList("http://localhost:3000/**,https://app.workout.vestgote.com/**"));
  assert.equal(miss.code, 1);
  assert.ok(miss.text.includes("missing [http://localhost:5173/**]"));
  const extra = await exec(withList(full.uri_allow_list + ",https://*.workoutlab-web.pages.dev/**"));
  assert.equal(extra.code, 1);
  assert.ok(extra.text.includes("extra [https://*.workoutlab-web.pages.dev/**]"));
});

test("T-0500 AC-4 drift and errors", async () => {
  const site = await exec({ ...full, site_url: "https://app.workout.vestgote.com" });
  assert.equal(site.code, 1);
  assert.ok(site.text.includes("site_url: expected http://localhost:3000, live https://app.workout.vestgote.com"));
  const id = await exec(full, { e: { ...env, GOOGLE_OAUTH_CLIENT_ID: "other" } });
  assert.equal(id.code, 1);
  assert.ok(id.text.includes("external_google_client_id_matches"));
  const { mailer_otp_length, ...rest } = full;
  const absent = await exec(rest);
  assert.equal(absent.code, 1);
  assert.ok(absent.text.includes("live <absent>"));
  const err = await exec(full, { status: 401, body: { message: "SENTINEL-BODY" } });
  assert.equal(err.code, 2);
  assert.ok(err.text.includes("401") && !err.text.includes("SENTINEL-BODY"));
});

test("T-0500 AC-5 expected file is secret-free", () => {
  checkSpec(spec);
});

function checkSpec(s) {
  const derived = new Set(s.derived);
  for (const n of [...s.keys, ...s.derived, ...Object.keys(s.expected)]) {
    if (/(_set|_matches)$/.test(n) && derived.has(n)) continue;
    assert.ok(!/secret|pass|token/.test(n), `suspicious name ${n}`);
  }
  assert.ok(!/(sbp_|GOCSPX-|re_[A-Za-z0-9]{8,})/.test(JSON.stringify(s.expected)));
  const all = new Set([...s.keys, ...s.derived]);
  for (const k of Object.keys(s.expected)) assert.ok(all.has(k), `${k} not in keys/derived`);
  for (const d of s.derived) assert.equal(typeof s.expected[d], "boolean");
}

test("T-0500 AC-5 planted fault: smtp_pass in keys is rejected", () => {
  assert.throws(() => checkSpec({ ...spec, keys: [...spec.keys, "smtp_pass"] }));
});
