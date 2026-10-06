// T-0508: the prod scripts and their tests stay lint-clean (D-0190 §6).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
// Dynamic import: check-all AC23 allows only node: built-ins as static imports, and eslint
// is the root devDependency (T-0508).
const { ESLint } = await import("eslint");
const eslint = new ESLint({ cwd: repoRoot });

function targets() {
  const dir = join(repoRoot, "infra", "scripts");
  const scripts = readdirSync(dir)
    .filter((f) => f.endsWith(".mjs"))
    .map((f) => join(dir, f));
  return [...scripts, join(repoRoot, ".github", "scripts", "auth-drift-check.test.mjs")];
}

test("T-0508 AC-1 infra scripts and auth-drift-check test are lint-clean", async () => {
  const files = targets();
  assert.ok(files.length >= 5);
  const results = await eslint.lintFiles(files);
  const problems = results.flatMap((r) =>
    r.messages
      .filter((m) => m.severity === 2)
      .map((m) => `${relative(repoRoot, r.filePath)}:${m.line} ${m.ruleId}`),
  );
  assert.deepEqual(problems, []);
});

test("T-0508 AC-2 the Node globals are scoped to infra/scripts", async () => {
  const code = 'fetch("x"); process.exit(1);';
  const inInfra = await eslint.lintText(code, { filePath: join(repoRoot, "infra/scripts/x.mjs") });
  assert.equal(inInfra[0].errorCount, 0);
  const outside = await eslint.lintText(code, { filePath: join(repoRoot, "tools/x.mjs") });
  const undef = outside[0].messages.filter((m) => m.ruleId === "no-undef").map((m) => m.message);
  assert.equal(undef.length, 2);
  assert.ok(undef.some((m) => m.includes("'fetch'")) && undef.some((m) => m.includes("'process'")));
});

test("T-0508 AC-5 README documents the rls-coverage .from(x) form", () => {
  const readme = readFileSync(join(repoRoot, "infra/deploy/README.md"), "utf8");
  for (const s of ["as const", "EXPORT_TABLES", "D-0190"]) assert.ok(readme.includes(s), s);
});
