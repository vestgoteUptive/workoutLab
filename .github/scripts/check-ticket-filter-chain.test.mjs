import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { mkdirSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkFilterChain, runCheck } from "./check-ticket-filter-chain.mjs";

const RULE = "ticket-filter-chain";

// `node --test` runs sibling *.test.mjs files as separate processes. This is the only test in
// the suite that mutates the real repo's docs/tickets/ (the ticket's own scratch-fault proof,
// AC-5), and check-all.test.mjs's "finds nothing on the real repo" tests read that same
// directory. Without a cross-process lock the two can interleave and the other file's assertion
// sees the scratch file. The lock dir doubles as the lock in check-all.test.mjs.
const REAL_REPO_LOCK_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "..", ".t0496-real-repo.lock");

async function withRealRepoLock(fn) {
  for (;;) {
    try {
      mkdirSync(REAL_REPO_LOCK_DIR);
      break;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      await new Promise((r) => setTimeout(r, 20));
    }
  }
  try {
    return await fn();
  } finally {
    rmdirSync(REAL_REPO_LOCK_DIR);
  }
}

test("T-0496 AC-1: one-line pnpm --filter chains are findings (plain, npx prefix, -F, --filter=)", () => {
  const variants = [
    "`pnpm --filter @workoutlab/engine typecheck lint test` is green.",
    "`npx -y pnpm@10.28.2 --filter @workoutlab/engine typecheck lint test` is green.",
    "`pnpm -F @workoutlab/engine typecheck lint test` is green.",
    "`pnpm --filter=@workoutlab/web typecheck lint test` is green.",
  ];
  for (const bad of variants) {
    const content = `line1\nline2\n${bad}\nline4\n`;
    const findings = checkFilterChain([{ path: "docs/tickets/T-9999-x.md", content }]);
    assert.equal(findings.length, 1, `expected exactly one finding for: ${bad}`);
    assert.equal(findings[0].line, 3);
    assert.equal(findings[0].rule, RULE);
  }
});

test("T-0496 AC-2: a command wrapped across a line break is one finding, at the pnpm line", () => {
  // T-0426's old shape: --filter <pkg> ends line 7, two script names start line 8.
  const wrappedPkgThenScripts =
    "l1\nl2\nl3\nl4\nl5\nl6\n`pnpm -w typecheck lint test --force --concurrency=1` green · `pnpm --filter @workoutlab/web\ntypecheck lint` and `check:repo` green.\n";
  const findings1 = checkFilterChain([{ path: "docs/tickets/T-9999-a.md", content: wrappedPkgThenScripts }]);
  assert.equal(findings1.length, 1, "expected exactly one finding for the pkg-then-scripts wrap");
  assert.equal(findings1[0].line, 7);
  assert.equal(findings1[0].rule, RULE);

  // One script ends line 7, two more script names start line 8.
  const wrappedOneScriptThenTwo =
    "l1\nl2\nl3\nl4\nl5\nl6\n`pnpm --filter @workoutlab/web typecheck\nlint test` and `check:repo` green.\n";
  const findings2 = checkFilterChain([{ path: "docs/tickets/T-9999-b.md", content: wrappedOneScriptThenTwo }]);
  assert.equal(findings2.length, 1, "expected exactly one finding for the one-then-two wrap");
  assert.equal(findings2[0].line, 7);
  assert.equal(findings2[0].rule, RULE);
});

test("T-0496 AC-2: a single-script command on one line is never reported twice", () => {
  // Line 1 alone already names the full bad form; line 2 also starts with a script-ish word,
  // but the one-line match on line 1 must not also fire the wrapped-line branch.
  const content = "`pnpm --filter @workoutlab/engine typecheck lint test` green.\ntest more prose here.\n";
  const findings = checkFilterChain([{ path: "docs/tickets/T-9999-c.md", content }]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 1);
});

