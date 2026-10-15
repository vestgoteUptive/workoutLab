// T-0928 (D-0228): tests/e2e is linted by `pnpm -w lint`, with the raw-colour rule off there only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
// Dynamic import: check-all allows only node: built-ins as static imports here.
const { ESLint } = await import("eslint");
const eslint = new ESLint({ cwd: repoRoot });
const e2e = (f) => join(repoRoot, "tests", "e2e", f);

test("T-0928 AC1 the e2e tree is lint-clean, and the run is not vacuous", async () => {
  const results = await eslint.lintFiles(["tests/e2e"]);
  assert.ok(results.length >= 50, `only ${results.length} files linted`);
  const prefix = join("tests", "e2e") + sep;
  for (const r of results) assert.ok(relative(repoRoot, r.filePath).startsWith(prefix), r.filePath);
  const problems = results.flatMap((r) =>
    r.messages
      .filter((m) => m.severity === 2)
      .map((m) => `${relative(repoRoot, r.filePath)}:${m.line} ${m.ruleId}`),
  );
  assert.deepEqual(problems, []);
});

test("T-0928 AC2 the rule set applies in tests/e2e, minus the raw-colour rule", async () => {
  const re = await eslint.lintText("export const re = /a  b/;\n", { filePath: e2e("planted.spec.ts") });
  assert.equal(re[0].errorCount, 1);
  assert.equal(re[0].messages[0].ruleId, "no-regex-spaces");
  const colour = 'export const c = "rgb(1, 2, 3)";\n';
  const inE2e = await eslint.lintText(colour, { filePath: e2e("planted.spec.ts") });
  assert.equal(inE2e[0].errorCount, 0);
  const inApp = await eslint.lintText(colour, {
    filePath: join(repoRoot, "apps/web/src/planted.ts"),
  });
  assert.equal(inApp[0].errorCount, 1);
  assert.equal(inApp[0].messages[0].ruleId, "workoutlab/no-raw-colour");
});

test("T-0928 AC3 report directories are ignored", async () => {
  assert.equal(await eslint.isPathIgnored(e2e("test-results/x.js")), true);
  assert.equal(await eslint.isPathIgnored(e2e("playwright-report/trace/x.js")), true);
  assert.equal(await eslint.isPathIgnored(e2e("fixture-guard.spec.ts")), false);
});

test("T-0928 AC4 root lint runs lint:e2e after turbo", () => {
  const { scripts } = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  assert.equal(scripts["lint:e2e"], "eslint tests/e2e");
  assert.ok(scripts.lint.startsWith("turbo run lint"), scripts.lint);
  assert.match(scripts.lint, /&&\s*pnpm lint:e2e/);
});
