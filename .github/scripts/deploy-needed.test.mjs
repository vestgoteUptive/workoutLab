// T-0927 AC1-AC5 (+ workflow wiring for AC4).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decide, parsePaths, selectBase } from "./deploy-needed.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, "deploy-needed.mjs");
const runs = JSON.parse(readFileSync(path.join(here, "fixtures", "deploy-needed", "runs.json"), "utf8"));

test("AC1: only ignorable paths -> false", () => {
  const r = decide([".squad/board.md", "docs/tickets/T-1.md", "Design-docs/docs/x.png", "README.md", "apps/web/NOTES.md", "docs/a/b.txt"]);
  assert.equal(r.deploy, false);
  assert.match(r.reason, /only squad\/docs/);
});

test("AC1: everything not on the allowlist deploys", () => {
  for (const p of [
    "apps/web/src/a.ts", "apps/landing/src/p.astro", "packages/engine/x.ts", "supabase/migrations/1.sql",
    "supabase/functions/f/index.ts", "infra/terraform/m.tf", ".github/workflows/deploy.yml", "package.json",
    "pnpm-lock.yaml", "data/seed.json", "scripts/x.sh", "docsx/a.txt", ".squadron/x", "apps/docs/a.ts",
  ])
    assert.equal(decide([p]).deploy, true, p);
});

test("AC2: mixed ignorable + one deployable -> true", () => {
  assert.equal(decide([".squad/board.md", "supabase/migrations/x.sql"]).deploy, true);
  assert.equal(decide(["supabase/migrations/x.sql", ".squad/board.md"]).deploy, true);
});

test("AC3: empty or unparsable -> true (fail open)", () => {
  for (const bad of [[], null, undefined, "docs/a.md", [""], [42], ["/etc/x.md"], ["../x.md"], ["docs/../apps/a.ts"], ['"docs/\\303.md"'], ["docs/a\0b.md"]])
    assert.equal(decide(bad).deploy, true, JSON.stringify(bad));
});

test("AC3: parsePaths handles NUL and newline lists, rejects non-strings", () => {
  assert.deepEqual(parsePaths("a\0b\0"), ["a", "b"]);
  assert.deepEqual(parsePaths("a\nb\n"), ["a", "b"]);
  assert.equal(parsePaths(undefined), null);
  assert.equal(decide(parsePaths(undefined)).deploy, true);
});

test("AC1/AC3 CLI: stdin lists print deploy=..., garbage mode deploys", () => {
  const cli = (args, input) => spawnSync("node", [script, ...args], { input, encoding: "utf8" }).stdout;
  assert.match(cli(["--paths-stdin"], ".squad/a.md\ndocs/b.md\n"), /^deploy=false$/m);
  assert.match(cli(["--paths-stdin"], ".squad/a.md\napps/x.ts\n"), /^deploy=true$/m);
  assert.match(cli(["--paths-stdin"], ""), /^deploy=true$/m);
  assert.match(cli([], ""), /^deploy=true$/m);
  assert.match(cli(["--head", "nothex"], ""), /^deploy=true$/m);
});

test("AC5: base is the newest run whose production job succeeded, not the previous run", () => {
  // Runs 6 (in progress), 5 (skipped), 4 (cancelled), 3 (failed) are all newer than run 2.
  assert.equal(selectBase(runs), "2".repeat(40));
  assert.equal(selectBase([...runs].reverse()), "2".repeat(40), "order independent");
});

test("AC5: nothing deployed (or malformed input) -> null (caller deploys)", () => {
  assert.equal(selectBase(runs.slice(0, 4)), null);
  assert.equal(selectBase([]), null);
  assert.equal(selectBase(null), null);
  assert.equal(selectBase([{ status: "completed", jobs: [{ name: "production x", conclusion: "success", steps: [{ name: "Deployed abc", conclusion: "success" }] }] }]), null);
});

// Real git: end-to-end of the ancestor + diff part with --head would need gh; cover the rename trap
// and the multi-commit trap through decide on real `git diff` output instead.
test("trap: app change followed by a docs-only head commit still deploys; renames list both paths", () => {
  const d = mkdtempSync(path.join(tmpdir(), "t0927-"));
  const git = (...a) => execFileSync("git", ["-C", d, "-c", "user.email=a@b", "-c", "user.name=n", ...a], { encoding: "utf8" });
  git("init", "-q");
  mkdirSync_(d, "apps/web"); mkdirSync_(d, "docs");
  writeFileSync(path.join(d, "apps/web/a.ts"), "export const a = 1;\n".repeat(20));
  writeFileSync(path.join(d, "docs/n.md"), "x\n");
  git("add", "-A"); git("commit", "-qm", "base");
  const base = git("rev-parse", "HEAD").trim();
  writeFileSync(path.join(d, "apps/web/a.ts"), "export const a = 2;\n".repeat(20));
  git("commit", "-qam", "app change");
  writeFileSync(path.join(d, "docs/n.md"), "y\n");
  git("commit", "-qam", "docs only head");
  const paths = (extra) => parsePaths(git("diff", "--name-only", ...extra, "-z", base, "HEAD"));
  assert.equal(decide(paths(["--no-renames"])).deploy, true, "judging the head commit alone would be wrong");
  // rename app code into docs
  git("mv", "apps/web/a.ts", "docs/a.md"); git("commit", "-qm", "rename");
  const tip = git("rev-parse", "HEAD").trim();
  const prev = git("rev-parse", "HEAD~1").trim();
  const names = parsePaths(git("diff", "--name-only", "--no-renames", "-z", prev, tip));
  assert.deepEqual(names.sort(), ["apps/web/a.ts", "docs/a.md"]);
  assert.equal(decide(names).deploy, true);
  assert.equal(decide(parsePaths(git("diff", "--name-only", "-z", prev, tip))).deploy, false, "without --no-renames the rename hides the app file");
});

test("AC4: the CLI really passes --no-renames and -z to git diff", () => {
  const src = readFileSync(script, "utf8");
  assert.match(src, /"diff", "--name-only", "--no-renames", "-z"/);
});

test("AC4: gate output skips release and production, summary says why, previews untouched", () => {
  const wf = readFileSync(path.join(here, "..", "workflows", "deploy.yml"), "utf8");
  assert.equal((wf.match(/needs\.gate\.outputs\.deploy == 'true'/g) ?? []).length, 2, "release + production");
  assert.match(wf, /Production release and deploy skipped/);
  assert.match(wf, /GITHUB_STEP_SUMMARY/);
  const preview = wf.slice(wf.indexOf("  preview:"), wf.indexOf("  production:\n"));
  assert.doesNotMatch(preview, /gate/);
});

function mkdirSync_(root, rel) {
  execFileSync("mkdir", ["-p", path.join(root, rel)]);
}
