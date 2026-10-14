// T-0006 (D-0158, D-0178): a package's cached `test` hash must cover the repo-root files its
// tests read, or the local cached gate replays a green result after a contract/library edit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const TURBO_PATH = process.env.TURBO_JSON_PATH ?? path.resolve(here, "..", "..", "turbo.json");
const turbo = JSON.parse(readFileSync(TURBO_PATH, "utf8"));

const ROOT = "$TURBO_ROOT$/";
const EXPECTED = {
  "@workoutlab/engine#test": [
    "docs/engine-rules.md",
    "api/openapi.yaml",
    "data/exercises/library/**",
  ],
  "@workoutlab/shared#test": [
    "api/openapi.yaml",
    "docs/data-model.md",
    "Design-docs/docs/product/user-flows.md",
    ".github/scripts/check-screen-ids.mjs",
    ".github/scripts/check-placeholder-tests.mjs",
    "packages/engine/src/**",
    "apps/web/src/**",
  ],
  "@workoutlab/web#test": [
    "packages/design-tokens/src/tokens.json",
    "Design-docs/docs/design/assets/body-figure/**",
    "supabase/tests/database/018_user_owned_tables.test.sql",
  ],
  "@workoutlab/design-tokens#test": [
    "Design-docs/docs/design/**",
    ".github/scripts/auth-templates.test.mjs",
  ],
};

for (const [task, paths] of Object.entries(EXPECTED)) {
  test(`T-0006 AC-5: ${task} inputs pin the repo-root files its tests read`, () => {
    const entry = turbo.tasks[task];
    assert.ok(entry, `turbo.json has no "${task}" entry`);
    assert.deepEqual(entry.dependsOn, turbo.tasks.test.dependsOn, `${task} dependsOn`);
    assert.ok(entry.inputs.includes("$TURBO_DEFAULT$"), `${task} keeps $TURBO_DEFAULT$`);
    for (const p of paths) {
      assert.ok(entry.inputs.includes(ROOT + p), `${task} is missing input ${ROOT + p}`);
    }
  });
}

test("T-0006 AC-4: no entry takes the whole repo as input", () => {
  for (const task of Object.keys(EXPECTED)) {
    for (const i of turbo.tasks[task].inputs) {
      assert.ok(!/^\$TURBO_ROOT\$\/?(\*\*(\/\*)?)?$/.test(i), `${task} input ${i} is too broad`);
    }
  }
});