test("T-0496 AC-3: allowed forms produce no finding", () => {
  const okTexts = [
    // Three separate backticked per-package commands, one script each.
    "`pnpm --filter @workoutlab/engine typecheck`, `pnpm --filter @workoutlab/engine lint` and " +
      "`pnpm --filter @workoutlab/engine test` are green.",
    // Workspace-root form.
    "`pnpm -w typecheck lint test` is green.",
    // One script then extra CLI args after `--`.
    "`pnpm --filter @workoutlab/engine test -- --run x` is green.",
    // T-0440's real wrap: --filter <pkg> ends one line, a single script name (`test:e2e`)
    // starts the next, with no second script name following it.
    "`pnpm -w typecheck lint test --force --concurrency=1` green · `pnpm --filter @workoutlab/web\ntest:e2e` green (the whole suite) · `format:check` and `check:repo` green.",
  ];
  for (const content of okTexts) {
    const findings = checkFilterChain([{ path: "docs/tickets/T-9999-ok.md", content }]);
    assert.deepEqual(findings, [], `expected no finding for: ${content}`);
  }
});

test("T-0496 AC-3: _template.md's current note produces no finding", async () => {
  const __dirname = path.dirname(new URL(import.meta.url).pathname);
  const repoRoot = path.resolve(__dirname, "..", "..");
  const { readFile } = await import("node:fs/promises");
  const content = await readFile(path.join(repoRoot, "docs/tickets/_template.md"), "utf8");
  const findings = checkFilterChain([{ path: "docs/tickets/_template.md", content }]);
  assert.deepEqual(findings, []);
});

test("T-0496 AC-3: the workspace-root form never matches, even with every script name", () => {
  const findings = checkFilterChain([
    { path: "docs/tickets/T-9999-root.md", content: "`pnpm -w typecheck lint test build` is green.\n" },
  ]);
  assert.deepEqual(findings, []);
});

async function withTempTickets(fn) {
  const tmpRoot = await mkdtemp(path.join(tmpdir(), "t0496-"));
  try {
    await mkdir(path.join(tmpRoot, "docs/tickets/log"), { recursive: true });
    await fn(tmpRoot);
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
}

test("T-0496 AC-4: scope — top-level tickets only, log/ excluded, T-0490's own file exempt", async () => {
  await withTempTickets(async (tmpRoot) => {
    const bad = "`pnpm --filter @workoutlab/engine typecheck lint test` is green.\n";
    await writeFile(path.join(tmpRoot, "docs/tickets/T-1-a.md"), bad);
    await writeFile(path.join(tmpRoot, "docs/tickets/log/T-1.md"), bad);
    await writeFile(
      path.join(tmpRoot, "docs/tickets/T-0490-ticket-filter-one-script-per-command.md"),
      bad,
    );
    const findings = await runCheck(tmpRoot);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].path, "docs/tickets/T-1-a.md");
  });
});

test("T-0496 AC-5: check-all.mjs exits 0 on the real repo, and a planted fault makes it exit 1", async () => {
  await withRealRepoLock(async () => {
    const { execFileSync } = await import("node:child_process");
    const __dirname = path.dirname(new URL(import.meta.url).pathname);
    const repoRoot = path.resolve(__dirname, "..", "..");
    const checkAllPath = path.join(__dirname, "check-all.mjs");

    // Clean run first (recorded as the "before" run in the ticket log).
    execFileSync("node", [checkAllPath], { cwd: repoRoot, stdio: "pipe" });

    const faultPath = path.join(repoRoot, "docs/tickets/T-9998-fault.md");
    await writeFile(faultPath, "`pnpm --filter @workoutlab/engine typecheck lint test` is green.\n");
    try {
      let threw = false;
      let output = "";
      try {
        execFileSync("node", [checkAllPath], { cwd: repoRoot, stdio: "pipe" });
      } catch (err) {
        threw = true;
        output = `${err.stdout ?? ""}${err.stderr ?? ""}`;
      }
      assert.ok(threw, "expected check-all.mjs to exit non-zero with the planted fault present");
      assert.match(output, /T-9998-fault\.md/);
      assert.match(output, new RegExp(RULE));
    } finally {
      await rm(faultPath, { force: true });
    }

    // Clean again after deleting the scratch file.
    execFileSync("node", [checkAllPath], { cwd: repoRoot, stdio: "pipe" });
  });
});
