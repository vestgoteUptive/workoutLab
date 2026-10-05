// T-0402c AC-3 and AC-6 (UF-01.5, D-0185 §4): infra/scripts/auth-patch.mjs is keys-only, prints no
// secret, and refuses to write without --apply and the right CONFIRM_PROD_AUTH.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { run, SPEC_PATH } from "../../infra/scripts/auth-patch.mjs";
import { run as driftRun } from "../../infra/scripts/auth-drift-check.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8"));
const REF = spec.project_ref;
const PREVIEW = "https://*.workoutlab-web.pages.dev/**";
const LIVE_LIST = "http://localhost:3000/**,https://app.workout.vestgote.com/**,http://localhost:5173/**";
const SENTINELS = ["SENTINEL-SMTP", "SENTINEL-GOOGLE", "SENTINEL-HOOK", "SENTINEL-TWILIO", "SENTINEL-HOST", "SENTINEL-ENV", "tok-SENTINEL"];
const fixture = JSON.parse(readFileSync(path.join(here, "fixtures/auth-patch/live.json"), "utf8"));

/** The fixture's named keys plus filler, to 120 keys in all. */
function liveConfig() {
  const cfg = { ...fixture };
  for (let i = 0; Object.keys(cfg).length < 120; i++) cfg[`filler_${String(i).padStart(3, "0")}`] = i % 3 === 0 ? i : `v${i}`;
  return cfg;
}

/** A fake Management API: GET returns the state, PATCH merges the body (and `alsoChange`). */
function fakeServer(initial, { patchStatus = 200, alsoChange } = {}) {
  let state = structuredClone(initial);
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const method = init.method ?? "GET";
    calls.push({ url, method, body: init.body, headers: init.headers });
    if (method === "GET") return { status: 200, json: async () => structuredClone(state) };
    if (method === "PATCH") {
      if (patchStatus >= 200 && patchStatus < 300) state = { ...state, ...JSON.parse(init.body), ...(alsoChange ?? {}) };
      return { status: patchStatus, json: async () => ({ message: "SENTINEL-BODY" }) };
    }
    return { status: 405, json: async () => ({}) };
  };
  return { fetchImpl, calls, state: () => state };
}

const ENV = { SUPABASE_ACCESS_TOKEN: "tok-SENTINEL" };

async function exec(argv, { env = ENV, server = fakeServer(liveConfig()) } = {}) {
  const out = [];
  const err = [];
  const code = await run({ argv, env, fetchImpl: server.fetchImpl, stdout: (s) => out.push(s), stderr: (s) => err.push(s), spec });
  return { code, out: out.join("\n"), err: err.join("\n"), all: [...out, ...err].join("\n"), server };
}
const nonGet = (s) => s.calls.filter((c) => c.method !== "GET");
const hashes = (text) => [...text.matchAll(/others_sha256=([0-9a-f]{64})/g)].map((m) => m[1]);
const addPreview = ["--add-to-list", `uri_allow_list=${PREVIEW}`];

test("T-0402c AC-3 the fake live config has 120 keys and the sentinels", () => {
  const cfg = liveConfig();
  assert.equal(Object.keys(cfg).length, 120);
  const raw = JSON.stringify(cfg);
  for (const s of SENTINELS.filter((x) => !["SENTINEL-ENV", "tok-SENTINEL"].includes(x))) assert.ok(raw.includes(s), s);
  assert.equal(cfg.uri_allow_list, LIVE_LIST);
});

test("T-0402c AC-3 --apply with the right CONFIRM_PROD_AUTH sends exactly one keys-only PATCH", async () => {
  const r = await exec([...addPreview, "--apply"], { env: { ...ENV, CONFIRM_PROD_AUTH: REF } });
  assert.equal(r.code, 0, r.all);
  const w = nonGet(r.server);
  assert.equal(w.length, 1);
  assert.equal(w[0].method, "PATCH");
  assert.equal(w[0].url, `https://api.supabase.com/v1/projects/${REF}/config/auth`);
  const body = JSON.parse(w[0].body);
  assert.deepEqual(Object.keys(body), ["uri_allow_list"]);
  assert.equal(body.uri_allow_list, `${LIVE_LIST},${PREVIEW}`, "live order kept, new entry appended");
  assert.equal(r.server.state().uri_allow_list, `${LIVE_LIST},${PREVIEW}`);
  const [before, after] = hashes(r.out);
  assert.ok(before && before === after, "others_sha256 unchanged");
});

test("T-0402c AC-3 no --apply, or a wrong/missing CONFIRM_PROD_AUTH: zero non-GET calls", async () => {
  const dry = await exec(addPreview);
  assert.equal(dry.code, 0);
  assert.equal(nonGet(dry.server).length, 0);
  assert.ok(dry.out.includes(`  uri_allow_list = ${LIVE_LIST}`));
  assert.ok(dry.out.includes(`  uri_allow_list = ${LIVE_LIST},${PREVIEW}`));
  assert.equal(hashes(dry.out).length, 1);
  for (const confirm of [undefined, "", "wrong-ref", REF.toUpperCase()]) {
    const env = confirm === undefined ? ENV : { ...ENV, CONFIRM_PROD_AUTH: confirm };
    const r = await exec([...addPreview, "--apply"], { env });
    assert.equal(r.code, 1, `confirm=${confirm}`);
    assert.equal(r.server.calls.length, 0, "refusal makes zero calls");
  }
});

