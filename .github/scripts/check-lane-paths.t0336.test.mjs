// T-0336 / D-0183 §1: the diff base nearest HEAD wins, and a missing base fails in CI (T-0337).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveChangedPaths, runCheck } from "./check-lane-paths.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const UF10_TICKET = readFileSync(path.join(__dirname, "fixtures", "lane-paths", "ticket-T-0307a.md"), "utf8");
const X = "apps/web/src/features/UF-10/x.ts";

function fakeGit({ isAncestor }) {
  const calls = [];
  const git = (args) => {
    calls.push(args);
    const j = args.join(" ");
    if (j === "merge-base origin/main HEAD") return "old1111\n";
    if (j === "merge-base main HEAD") return "new2222\n";
    if (j === "merge-base --is-ancestor old1111 new2222") {
      if (isAncestor) return "";
      throw new Error("exit 1");
    }
    if (args[0] === "diff" && j.endsWith("old1111...HEAD")) return `.squad/board.md\n${X}\n`;
    if (args[0] === "diff" && j.endsWith("new2222...HEAD")) return `${X}\n`;
    throw new Error(`unexpected git ${j}`);
  };
  return { git, calls };
}

test("T-0336 AC-1: the nearer local main base wins over a stale origin/main", () => {
  const { git, calls } = fakeGit({ isAncestor: true });
  assert.deepEqual(resolveChangedPaths(git), { changed: [X], note: null, base: "new2222" });
  assert.ok(calls.every((a) => a[0] !== "fetch"));
});

test("T-0336 AC-2: origin/main ahead of local main wins", () => {
  const { git, calls } = fakeGit({ isAncestor: false });
  const r = resolveChangedPaths(git);
  assert.equal(r.base, "old1111");
  assert.ok(calls.some((a) => a[0] === "diff" && a.at(-1) === "old1111...HEAD"));
});

test("T-0336 AC-3: equal bases make no --is-ancestor call", () => {
  const calls = [];
  const git = (args) => {
    calls.push(args);
    if (args[0] === "merge-base") return "abc1234\n";
    return "";
  };
  assert.equal(resolveChangedPaths(git).base, "abc1234");
  assert.ok(!calls.some((a) => a.includes("--is-ancestor")));
});

function sh(root, ...args) {
  return execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

test("T-0336 AC-4: a stale origin/main does not flag squad files (real git, via runCheck)", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lane-paths-t0336-"));
  try {
    const write = (rel, text) => {
      mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      writeFileSync(path.join(root, rel), text);
    };
    mkdirSync(path.join(root, ".squad"), { recursive: true });
    copyFileSync(path.join(REPO_ROOT, ".squad", "ownership.yaml"), path.join(root, ".squad", "ownership.yaml"));
    write(".squad/board.md", "board\n");
    write(X, "export {};\n");
    sh(root, "init", "-q", "-b", "main");
    sh(root, "add", "-A");
    sh(root, "commit", "-q", "-m", "A");
    const a = sh(root, "rev-parse", "HEAD").trim();
    write("docs/tickets/T-0307a-balance-screen.md", UF10_TICKET);
    write(".squad/board.md", "board 2\n");
    sh(root, "add", "-A");
    sh(root, "commit", "-q", "-m", "B");
    sh(root, "update-ref", "refs/remotes/origin/main", a);
    sh(root, "checkout", "-q", "-b", "t/T-0307a-x");
    write(X, "export const x = 1;\n");
    sh(root, "add", "-A");
    sh(root, "commit", "-q", "-m", "work");
    const findings = await runCheck(root, { branch: "t/T-0307a-x", env: {} });
    const lane = findings.filter((f) => f.rule === "lane-path-not-owned" || f.rule === "ticket-not-on-base");
    assert.deepEqual(lane, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function ciRoot() {
  const root = mkdtempSync(path.join(tmpdir(), "lane-paths-t0336-"));
  mkdirSync(path.join(root, ".github", "workflows"), { recursive: true });
  copyFileSync(path.join(REPO_ROOT, ".github", "workflows", "ci.yml"), path.join(root, ".github", "workflows", "ci.yml"));
  return root;
}
async function withLog(fn) {
  const lines = [];
  const orig = console.log;
  console.log = (...a) => lines.push(a.join(" "));
  try {
    return { result: await fn(), lines };
  } finally {
    console.log = orig;
  }
}
const throwing = () => {
  throw new Error("no git");
};
const noBase = (root, env, branch = "t/T-0307a-x", git = throwing) => withLog(() => runCheck(root, { branch, git, env }));

test("T-0336 AC-5: no diff base in CI is a finding; off CI it is a note", async () => {
  const root = ciRoot();
  try {
    for (const CI of ["true", "1"]) {
      const { result } = await noBase(root, { CI });
      const f = result.filter((x) => x.rule === "no-diff-base-in-ci");
      assert.equal(f.length, 1, CI);
      assert.equal(f[0].path, ".github/workflows/ci.yml");
      assert.equal(f[0].line, 1);
      assert.match(f[0].message, /no diff base/i);
      assert.match(f[0].message, /fetch-depth: 0/);
    }
    for (const env of [{}, { CI: "false" }, { CI: "0" }, { CI: "" }]) {
      const { result, lines } = await noBase(root, env);
      assert.ok(!result.some((x) => x.rule === "no-diff-base-in-ci"), JSON.stringify(env));
      assert.ok(lines.some((l) => /no diff base/.test(l)), JSON.stringify(env));
    }
    const { result } = await noBase(root, { CI: "true" }, "main");
    assert.ok(!result.some((x) => x.rule === "no-diff-base-in-ci"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("T-0336 AC-6: a failed diff in CI counts too", async () => {
  const root = ciRoot();
  try {
    const git = (args) => {
      if (args[0] === "merge-base") return "abc\n";
      throw new Error("diff failed");
    };
    const { result } = await noBase(root, { CI: "true" }, "t/T-0307a-x", git);
    assert.equal(result.filter((x) => x.rule === "no-diff-base-in-ci").length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
