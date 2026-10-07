// T-0402c AC-3 and AC-6 (UF-01.5, D-0185 §4): infra/scripts/auth-patch.mjs is keys-only, prints no
// secret, and refuses to write without --apply and the right CONFIRM_PROD_AUTH.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { run, SPEC_PATH } from "../../infra/scripts/auth-patch.mjs";
import { run as driftRun } from "../../infra/scripts/auth-drift-check.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8"));
// T-0515: these scenarios replay the pre-narrowing prod (T-0402c/T-0404b); the live expected list is now narrower.
const legacySpec = { ...spec, expected: { ...spec.expected, uri_allow_list: `${"http://localhost:3000/**,http://localhost:5173/**,"}https://app.workout.vestgote.com/**,https://*.workoutlab-web.pages.dev/**` } };
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
function fakeServer(initial, { patchStatus = 200, alsoChange, readView } = {}) {
  let state = JSON.parse(JSON.stringify(initial));
  const pre = JSON.parse(JSON.stringify(initial));
  let patched = false;
  let reads = 0; // GETs after the PATCH, 1-based
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const method = init.method ?? "GET";
    calls.push({ url, method, body: init.body, headers: init.headers });
    if (method === "GET") {
      const n = patched ? ++reads : 0;
      const v = readView && n > 0 ? readView(n, JSON.parse(JSON.stringify(state)), pre) : state;
      return { status: 200, json: async () => JSON.parse(JSON.stringify(v)) };
    }
    if (method === "PATCH") {
      patched = true;
      if (patchStatus >= 200 && patchStatus < 300) state = { ...state, ...JSON.parse(init.body), ...(alsoChange ?? {}) };
      return { status: patchStatus, json: async () => ({ message: "SENTINEL-BODY" }) };
    }
    return { status: 405, json: async () => ({}) };
  };
  return { fetchImpl, calls, state: () => state };
}

const ENV = { SUPABASE_ACCESS_TOKEN: "tok-SENTINEL" };

/** Injected snapshot IO and clock: files are kept in memory, sleeps are recorded, never waited. */
function fakeIo({ failWrite = false } = {}) {
  const files = new Map();
  const events = [];
  const io = {
    files,
    events,
    sleeps: [],
    opts: {
      sleep: async (ms) => {
        io.sleeps.push(ms);
      },
      writeFile: (p, data, o) => {
        if (failWrite) throw new Error("EACCES");
        events.push(`write:${path.basename(p)}`);
        files.set(p, { data, mode: o?.mode });
      },
      mkdir: () => {},
      now: () => new Date("2026-10-06T12:34:56.789Z"),
    },
  };
  return io;
}

