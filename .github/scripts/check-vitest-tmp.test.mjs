import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listVitestPackages, runCheck } from "./check-vitest-tmp.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => path.join(here, "fixtures", "vitest-tmp", name);
const repoRoot = path.resolve(here, "..", "..");

test("T-0441 AC4: a vitest package with no config is flagged for both parts", async () => {
  const findings = await runCheck(fixture("no-config"));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].path, "packages/a/package.json");
  assert.match(findings[0].message, /packages\/a: no vitest config/);
  assert.match(findings[0].message, /redirectVitestTmp/);
  assert.match(findings[0].message, /cleanupVitestTmp/);
});

test("T-0441 AC4: a config with the redirect but no cleanup is flagged for the cleanup only", async () => {
  const findings = await runCheck(fixture("no-cleanup"));
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /cleanupVitestTmp/);
  assert.doesNotMatch(findings[0].message, /redirectVitestTmp/);
});

test("T-0441 AC4: a fixed package passes", async () => {
  assert.deepEqual(await runCheck(fixture("fixed")), []);
});

test("T-0441 AC4: a package whose test script is not vitest is ignored", async () => {
  assert.deepEqual(await runCheck(fixture("not-vitest")), []);
});

test("T-0441 AC4: the real repo has no finding", async () => {
  assert.ok(listVitestPackages(repoRoot).length >= 6, "expected at least 6 vitest packages to be scanned");
  assert.deepEqual(await runCheck(repoRoot), []);
});

test("T-0441 AC5: one vitest run in packages/shared leaves nothing in a fresh TMPDIR or in its redirected vitest-tmp", () => {
  const scratch = mkdtempSync(path.join(tmpdir(), "wl-vitest-tmp-"));
  try {
    const result = spawnSync(
      "npx",
      ["vitest", "run", "test/session-plan.test.ts"],
      {
        cwd: path.join(repoRoot, "packages", "shared"),
        // Node (and tools like vite) may write their own `node-compile-cache` into TMPDIR, as on
        // the GitHub runner. That is not a vitest leak, so switch it off to keep the count exact.
        env: { ...process.env, TMPDIR: scratch, NODE_DISABLE_COMPILE_CACHE: "1" },
        encoding: "utf8",
      },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.deepEqual(readdirSync(scratch), []);
    // The redirect moves the dir under the package, so it must also be cleaned up there.
    const redirected = path.join(repoRoot, "packages", "shared", "node_modules", ".vite", "vitest-tmp");
    assert.equal(existsSync(redirected) ? readdirSync(redirected).length : 0, 0, "vitest-tmp not cleaned up");
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("T-0441 AC4: a call that appears only in a comment is flagged", async () => {
  const findings = await runCheck(fixture("comment-only"));
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /redirectVitestTmp/);
  assert.match(findings[0].message, /cleanupVitestTmp/);
});

function runHelper(env) {
  const code = `
    const mod = await import(${JSON.stringify(path.join(repoRoot, "vitest.tmp.ts"))});
    const { redirectVitestTmp, cleanupVitestTmp } = mod.redirectVitestTmp ? mod : mod.default;
    const before = process.env.TMPDIR ?? "";
    const dir = redirectVitestTmp(${JSON.stringify("file://" + path.join(repoRoot, "packages/shared/vitest.config.ts"))});
    cleanupVitestTmp(dir);
    console.log(JSON.stringify({ changed: (process.env.TMPDIR ?? "") !== before, exit: process.listenerCount("exit"), tmp: process.env.TMPDIR }));
  `;
  const base = { ...process.env };
  delete base.VITEST;
  delete base.WL_VITEST_TMP_DIR;
  const r = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", code], { cwd: path.join(repoRoot, "packages", "shared"), env: { ...base, ...env }, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

test("T-0441 rework: without VITEST=true the helper leaves TMPDIR alone and registers no exit handler", () => {
  const out = runHelper({});
  assert.equal(out.changed, false);
  assert.equal(out.exit, 0);
});

test("T-0441 rework: with VITEST=true the helper redirects TMPDIR into the package and registers cleanup", () => {
  const out = runHelper({ VITEST: "true" });
  assert.equal(out.changed, true);
  assert.ok(out.tmp.endsWith(path.join("packages", "shared", "node_modules", ".vite", "vitest-tmp")));
  assert.equal(out.exit, 1);
  assert.equal(existsSync(out.tmp), false, "the helper's own exit handler removes the folder");
});
