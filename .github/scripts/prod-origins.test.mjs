// T-0515: infra/scripts/prod-origins.sh with stub npx/node/sleep on PATH.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, mkdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = join(root, "infra/scripts/prod-origins.sh");
const REF = "csgjsdwuxqtuqpuazzpz";

function run(args, env = {}, script = SCRIPT) {
  const dir = mkdtempSync(join(tmpdir(), "po-"));
  const log = join(dir, "calls.log");
  writeFileSync(log, "");
  for (const [name, body] of Object.entries({
    npx: `echo "npx $*" >> "${log}"\necho "SENTINEL-DIGEST ALLOWED_ORIGINS"`,
    node: `echo "node $*" >> "${log}"\necho "preview SENTINEL-NODE"`,
    sleep: `echo "sleep $*" >> "${log}"`,
  })) {
    writeFileSync(join(dir, name), `#!/bin/sh\n${body}\n`);
    chmodSync(join(dir, name), 0o755);
  }
  const r = spawnSync("bash", [script, ...args], {
    encoding: "utf8",
    env: { PATH: `${dir}:${process.env.PATH}`, HOME: dir, SUPABASE_ACCESS_TOKEN: "tok", ...env },
  });
  return { ...r, calls: readFileSync(log, "utf8").split("\n").filter(Boolean) };
}

test("T-0515 AC-2 plan is the default and read-only", () => {
  const r = run([]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.calls.length, 3);
  assert.match(r.calls[0], /^npx -y supabase@2\.118\.0 secrets list --project-ref csgjsdwuxqtuqpuazzpz$/);
  assert.match(r.calls[1], /^node infra\/scripts\/auth-patch\.mjs --set uri_allow_list=https:\/\/app\.workout\.vestgote\.com\/\*\*,https:\/\/\*\.workoutlab-web\.pages\.dev\/\*\*$/);
  assert.match(r.calls[2], /cors-probe\.mjs$/);
  for (const c of r.calls) assert.doesNotMatch(c, /secrets set|--apply/);
  assert.match(r.stdout, /would set secret ALLOWED_ORIGINS=https:\/\/app\.workout\.vestgote\.com/);
  assert.doesNotMatch(r.stdout + r.stderr, /SENTINEL-DIGEST/);
});

test("T-0515 AC-2 apply without the lock refuses with no call", () => {
  for (const env of [{}, { CONFIRM_PROD_AUTH: "wrong" }]) {
    const r = run(["apply"], env);
    assert.notEqual(r.status, 0);
    assert.equal(r.calls.length, 0);
    assert.match(r.stderr, /CONFIRM_PROD_AUTH/);
  }
});

test("T-0515 AC-2 apply with the lock runs the four steps in order", () => {
  const r = run(["apply"], { CONFIRM_PROD_AUTH: REF });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.calls.length, 5);
  assert.equal(r.calls[0], `npx -y supabase@2.118.0 secrets set ALLOWED_ORIGINS=https://app.workout.vestgote.com --project-ref ${REF}`);
  assert.match(r.calls[1], /auth-patch\.mjs --set uri_allow_list=\S+ --apply$/);
  assert.equal(r.calls[2], "sleep 10");
  assert.match(r.calls[3], /cors-probe\.mjs$/);
  assert.match(r.calls[4], /auth-drift-check\.mjs$/);
});

test("T-0515 AC-2 planted fault: dropping the lock check is detected", () => {
  const dir = mkdtempSync(join(tmpdir(), "fault-"));
  mkdirSync(join(dir, "infra/scripts"), { recursive: true });
  const orig = readFileSync(SCRIPT, "utf8");
  const src = orig.replace('"${CONFIRM_PROD_AUTH:-}" != "$PROD_REF"', '"x" != "x"');
  assert.notEqual(src, orig);
  writeFileSync(join(dir, "infra/scripts/prod-origins.sh"), src);
  const r = run(["apply"], {}, join(dir, "infra/scripts/prod-origins.sh"));
  assert.ok(r.calls.length > 0, "fault must make the zero-call assertion fail");
});

test("T-0515 AC-2 the script's ref and values are the reviewed ones", () => {
  const src = readFileSync(SCRIPT, "utf8");
  const spec = JSON.parse(readFileSync(join(root, "infra/auth/expected-auth.json"), "utf8"));
  assert.equal(src.match(/^PROD_REF="([a-z0-9]+)"/m)[1], spec.project_ref);
  assert.equal(src.match(/^ALLOW_LIST="([^"]+)"/m)[1], spec.expected.uri_allow_list);
});

test("T-0515 AC-3 expected uri_allow_list is the narrowed set", () => {
  const spec = JSON.parse(readFileSync(join(root, "infra/auth/expected-auth.json"), "utf8"));
  const list = spec.expected.uri_allow_list.split(",");
  assert.deepEqual(new Set(list), new Set(["https://app.workout.vestgote.com/**", "https://*.workoutlab-web.pages.dev/**"]));
  assert.ok(!list.some((e) => e.includes("localhost")));
});
