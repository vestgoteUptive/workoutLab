import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCheck } from "./check-vitest-tmp.mjs";

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
        env: { ...process.env, TMPDIR: scratch },
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
