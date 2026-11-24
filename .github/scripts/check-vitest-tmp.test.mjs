import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
    // T-0934 AC7 (D-0271): the parent may stay (empty), but no run folder may be left in it.
    assert.deepEqual(existsSync(redirected) ? readdirSync(redirected) : [], [], "a vitest run folder was not cleaned up");
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
  assert.match(out.tmp, /packages[\\/]shared[\\/]node_modules[\\/]\.vite[\\/]vitest-tmp[\\/]\d+-\d+$/);
  assert.equal(out.exit, 1);
  assert.equal(existsSync(out.tmp), false, "the helper's own exit handler removes the folder");
});

// ---- T-0934 (D-0271): one folder per run ----
const sharedDir = path.join(repoRoot, "packages", "shared");
const parentDir = path.join(sharedDir, "node_modules", ".vite", "vitest-tmp");
const cleanEnv = () => {
  const base = { ...process.env, VITEST: "true" };
  delete base.WL_VITEST_TMP_DIR;
  return base;
};
const childCode = (body) => `
  const mod = await import(${JSON.stringify(path.join(repoRoot, "vitest.tmp.ts"))});
  const { redirectVitestTmp, cleanupVitestTmp } = mod.redirectVitestTmp ? mod : mod.default;
  const dir = redirectVitestTmp(${JSON.stringify("file://" + path.join(sharedDir, "vitest.config.ts"))});
  cleanupVitestTmp(dir);
  ${body}
`;
const nodeArgs = (code) => ["--import", "tsx", "--input-type=module", "-e", code];
const runSync = (body, env = cleanEnv()) => {
  const r = spawnSync(process.execPath, nodeArgs(childCode(body)), { cwd: sharedDir, env, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r;
};
const lastJson = (r) => JSON.parse(r.stdout.trim().split("\n").pop());
const runFolders = () => (existsSync(parentDir) ? readdirSync(parentDir) : []);

test("T-0934 AC1: run A exiting does not delete run B's folder or marker file", async () => {
  const scratch = mkdtempSync(path.join(tmpdir(), "wl-vitest-tmp-"));
  const bBody = `
    const fs = await import("node:fs");
    const marker = process.env.TMPDIR + "/marker.txt";
    fs.writeFileSync(marker, "x");
    console.log("ready");
    process.stdin.once("data", () => { console.log(JSON.stringify({ alive: fs.existsSync(marker) })); process.exit(0); });
  `;
  const b = spawn(process.execPath, nodeArgs(childCode(bBody)), { cwd: sharedDir, env: cleanEnv(), stdio: ["pipe", "pipe", "pipe"] });
  try {
    let out = "";
    const lines = new Promise((resolve) => b.stdout.on("data", (d) => { out += d; if (out.includes("ready")) resolve(); }));
    await Promise.race([lines, new Promise((_, rej) => setTimeout(() => rej(new Error("B never became ready")), 60000))]);
    runSync("");
    const done = new Promise((resolve) => b.on("close", resolve));
    b.stdin.write("check\n");
    await done;
    assert.deepEqual(JSON.parse(out.trim().split("\n").pop()), { alive: true });
  } finally {
    b.kill();
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("T-0934 AC2: the run folder is <package>/node_modules/.vite/vitest-tmp/<pid>-<startMs>, exported and created", () => {
  const r = runSync(`console.log(JSON.stringify({ dir, tmp: process.env.TMPDIR, wl: process.env.WL_VITEST_TMP_DIR, exists: (await import("node:fs")).existsSync(dir) }));`);
  const out = lastJson(r);
  assert.ok(out.dir.startsWith(parentDir + path.sep), out.dir);
  assert.match(path.basename(out.dir), /^\d+-\d+$/);
  assert.equal(path.dirname(out.dir), parentDir);
  assert.equal(out.tmp, out.dir);
  assert.equal(out.wl, out.dir);
  assert.equal(out.exists, true);
});

test("T-0934 AC3: at exit a run removes only its own folder, not a live sibling or the parent", () => {
  const sibling = path.join(parentDir, `${process.pid}-1`);
  mkdirSync(sibling, { recursive: true });
  try {
    const out = lastJson(runSync(`console.log(JSON.stringify({ dir }));`));
    assert.equal(existsSync(out.dir), false, "own folder should be gone");
    assert.equal(existsSync(sibling), true, "live sibling must stay");
    assert.equal(existsSync(parentDir), true, "parent must stay");
  } finally {
    rmSync(sibling, { recursive: true, force: true });
  }
});

test("T-0934 AC4: at start a run prunes folders of dead pids and keeps live ones", () => {
  const deadPid = Number(lastJson(spawnSync(process.execPath, ["-e", "console.log(JSON.stringify(process.pid))"], { encoding: "utf8" })));
  const dead = path.join(parentDir, `${deadPid}-1`);
  const live = path.join(parentDir, `${process.pid}-1`);
  mkdirSync(dead, { recursive: true });
  writeFileSync(path.join(dead, "f"), "x");
  mkdirSync(live, { recursive: true });
  try {
    runSync(`console.log(JSON.stringify({ dir }));`);
    assert.equal(existsSync(dead), false, "dead pid folder should be pruned");
    assert.equal(existsSync(live), true, "live pid folder must be kept");
  } finally {
    rmSync(dead, { recursive: true, force: true });
    rmSync(live, { recursive: true, force: true });
  }
});

test("T-0934 AC5: an inherited WL_VITEST_TMP_DIR is returned as is, with no new folder and no exit handler", () => {
  const scratch = mkdtempSync(path.join(tmpdir(), "wl-vitest-tmp-"));
  // T-1017: a real, writable folder. A made-up `/inherited-tmp` works as root but CI runs as a
  // normal user, and tsx writes its cache under TMPDIR (EACCES on GitHub Actions).
  const inherited = mkdtempSync(path.join(tmpdir(), "wl-inherited-tmp-"));
  try {
    const before = runFolders();
    const r = runSync(
      `console.log(JSON.stringify({ dir, exit: process.listenerCount("exit"), tmp: process.env.TMPDIR }));`,
      { ...cleanEnv(), WL_VITEST_TMP_DIR: scratch, TMPDIR: inherited },
    );
    const out = lastJson(r);
    assert.equal(out.dir, scratch);
    assert.equal(out.exit, 0);
    assert.equal(out.tmp, inherited);
    assert.deepEqual(runFolders(), before);
    assert.equal(existsSync(scratch), true);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
    rmSync(inherited, { recursive: true, force: true });
  }
});

test("T-0934 AC5: without VITEST=true no folder is created and no exit handler is registered", () => {
  const before = runFolders();
  const env = cleanEnv();
  delete env.VITEST;
  const out = lastJson(runSync(`console.log(JSON.stringify({ dir, exit: process.listenerCount("exit") }));`, env));
  assert.equal(out.dir, "");
  assert.equal(out.exit, 0);
  assert.deepEqual(runFolders(), before);
});
