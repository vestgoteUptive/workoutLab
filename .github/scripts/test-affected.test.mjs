// T-1015 / D-0285: the planner behind `pnpm test:affected` (pure function over a file list).
import { test } from "node:test";
import assert from "node:assert/strict";
import { planAffected, renderPlan, commandsFor } from "../../scripts/test-affected.mjs";

test("AC1 a single feature file: web typecheck+lint, vitest related for it, the UF's e2e specs, not full", () => {
  const plan = planAffected(["apps/web/src/features/UF-09/rest.tsx"]);
  assert.equal(plan.full, false);
  assert.deepEqual(plan.packages, ["apps/web"]);
  assert.deepEqual(plan.related, { "apps/web": ["apps/web/src/features/UF-09/rest.tsx"] });
  assert.deepEqual(plan.e2e.globs, ["tests/e2e/uf-09*"]);
  const text = renderPlan(plan);
  assert.match(text, /typecheck\+lint: apps\/web/);
  assert.match(text, /vitest related \(apps\/web\): apps\/web\/src\/features\/UF-09\/rest\.tsx/);
  assert.match(text, /e2e: tests\/e2e\/uf-09\*/);
  assert.match(text, /full: no/);
  const cmds = commandsFor(plan, { e2e: true, e2eFiles: ["tests/e2e/uf-09-focus.spec.ts"] });
  assert.ok(cmds.some((c) => c.label.startsWith("vitest related") && c.lock === "small"));
  assert.ok(cmds.some((c) => c.label === "e2e" && c.lock === "heavy"));
  assert.ok(!cmds.some((c) => /full/.test(c.label)));
});

test("AC2 every D-0285 §2 shared path prints full", () => {
  const shared = [
    "apps/web/src/lib/offline/db.ts",
    "apps/web/src/app/routes.ts",
    "apps/web/src/components/Button.tsx",
    "packages/engine/src/plan.ts",
    "packages/shared/src/index.ts",
    "packages/design-tokens/src/tokens.json",
    "docs/data-model.md",
    "api/openapi.yaml",
    "docs/engine-rules.md",
    "supabase/migrations/0001_init.sql",
    "tests/e2e/fixtures/offline.ts",
    "tests/e2e/playwright.config.ts",
    "apps/web/vite.config.ts",
    "packages/engine/vitest.config.ts",
    "turbo.json",
  ];
  for (const f of shared) {
    const plan = planAffected([f]);
    assert.equal(plan.full, true, `${f} should be full`);
    assert.match(renderPlan(plan), /^full: yes/m, f);
    assert.ok(commandsFor(plan).some((c) => c.label === "full turbo gate"), f);
  }
  // one shared path among feature files makes the whole diff full
  assert.equal(planAffected(["apps/web/src/features/UF-09/rest.tsx", "apps/web/src/lib/x.ts"]).full, true);
});

test("AC3 docs and .squad only: repo checks and nothing else", () => {
  const plan = planAffected(["docs/tickets/T-1015-x.md", ".squad/state.md", "docs/infra-costs.md"]);
  assert.equal(plan.full, false);
  assert.deepEqual(plan.packages, []);
  assert.deepEqual(plan.related, {});
  assert.deepEqual(plan.e2e, { globs: [], specs: [] });
  assert.equal(plan.repo.repoTests, false);
  assert.equal(renderPlan(plan), "changed files: 3\nfull: no\nrepo checks: format:check, check-all");
  assert.deepEqual(commandsFor(plan).map((c) => c.label), ["format:check", "check-all"]);
});

test("AC4 an edited e2e spec is listed (and lint of tests/e2e runs); no full for a plain spec", () => {
  const plan = planAffected(["tests/e2e/uf-11-plan.spec.ts"]);
  assert.equal(plan.full, false);
  assert.deepEqual(plan.e2e.specs, ["tests/e2e/uf-11-plan.spec.ts"]);
  assert.match(renderPlan(plan), /e2e: tests\/e2e\/uf-11-plan\.spec\.ts/);
  assert.equal(plan.lintE2e, true);
});

test("a feature file plus its edited spec lists both; scripts/ and .github/scripts add the repo tests", () => {
  const plan = planAffected(["apps/web/src/features/UF-10/Balance.tsx", "tests/e2e/uf-10-balance.spec.ts", "scripts/x.mjs"]);
  assert.deepEqual(plan.e2e.globs, ["tests/e2e/uf-10*"]);
  assert.deepEqual(plan.e2e.specs, ["tests/e2e/uf-10-balance.spec.ts"]);
  assert.equal(plan.repo.repoTests, true);
});
