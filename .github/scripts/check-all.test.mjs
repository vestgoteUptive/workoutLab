import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runAll } from "./check-all.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

test("AC21: pnpm check:repo exits 0 on the real repo", () => {
  execFileSync("node", [path.join(__dirname, "check-all.mjs")], {
    cwd: REPO_ROOT,
    stdio: "pipe",
  });
});

test("AC21 (direct): runAll() finds nothing on the real repo", async () => {
  const { ok, findings, fatal } = await runAll();
  assert.equal(fatal, null);
  if (!ok) {
    console.error("check-all findings on real repo:\n", findings);
  }
  assert.deepEqual(findings, []);
});

// T-0320 AC-10: every sub-check is imported *and* spread into runAll's findings. A source
// assertion, because an import with no call site would leave the check silently inert.
test("T-0320 AC-10: runAll imports and calls all six sub-checks", () => {
  const src = readFileSync(path.join(__dirname, "check-all.mjs"), "utf8");
  const SUBCHECKS = [
    ["check-screen-ids.mjs", "runScreenIds"],
    ["check-decision-ids.mjs", "runDecisionIds"],
    ["check-placeholder-tests.mjs", "runPlaceholderTests"],
    ["check-stale-wording.mjs", "runStaleWording"],
    ["check-e2e-wiring.mjs", "runE2eWiring"],
    ["check-lane-paths.mjs", "runLanePaths"],
  ];
  for (const [file, alias] of SUBCHECKS) {
    assert.match(
      src,
      new RegExp(`import\\s*\\{\\s*runCheck as ${alias}\\s*\\}\\s*from\\s*"\\./${file.replace(".", "\\.")}"`),
      `check-all.mjs does not import runCheck as ${alias} from ./${file}`,
    );
    assert.ok(
      new RegExp(`${alias}\\(`).test(src.slice(src.indexOf("export async function runAll"))),
      `check-all.mjs imports ${alias} but never calls it inside runAll`,
    );
  }
});

test("T-0320 AC-10: runAll threads a branch override through to the lane-path check", () => {
  const src = readFileSync(path.join(__dirname, "check-all.mjs"), "utf8");
  assert.match(src, /export async function runAll\(\{\s*branch\s*\}\s*=\s*\{\}\)/);
  assert.match(src, /runLanePaths\(REPO_ROOT,\s*\{\s*branch\s*\}\)/);
});

test("AC22: ci.yml runs pnpm check:repo after pnpm format:check in the checks job", () => {
  const ci = readFileSync(path.join(REPO_ROOT, ".github/workflows/ci.yml"), "utf8");
  const checksJobMatch = ci.match(/checks:[\s\S]*?\n {2}\S/);
  const checksJob = checksJobMatch ? checksJobMatch[0] : ci;
  const formatIdx = checksJob.indexOf("pnpm format:check");
  const checkRepoIdx = checksJob.indexOf("pnpm check:repo");
  assert.ok(formatIdx !== -1, "expected a pnpm format:check step");
  assert.ok(checkRepoIdx !== -1, "expected a pnpm check:repo step");
  assert.ok(checkRepoIdx > formatIdx, "pnpm check:repo must run after pnpm format:check");
});

test("AC22: root package.json scripts.test runs test:repo-checks", () => {
  const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
  assert.match(pkg.scripts.test, /test:repo-checks/);
  assert.equal(pkg.scripts["check:repo"], "node .github/scripts/check-all.mjs");
  assert.equal(pkg.scripts["test:repo-checks"], 'node --test ".github/scripts/*.test.mjs"');
});

test("AC23: scripts under .github/scripts import only node: built-ins", () => {
  const dir = path.join(REPO_ROOT, ".github/scripts");
  const files = readdirSync(dir).filter((f) => f.endsWith(".mjs"));
  assert.ok(files.length > 0);
  const importRe = /^\s*import\s+(?:[^"'\n]+from\s+)?["']([^"']+)["']/gm;
  for (const file of files) {
    const content = readFileSync(path.join(dir, file), "utf8");
    let match;
    importRe.lastIndex = 0;
    while ((match = importRe.exec(content))) {
      const spec = match[1];
      const isNodeBuiltin = spec.startsWith("node:");
      const isLocal = spec.startsWith("./") || spec.startsWith("../");
      assert.ok(
        isNodeBuiltin || isLocal,
        `${file} imports "${spec}", which is neither a node: built-in nor a local file`,
      );
    }
  }
});
