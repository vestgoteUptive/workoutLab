// T-0203b AC12 (D-0053 §1, §4) and T-0310b AC6 (D-0135 §3): static checks over supabase/functions/*.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const FUNCTIONS_DIR = path.join(REPO_ROOT, "supabase", "functions");
const DENO_JSON_PATH = path.join(FUNCTIONS_DIR, "deno.json");
const LOCK_PATH = path.join(REPO_ROOT, "pnpm-lock.yaml");

function listFunctionSourceFiles() {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (full.includes(`${path.sep}_shared${path.sep}vendor${path.sep}`)) continue;
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (entry.endsWith(".ts")) {
        out.push(full);
      }
    }
  };
  walk(FUNCTIONS_DIR);
  return out;
}

test("AC12: no function source (outside _shared/vendor) imports packages/ or _shared/vendor by path", () => {
  for (const file of listFunctionSourceFiles()) {
    const contents = readFileSync(file, "utf8");
    // `[^]*?` (not `.*`) so a brace-spread import statement that wraps onto several lines is
    // still captured as one match, not silently skipped by a single-line-only pattern.
    const importLines = contents.match(/^import[^]*?from\s+["'][^"']+["'];?$/gm) ?? [];
    for (const line of importLines) {
      assert.doesNotMatch(
        line,
        /packages\//,
        `${path.relative(REPO_ROOT, file)} imports packages/ directly: ${line}`,
      );
      assert.doesNotMatch(
        line,
        /_shared\/vendor/,
        `${path.relative(REPO_ROOT, file)} imports _shared/vendor by path: ${line}`,
      );
    }
  }
});

// T-0310b AC6 (D-0135 §3, superseding D-0053 §4's ban for this one file): the service-role key is
// read in exactly one file, account/admin.ts, which only calls auth.admin.deleteUser. The set must be
// exactly that file, so a rename or a removed read fails here too (non-vacuity), not just a new reader.
const SERVICE_ROLE_READ_RE = /Deno\.env\.get\(\s*["']SUPABASE_SERVICE_ROLE_KEY["']/;
const ADMIN_FILE = "account/admin.ts";

function functionsRelative(file) {
  return path.relative(FUNCTIONS_DIR, file).split(path.sep).join("/");
}

function countOccurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

test("T-0310b AC6: exactly one function source reads SUPABASE_SERVICE_ROLE_KEY: account/admin.ts", () => {
  const readers = listFunctionSourceFiles()
    .filter((file) => SERVICE_ROLE_READ_RE.test(readFileSync(file, "utf8")))
    .map(functionsRelative)
    .sort();
  assert.deepEqual(readers, [ADMIN_FILE]);
});

test("T-0310b AC6: account/admin.ts makes exactly one auth.admin.deleteUser( call and no data, rpc, storage or schema call", () => {
  const admin = readFileSync(path.join(FUNCTIONS_DIR, ADMIN_FILE), "utf8");
  assert.equal(countOccurrences(admin, "auth.admin.deleteUser("), 1);
  for (const banned of [".from(", ".rpc(", ".storage", ".schema("]) {
    assert.equal(countOccurrences(admin, banned), 0, `${ADMIN_FILE} contains ${banned}`);
  }
});

test("T-0310b AC6: account/core.ts and account/index.ts never mention SERVICE_ROLE; _shared/auth.ts doesn't read the key", () => {
  for (const rel of ["account/core.ts", "account/index.ts"]) {
    const contents = readFileSync(path.join(FUNCTIONS_DIR, rel), "utf8");
    assert.equal(contents.includes("SERVICE_ROLE"), false, `${rel} mentions SERVICE_ROLE`);
  }
  const auth = readFileSync(path.join(FUNCTIONS_DIR, "_shared", "auth.ts"), "utf8");
  assert.doesNotMatch(auth, SERVICE_ROLE_READ_RE);
});

test("AC12: engine calls import from @workoutlab/engine, row mapping from @workoutlab/shared", () => {
  const files = listFunctionSourceFiles();
  const usesSuggestOrBalance = files.filter((f) => {
    const contents = readFileSync(f, "utf8");
    return /\bsuggest\(|\bbalance\(/.test(contents) && !f.endsWith("_shared/repo.ts");
  });
  assert.ok(usesSuggestOrBalance.length > 0, "expected at least one file calling suggest()/balance()");
  for (const file of usesSuggestOrBalance) {
    const contents = readFileSync(file, "utf8");
    assert.match(contents, /from\s+["']@workoutlab\/engine["']/, `${file} must import engine functions from @workoutlab/engine`);
  }
  const repoContents = readFileSync(path.join(FUNCTIONS_DIR, "_shared", "repo.ts"), "utf8");
  for (const fn of ["toHistorySet", "toLibraryExercise", "toAreaTargets", "toEngineProfile"]) {
    assert.match(repoContents, new RegExp(fn), `_shared/repo.ts must use ${fn}`);
  }
  assert.match(repoContents, /from\s+["']@workoutlab\/shared["']/);
});

test("AC12: deno.json maps @workoutlab/engine and @workoutlab/shared to the vendor copy, and pins ajv to the lockfile version", () => {
  const denoJson = JSON.parse(readFileSync(DENO_JSON_PATH, "utf8"));
  assert.equal(denoJson.nodeModulesDir, "none");
  assert.equal(denoJson.imports["@workoutlab/engine"], "./_shared/vendor/engine/index.js");
  assert.equal(denoJson.imports["@workoutlab/shared"], "./_shared/vendor/shared/index.js");

  const lock = readFileSync(LOCK_PATH, "utf8");
  const shareIdx = lock.indexOf("packages/shared:");
  assert.ok(shareIdx !== -1, "packages/shared not found in pnpm-lock.yaml");
  const shareBlock = lock.slice(shareIdx, shareIdx + 400);
  const match = /ajv:\s*\n\s*specifier:[^\n]*\n\s*version:\s*([0-9.]+)/.exec(shareBlock);
  assert.ok(match, "could not find packages/shared's ajv version in pnpm-lock.yaml");
  const lockedAjvVersion = match[1];

  assert.equal(denoJson.imports["ajv/dist/2020.js"], `npm:ajv@${lockedAjvVersion}/dist/2020.js`);
});
