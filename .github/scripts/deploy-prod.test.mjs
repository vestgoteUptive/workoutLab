// T-0514b: infra/scripts/deploy-prod.sh with stub npx/git/curl. Nothing here deploys.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = join(root, "infra/scripts/deploy-prod.sh");
const KEY = "sb_publishable_" + "A".repeat(24);
const URL_ = "https://csgjsdwuxqtuqpuazzpz.supabase.co";
const HEAD = "a".repeat(40);

function run(args, env = {}, { buildWrites } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "dep-"));
  const log = join(dir, "calls.log");
  const dist = join(dir, "out");
  mkdirSync(join(dist, "apps/web/dist"), { recursive: true });
  mkdirSync(join(dist, "apps/landing/dist"), { recursive: true });
  writeFileSync(log, "");
  const stub = (name, body) => {
    writeFileSync(join(dir, name), `#!/bin/sh\n${body}\n`);
    chmodSync(join(dir, name), 0o755);
  };
  const plant = buildWrites ? `case "$*" in *web*build) printf '%s' "${buildWrites}" > "${dist}/apps/web/dist/a.js";; esac` : "";
  stub("npx", `echo "npx $* url=$VITE_SUPABASE_URL" >> "${log}"\n${plant}`);
  stub("curl", `echo "curl $*" >> "${log}"`);
  stub(
    "git",
    `echo "git $*" >> "${log}"
case "$*" in
  "status --porcelain") printf '%s' "$GIT_DIRTY";;
  "rev-parse --abbrev-ref HEAD") echo "\${GIT_BRANCH:-main}";;
  "rev-parse HEAD") echo "\${GIT_HEAD:-${HEAD}}";;
  "rev-parse origin/main") echo "${HEAD}";;
  "rev-parse --short HEAD") echo aaaaaaa;;
esac`,
  );
  const r = spawnSync("bash", [SCRIPT, ...args], {
    encoding: "utf8",
    env: {
      PATH: `${dir}:${process.env.PATH}`,
      HOME: dir,
      DEPLOY_DIST_ROOT: dist,
      DEPLOY_ENV_FILE: join(dir, "no-such.env"),
      PROD_SUPABASE_PUBLISHABLE_KEY: KEY,
      CLOUDFLARE_API_TOKEN: "cf-token",
      CLOUDFLARE_ACCOUNT_ID: "acct",
      ...env,
    },
  });
  const calls = readFileSync(log, "utf8").split("\n").filter(Boolean);
  return { ...r, calls };
}
const builds = (r) => r.calls.filter((c) => c.startsWith("npx") && / build/.test(c));
const wrangler = (r) => r.calls.filter((c) => c.includes("wrangler"));

test("T-0514b AC-3 no build without a good publishable key", () => {
  const secret = "sb_secret_" + "z".repeat(24);
  for (const env of [{ PROD_SUPABASE_PUBLISHABLE_KEY: "" }, { PROD_SUPABASE_PUBLISHABLE_KEY: secret }]) {
    const r = run([], env);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /PROD_SUPABASE_PUBLISHABLE_KEY/);
    assert.equal(builds(r).length, 0);
    assert.ok(!(r.stdout + r.stderr).includes("z".repeat(8)));
  }
});

test("T-0514b AC-4 build-only by default; upload only with deploy", () => {
  const r = run([]);
  assert.equal(r.status, 0, r.stderr);
  const b = builds(r);
  assert.equal(b.length, 3);
  assert.match(b[0], /design-tokens/);
  assert.match(b[1], /web/);
  assert.match(b[2], /landing/);
  assert.ok(b.every((c) => c.endsWith(`url=${URL_}`)));
  assert.match(r.stdout, /bundle secret scan/);
  assert.match(r.stdout, /^clean$/m);
  assert.equal(wrangler(r).length, 0);
  assert.match(r.stdout.trim(), /re-run with 'deploy' to upload$/);
  assert.doesNotMatch(r.stdout, /DEPLOY_COMPLETE/);

  const d = run(["deploy"]);
  assert.equal(d.status, 0, d.stderr);
  const w = wrangler(d);
  assert.equal(w.length, 2);
  assert.ok(w.every((c) => c.includes("wrangler@4.147.0 pages deploy")));
  assert.match(w[0], /apps\/web\/dist --project-name workoutlab-web --branch main/);
  assert.match(w[1], /apps\/landing\/dist --project-name workoutlab-landing --branch main/);
  const curls = d.calls.filter((c) => c.startsWith("curl"));
  assert.equal(curls.length, 2);
  assert.ok(curls.every((c) => c.startsWith("curl -sI ")));
  assert.match(curls[0], /app\.workout\.vestgote\.com/);
  assert.match(curls[1], /\/\/workout\.vestgote\.com/);
  assert.ok(d.calls.indexOf(curls[0]) > d.calls.indexOf(w[1]));
  assert.match(d.stdout.trim(), /DEPLOY_COMPLETE$/);
});

test("T-0514b AC-4 an unknown argument does nothing", () => {
  const r = run(["yolo"]);
  assert.equal(r.status, 2);
  assert.equal(r.calls.length, 0);
});

test("T-0514b AC-5 git guards stop before any build", () => {
  const cases = [{ GIT_DIRTY: " M file" }, { GIT_BRANCH: "t/T-1-x" }, { GIT_HEAD: "b".repeat(40) }];
  for (const env of cases) {
    const r = run(["deploy"], env);
    assert.notEqual(r.status, 0, JSON.stringify(env));
    assert.equal(r.calls.filter((c) => c.startsWith("npx")).length, 0, JSON.stringify(env));
  }
});

test("T-0514b AC-6 a scan failure stops the upload", () => {
  const r = run(["deploy"], {}, { buildWrites: "x=sb_secret_" + "q".repeat(24) });
  assert.notEqual(r.status, 0);
  assert.equal(wrangler(r).length, 0);
  assert.match(r.stdout, /sb-secret-key/);
  assert.ok(!(r.stdout + r.stderr).includes("q".repeat(8)));
});

test("T-0514b AC-7 README documents the manual deploy", () => {
  const readme = readFileSync(join(root, "infra/deploy/README.md"), "utf8");
  assert.match(readme, /^## Manual production deploy/m);
  for (const s of [
    "infra/scripts/deploy-prod.sh",
    "bundle-secret-scan.mjs",
    "apps/landing/dist",
    "PROD_SUPABASE_PUBLISHABLE_KEY",
    "Rollback",
    "the human runs the manual deploy",
    "PROD_DEPLOY_ENABLED",
  ]) {
    assert.ok(readme.includes(s), s);
  }
  assert.doesNotMatch(readme, /sb_publishable_[A-Za-z0-9_-]{8,}/);
});
