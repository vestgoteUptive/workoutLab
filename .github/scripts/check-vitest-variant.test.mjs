import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkVitestVariant, vitestVersions } from "./check-vitest-variant.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const lock = readFileSync(path.join(root, "pnpm-lock.yaml"), "utf8");
const pkgs = ["apps/web", "apps/landing", "packages/engine", "packages/shared", "packages/design-tokens", "data/exercises"];

test("T-0525 AC-2: all six importers list vitest and share one variant", () => {
  const v = vitestVersions(lock);
  for (const p of pkgs) assert.ok(v[p], `${p} has a vitest version in the lockfile`);
  assert.deepEqual(checkVitestVariant(lock), []);
});

test("T-0525 AC-4: a split variant names the importer", () => {
  const start = lock.indexOf("\n  packages/shared:\n");
  assert.ok(start > 0);
  const at = lock.indexOf("      vitest:", start);
  const head = lock.slice(0, at);
  const tail = lock.slice(at).replace(/(version: 5\.0\.2\(.*?)\(vite@/, "$1(vite@0.0.0-split");
  const findings = checkVitestVariant(head + tail);
  assert.equal(findings.length, 1);
  assert.match(findings[0], /^packages\/shared: /);
});