async function exec(argv, { env = ENV, server = fakeServer(liveConfig()), io = fakeIo() } = {}) {
  const out = [];
  const err = [];
  const code = await run({ argv, env, fetchImpl: server.fetchImpl, stdout: (s) => out.push(s), stderr: (s) => err.push(s), spec, ...io.opts });
  return { code, out: out.join("\n"), err: err.join("\n"), all: [...out, ...err].join("\n"), server, io };
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
  // T-0404b moved the SMTP keys into the expected file, so this live config holds them as
  // T-0404b leaves them; the allow-list entry stays the only difference.
  const live = { ...liveConfig(), ...smtpApplied() };
  const env = { SUPABASE_ACCESS_TOKEN: "tok-SENTINEL", GOOGLE_OAUTH_CLIENT_ID: live.external_google_client_id };
  const drift = async (cfg) => {
    const out = [];
    const code = await driftRun({ fetchImpl: async () => ({ status: 200, json: async () => cfg }), env, stdout: (s) => out.push(s), spec: legacySpec });
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

// ---- T-0404b (UF-01.5): SMTP + templates through the same keys-only PATCH ----
const repoRoot = path.join(here, "../..");
const readme = readFileSync(path.join(repoRoot, "infra/auth/README.md"), "utf8");
const tpl = (f) => readFileSync(path.join(repoRoot, "infra/auth/templates", f), "utf8");
const RESEND_SENTINEL = "re_SENTINEL_RESEND_0123456789";

/** The sh blocks after the T-0404b marker in infra/auth/README.md, as argv after auth-patch.mjs. */
function readmeCommands() {
  const tail = readme.slice(readme.indexOf("<!-- T-0404b args"));
  return [...tail.matchAll(/```sh\n([\s\S]*?)```/g)].slice(0, 2).map((m) => {
    const line = m[1].replace(/\\\n\s*/g, " ").trim();
    const [prefix, args] = line.split("node infra/scripts/auth-patch.mjs");
    return { prefix: prefix.trim(), argv: args.trim().split(/\s+/) };
  });
}

/** Prod as read on 2026-10-05 (null SMTP keys, default subjects/templates), plus filler. */
function prodLike() {
  return {
    ...liveConfig(),
    smtp_host: null,
    smtp_port: null,
    smtp_user: null,
    smtp_pass: null,
    smtp_admin_email: null,
    smtp_sender_name: null,
    rate_limit_email_sent: 2,
    mailer_autoconfirm: false,
    mailer_subjects_magic_link: "Your sign-in link",
    mailer_subjects_confirmation: "Confirm your email address",
    mailer_templates_magic_link_content: "<h2>Magic Link</h2><p><a href=\"{{ .ConfirmationURL }}\">Log In</a></p>",
    mailer_templates_confirmation_content: "<h2>Confirm your signup</h2><p><a href=\"{{ .ConfirmationURL }}\">Confirm</a></p>",
  };
}

/** The 11 keys as the T-0404b apply leaves them. */
function smtpApplied() {
  return {
    smtp_host: "smtp.resend.com",
    smtp_port: "465",
    smtp_user: "resend",
    smtp_pass: RESEND_SENTINEL,
    smtp_admin_email: "no-reply@workout.vestgote.com",
    smtp_sender_name: "workoutLab",
    rate_limit_email_sent: 10,
    mailer_subjects_magic_link: tpl("magic-link.subject.txt"),
    mailer_templates_magic_link_content: tpl("magic-link.html"),
    mailer_subjects_confirmation: tpl("confirmation.subject.txt"),
    mailer_templates_confirmation_content: tpl("confirmation.html"),
  };
}
const ELEVEN = Object.keys(smtpApplied()).sort();
const execAt = (argv, opts) => execT(argv, opts);
async function execT(argv, { env, server, io = fakeIo() }) {
  const out = [];
  const err = [];
  const code = await run({ argv, env, fetchImpl: server.fetchImpl, stdout: (x) => out.push(x), stderr: (x) => err.push(x), spec, cwd: repoRoot, ...io.opts });
  return { code, out: out.join("\n"), err: err.join("\n"), all: [...out, ...err].join("\n"), server, io };
}

test("T-0404b AC-2 the README's preview and apply lines are the same argument list", () => {
  const [preview, apply] = readmeCommands();
  assert.equal(preview.prefix, "set -a; . .env.local; set +a;");
  assert.equal(apply.prefix, `set -a; . .env.local; set +a; CONFIRM_PROD_AUTH=${REF}`);
  assert.deepEqual(apply.argv, [...preview.argv, "--apply"]);
  assert.ok(!preview.argv.includes("--apply"));
});

test("T-0404b AC-2 --apply with the README arguments PATCHes exactly the 11 keys, smtp_pass from env", async () => {
  const [, apply] = readmeCommands();
  const env = { ...ENV, CONFIRM_PROD_AUTH: REF, RESEND_API_KEY: RESEND_SENTINEL };
  const r = await execAt(apply.argv, { env, server: fakeServer(prodLike()) });
  assert.equal(r.code, 0, r.all);
  const w = nonGet(r.server);
  assert.equal(w.length, 1);
  const body = JSON.parse(w[0].body);
  assert.deepEqual(Object.keys(body).sort(), ELEVEN);
  assert.equal(body.smtp_pass, RESEND_SENTINEL);
  assert.equal(body.smtp_port, "465", "the API types smtp_port as a string");
  assert.equal(body.rate_limit_email_sent, 10);
  assert.equal(body.smtp_sender_name, "workoutLab");
  for (const [k, f] of [
    ["mailer_subjects_magic_link", "magic-link.subject.txt"],
    ["mailer_templates_magic_link_content", "magic-link.html"],
    ["mailer_subjects_confirmation", "confirmation.subject.txt"],
    ["mailer_templates_confirmation_content", "confirmation.html"],
  ]) {
    assert.equal(Buffer.compare(Buffer.from(body[k], "utf8"), readFileSync(path.join(repoRoot, "infra/auth/templates", f))), 0, `${k} is ${f} byte for byte`);
  }
  for (const s of [RESEND_SENTINEL, "re_SENTINEL", ...SENTINELS]) assert.ok(!r.all.includes(s), `leaked ${s}`);
  const [before, after] = hashes(r.out);
  assert.ok(before && before === after, "others_sha256 unchanged");
});

test("T-0404b AC-4 preview masks RESEND_API_KEY, shows templates as len+sha256, sends nothing", async () => {
  const [preview] = readmeCommands();
  const env = { ...ENV, RESEND_API_KEY: RESEND_SENTINEL };
  const r = await execAt(preview.argv, { env, server: fakeServer(prodLike()) });
  assert.equal(r.code, 0, r.all);
  assert.equal(nonGet(r.server).length, 0);
  for (const s of [RESEND_SENTINEL, "re_SENTINEL", ...SENTINELS]) assert.ok(!r.all.includes(s), `leaked ${s}`);
  const [beforeView, afterView] = r.out.split("after:");
  assert.ok(beforeView.includes("  smtp_pass = <unset>") && afterView.includes("  smtp_pass = <set>"));
  const html = tpl("magic-link.html");
  const sha = createHash("sha256").update(html).digest("hex");
  assert.ok(afterView.includes(`  mailer_templates_magic_link_content = len=${html.length} sha256=${sha}`));
  assert.ok(!r.all.includes("{{ .Token }}"), "template text is not printed");
  assert.ok(afterView.includes("  smtp_port = 465") && afterView.includes("  mailer_subjects_confirmation = Confirm your workoutLab account"));
  assert.equal(hashes(r.out).length, 1);
  assert.ok(r.out.includes("dry run: nothing sent"));
});

test("T-0404b AC-5 after the apply the extended drift check exits 0", async () => {
  const [, apply] = readmeCommands();
  // T-0402c's allow-list entry is already live on prod.
  const server = fakeServer({ ...prodLike(), uri_allow_list: `${LIVE_LIST},${PREVIEW}` });
  const env = { ...ENV, CONFIRM_PROD_AUTH: REF, RESEND_API_KEY: RESEND_SENTINEL };
  assert.equal((await execAt(apply.argv, { env, server })).code, 0);
  const out = [];
  const code = await driftRun({
    fetchImpl: async () => ({ status: 200, json: async () => server.state() }),
    env: { ...ENV, GOOGLE_OAUTH_CLIENT_ID: fixture.external_google_client_id },
    stdout: (x) => out.push(x),
    spec: legacySpec,
  });
  assert.equal(code, 0, out.join("\n"));
});

test("T-0404b AC-2 a masked secret read back still passes; a dropped one fails the after-check", async () => {
  const [, apply] = readmeCommands();
  const env = { ...ENV, CONFIRM_PROD_AUTH: REF, RESEND_API_KEY: RESEND_SENTINEL };
  const masked = await execAt(apply.argv, { env, server: fakeServer(prodLike(), { alsoChange: { smtp_pass: "******" } }) });
  assert.equal(masked.code, 0, masked.all);
  const dropped = await execAt(apply.argv, { env, server: fakeServer(prodLike(), { alsoChange: { smtp_pass: null } }) });
  assert.equal(dropped.code, 1);
  assert.ok(dropped.err.includes("mismatch: smtp_pass"));
  const port = await execAt(apply.argv, { env, server: fakeServer(prodLike(), { alsoChange: { smtp_port: 465 } }) });
  assert.equal(port.code, 1, "a type change by the server shows as a mismatch");
  assert.ok(port.err.includes("mismatch: smtp_port"));
});

test("T-0404b AC-2 --set-from-file: secret keys refused, missing file refused, zero calls", async () => {
  for (const argv of [
    ["--set-from-file", "smtp_pass=infra/auth/templates/magic-link.html"],
    ["--set-from-file", "mailer_templates_magic_link_content=infra/auth/templates/nope.html"],
    ["--set-from-file", "mailer_templates_magic_link_content="],
  ]) {
    const r = await execAt(argv, { env: ENV, server: fakeServer(prodLike()) });
    assert.equal(r.code, 2, argv.join(" "));
    assert.equal(r.server.calls.length, 0);
  }
});

// ---- T-0509: before/after snapshots and the read-back retry (D-0185 §4) ----
const APPLY_ENV = { ...ENV, CONFIRM_PROD_AUTH: REF };
const OTP = ["--set", "rate_limit_email_sent=12", "--apply"];
const snapCfg = () => ({
  ...liveConfig(),
  smtp_pass: "SENTINEL-PASS",
  mailer_templates_magic_link_content: "<html>SENTINEL-TPL</html>",
  site_url: "https://app.workout.vestgote.com",
  rate_limit_email_sent: 10,
});
const snapFile = (io, kind) => [...io.files.entries()].find(([p]) => p.endsWith(`-${kind}.json`));

test("T-0509 AC-1 the before-snapshot is written before the PATCH, filtered, mode 0600", async () => {
  const server = fakeServer(snapCfg());
  const io = fakeIo();
  const order = [];
  const origFetch = server.fetchImpl;
  server.fetchImpl = async (u, i = {}) => {
    if (i.method === "PATCH") order.push(`patch(after ${io.events.join("+")})`);
    return origFetch(u, i);
  };
  const r = await exec(OTP, { env: APPLY_ENV, server, io });
  assert.equal(r.code, 0, r.all);
  assert.ok(order[0].includes("-before.json"), `snapshot must precede the PATCH: ${order}`);
  const [file, { data, mode }] = snapFile(io, "before");
  assert.ok(file.includes(`${REF}-20261006T123456Z-before.json`), file);
  assert.equal(mode, 0o600);
  const snap = JSON.parse(data);
  assert.deepEqual(Object.keys(snap).sort(), Object.keys(snapCfg()).sort());
  assert.equal(snap.smtp_pass, "<set>");
  assert.match(snap.mailer_templates_magic_link_content, /^len=\d+ sha256=[0-9a-f]{64}$/);
  assert.equal(snap.site_url, "https://app.workout.vestgote.com");
  assert.equal(snap.rate_limit_email_sent, 10, "the before file holds the old value");
  for (const [, f] of io.files) for (const s of ["SENTINEL-PASS", "SENTINEL-TPL"]) assert.ok(!f.data.includes(s), `leaked ${s}`);
});

test("T-0509 AC-2 a snapshot write failure means no PATCH", async () => {
  const r = await exec(OTP, { env: APPLY_ENV, io: fakeIo({ failWrite: true }) });
  assert.equal(r.code, 1);
  assert.ok(r.err.includes("cannot write snapshot; nothing sent"), r.err);
  assert.deepEqual(r.server.calls.map((c) => c.method), ["GET"]);
});

test("T-0509 AC-3 preview mode writes nothing", async () => {
  const io = fakeIo();
  const r = await exec(["--set", "rate_limit_email_sent=12"], { io });
  assert.equal(r.code, 0);
  assert.equal(io.files.size, 0);
  assert.equal(io.events.length, 0);
});

const staleUntil = (n) => (read, state, pre) => (read < n ? { ...state, rate_limit_email_sent: pre.rate_limit_email_sent } : state);

test("T-0509 AC-4 stale read-backs 1 and 2, fresh on 3: settles, sleeps 1 s then 2 s", async () => {
  const io = fakeIo();
  const r = await exec(OTP, { env: APPLY_ENV, server: fakeServer(snapCfg(), { readView: staleUntil(3) }), io });
  assert.equal(r.code, 0, r.all);
  assert.ok(r.out.includes("read-back settled after 3 tries"), r.out);
  assert.deepEqual(io.sleeps, [1000, 2000]);
  assert.ok(!r.err.includes("mismatch"));
  assert.equal(JSON.parse(snapFile(io, "after")[1].data).rate_limit_email_sent, 12);
});

test("T-0509 AC-5 never settles: exit 1, today's mismatch line, sleeps 1, 2, 4, 8 s, snapshots reported", async () => {
  const io = fakeIo();
  const r = await exec(OTP, { env: APPLY_ENV, server: fakeServer(snapCfg(), { readView: staleUntil(99) }), io });
  assert.equal(r.code, 1);
  assert.ok(r.err.includes("mismatch: rate_limit_email_sent live differs from the reviewed after-view"), r.err);
  assert.deepEqual(io.sleeps, [1000, 2000, 4000, 8000]);
  assert.equal(r.server.calls.filter((c) => c.method === "GET").length, 1 + 5);
  assert.ok(r.out.includes("-before.json") && r.out.includes("-after.json"), "snapshot paths are printed for diagnosis");
});

test("T-0509 AC-5 a GET error on every try is a stale try; all five failing exits 1", async () => {
  const io = fakeIo();
  const server = fakeServer(snapCfg());
  const base = server.fetchImpl;
  let patched = false;
  server.fetchImpl = async (u, i = {}) => {
    if (i.method === "PATCH") patched = true;
    if (patched && (i.method ?? "GET") === "GET") return { status: 503, json: async () => ({}) };
    return base(u, i);
  };
  const r = await exec(OTP, { env: APPLY_ENV, server, io });
  assert.equal(r.code, 1);
  assert.ok(r.err.includes("GET HTTP 503 after PATCH; run auth-drift-check.mjs"), r.err);
  assert.deepEqual(io.sleeps, [1000, 2000, 4000, 8000]);
});

test("T-0509 AC-6 others moved is reported on the settled read, and the after-snapshot shows it", async () => {
  const io = fakeIo();
  const readView = (read, state, pre) => {
    if (read < 2) return { ...state, rate_limit_email_sent: pre.rate_limit_email_sent };
    return { ...state, mailer_otp_length: 8 };
  };
  const r = await exec(OTP, { env: APPLY_ENV, server: fakeServer({ ...snapCfg(), mailer_otp_length: 6 }, { readView }), io });
  assert.equal(r.code, 1);
  assert.ok(r.err.includes("others_sha256 changed (keys: mailer_otp_length)"), r.err);
  assert.ok(!r.err.includes("mismatch"));
  assert.equal(JSON.parse(snapFile(io, "after")[1].data).mailer_otp_length, 8);
  assert.deepEqual(io.sleeps, [1000]);
});

test("T-0509 AC-7 infra/auth/.snapshots/ is gitignored", () => {
  const repo = path.join(here, "../..");
  const r = spawnSync("git", ["check-ignore", "infra/auth/.snapshots/x.json"], { cwd: repo });
  assert.equal(r.status, 0);
});