test("T-0402c AC-3 no sentinel reaches stdout or stderr, --set-from-env shows <set>", async () => {
  const env = { ...ENV, CONFIRM_PROD_AUTH: REF, RESEND_API_KEY: "SENTINEL-ENV" };
  const cfg = { ...liveConfig(), smtp_pass: "" };
  const runs = [
    await exec(addPreview),
    await exec([...addPreview, "--apply"], { env }),
    await exec(["--set-from-env", "smtp_pass=RESEND_API_KEY"], { env, server: fakeServer(cfg) }),
    await exec(["--set-from-env", "smtp_pass=RESEND_API_KEY", "--apply"], { env, server: fakeServer(cfg) }),
    await exec([...addPreview, "--apply"], { env, server: fakeServer(liveConfig(), { patchStatus: 500 }) }),
    await exec([...addPreview, "--apply"], { env, server: fakeServer(liveConfig(), { alsoChange: { smtp_host: "SENTINEL-HOST-2" } }) }),
    await exec(["--set", "smtp_pass=SENTINEL-ENV"], { env }),
  ];
  for (const r of runs) for (const s of [...SENTINELS, "SENTINEL-BODY"]) assert.ok(!r.all.includes(s), `leaked ${s}: ${r.all}`);
  assert.ok(runs[2].out.includes("  smtp_pass = <unset>") && runs[2].out.includes("  smtp_pass = <set>"));
  assert.equal(runs[3].code, 0, runs[3].all);
  assert.deepEqual(JSON.parse(nonGet(runs[3].server)[0].body), { smtp_pass: "SENTINEL-ENV" });
  assert.equal(runs[4].code, 1);
  assert.ok(runs[4].err.includes("HTTP 500"));
  assert.equal(runs[6].code, 2, "--set on a secret key is refused");
  assert.equal(runs[6].server.calls.length, 0);
});

test("T-0402c AC-3 others_sha256 differs and exit 1 when the server also moves another key", async () => {
  const r = await exec([...addPreview, "--apply"], {
    env: { ...ENV, CONFIRM_PROD_AUTH: REF },
    server: fakeServer(liveConfig(), { alsoChange: { jwt_exp: 7200 } }),
  });
  assert.equal(r.code, 1);
  const [before, after] = hashes(r.out);
  assert.ok(before && after && before !== after);
  assert.ok(r.err.includes("others_sha256 changed (keys: jwt_exp)"));
});

test("T-0402c AC-3 an entry already live is a no-op: no PATCH even with --apply", async () => {
  const cfg = { ...liveConfig(), uri_allow_list: `${LIVE_LIST},${PREVIEW}` };
  const r = await exec([...addPreview, "--apply"], { env: { ...ENV, CONFIRM_PROD_AUTH: REF }, server: fakeServer(cfg) });
  assert.equal(r.code, 0);
  assert.equal(nonGet(r.server).length, 0);
  assert.ok(r.out.includes("no change"));
});

test("T-0402c AC-3 --set coerces to the live type and bad input makes no call", async () => {
  const r = await exec(["--set", "mailer_otp_length=8", "--apply"], { env: { ...ENV, CONFIRM_PROD_AUTH: REF } });
  assert.equal(r.code, 0, r.all);
  assert.deepEqual(JSON.parse(nonGet(r.server)[0].body), { mailer_otp_length: 8 });
  for (const argv of [["--set", "external_email_enabled=maybe"], ["--add-to-list", "uri_allow_list=a,b"], ["--bogus"], []]) {
    const bad = await exec(argv);
    assert.equal(bad.code, 2, argv.join(" "));
    assert.equal(nonGet(bad.server).length, 0);
  }
});

test("T-0402c AC-6 drift check: exactly one difference before the apply, none after", async () => {
  const live = liveConfig();
  const env = { SUPABASE_ACCESS_TOKEN: "tok-SENTINEL", GOOGLE_OAUTH_CLIENT_ID: live.external_google_client_id };
  const drift = async (cfg) => {
    const out = [];
    const code = await driftRun({ fetchImpl: async () => ({ status: 200, json: async () => cfg }), env, stdout: (s) => out.push(s), spec });
    return { code, out };
  };
  const before = await drift(live);
  assert.equal(before.code, 1);
  assert.deepEqual(before.out, [`uri_allow_list: missing [${PREVIEW}]`]);
  const server = fakeServer(live);
  const r = await exec([...addPreview, "--apply"], { env: { ...ENV, CONFIRM_PROD_AUTH: REF }, server });
  assert.equal(r.code, 0);
  const after = await drift(server.state());
  assert.equal(after.code, 0, after.out.join("\n"));
});

test("T-0402c AC-3 the script source PATCHes only the auth config endpoint", () => {
  const src = readFileSync(path.join(here, "../../infra/scripts/auth-patch.mjs"), "utf8");
  for (const m of ['"POST"', '"PUT"', '"DELETE"']) assert.ok(!src.includes(m), m);
  assert.equal(src.match(/method: "PATCH"/g)?.length, 1);
});
