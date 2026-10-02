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
// read in exactly one file, account/admin.ts, which only calls auth.admin.deleteUser. The hosted
// runtime injects the key into every function's environment, so this scan is the only fence. It
// covers every file under supabase/functions/, _shared/vendor included, and bans each way of
// reaching the key, not only the literal read: see SECRET_FENCE_RULES and scanForSecretAccess.
const SERVICE_ROLE_READ_RE = /Deno\.env\.get\(\s*["']SUPABASE_SERVICE_ROLE_KEY["']/;
const ADMIN_FILE = "account/admin.ts";

function functionsRelative(file) {
  return path.relative(FUNCTIONS_DIR, file).split(path.sep).join("/");
}

function countOccurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

/** Every file under supabase/functions/, vendor included, any extension. */
function listAllFunctionFiles() {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(full);
    }
  };
  walk(FUNCTIONS_DIR);
  return out;
}

/** Drops block comments and whole-line `//` comments, so prose such as "the Deno Edge Function"
 * isn't read as code. Trailing comments stay (they can only add false positives, never hide code). */
function stripComments(source) {
  return source.replace(/\/\*[^]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

// Substring bans, matched on the raw text (comments included): key names, the admin API, dynamic
// import, and the other routes to the environment (node's process.env, globalThis, eval).
const SECRET_FENCE_RULES = [
  ["env-toObject", /Deno\s*\.\s*env\s*\.\s*toObject/],
  ["key-name SERVICE_ROLE", /SERVICE_ROLE/],
  ["key-name SECRET_KEY", /SECRET_KEY/],
  ["key-name SB_SECRET", /SB_SECRET/],
  ["auth.admin", /auth\s*\.\s*admin/],
  ["dynamic import(", /\bimport\s*\(/],
  ["process.env", /process\s*\.\s*env|node:process/],
  ["globalThis", /\bglobalThis\b/],
  ["eval / Function constructor", /\beval\s*\(|\bnew\s+Function\s*\(/],
];

const LITERAL_ENV_GET_RE = /^\s*\.\s*env\s*\.\s*get\s*\(\s*(["'])[A-Za-z0-9_]+\1\s*\)/;

/** The rules `source` breaks. Besides the substring bans, every code use of `Deno` must be
 * `Deno.serve` or `Deno.env.get("<LITERAL>")`; a template literal, a concatenation, a variable,
 * `Deno["env"]`, `const { env } = Deno` or passing `Deno.env` around all break a rule. */
function scanForSecretAccess(source) {
  const broken = new Set();
  for (const [name, re] of SECRET_FENCE_RULES) if (re.test(source)) broken.add(name);
  const code = stripComments(source);
  for (const match of code.matchAll(/\bDeno\b/g)) {
    const rest = code.slice(match.index + match[0].length);
    if (/^\s*\.\s*serve\b/.test(rest) || LITERAL_ENV_GET_RE.test(rest)) continue;
    if (/^\s*\.\s*env\s*\.\s*get\s*\(/.test(rest)) broken.add("env-get-non-literal");
    else if (/^\s*\.\s*env\s*\.\s*toObject/.test(rest)) broken.add("env-toObject");
    else broken.add("deno-other-access");
  }
  return [...broken].sort();
}

// Named allowances: [file, rule, exact count, why]. _shared/cors.ts takes an injectable env
// (`env = Deno.env`) so the CORS tests can set ALLOWED_ORIGINS; the test below also pins every
// `env.get(` in that file to the literal "ALLOWED_ORIGINS", so the alias can't read anything else.
const SECRET_FENCE_ALLOWANCES = [
  ["_shared/cors.ts", "deno-other-access", 3, "injectable env defaults to Deno.env (D-0011)"],
];

function allowedViolations(rel, source) {
  const allowances = SECRET_FENCE_ALLOWANCES.filter(([file]) => file === rel);
  if (allowances.length === 0) return scanForSecretAccess(source);
  const code = stripComments(source);
  const aliases = (code.match(/=\s*Deno\.env\b(?!\s*\.)/g) ?? []).length;
  const withoutAliases = source.replace(/=\s*Deno\.env\b(?!\s*\.)/g, "= ENV_ALIAS");
  const remaining = scanForSecretAccess(withoutAliases);
  for (const [, , count] of allowances) {
    assert.equal(aliases, count, `${rel}: expected exactly ${count} \`= Deno.env\` defaults`);
  }
  return remaining;
}

test("T-0310b AC6: the secret-access scanner flags every banned form (positive fixtures)", () => {
  const cases = [
    ["const all = Deno.env.toObject();", "env-toObject"],
    ["const name = pick(); Deno.env.get(name);", "env-get-non-literal"],
    ["Deno.env.get(`SUPABASE_${kind}`);", "env-get-non-literal"],
    ['Deno.env.get("SUPABASE_" + "X");', "env-get-non-literal"],
    ['Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");', "key-name SERVICE_ROLE"],
    ['Deno.env.get("SUPABASE_SECRET_KEYS");', "key-name SECRET_KEY"],
    ['Deno.env.get("SB_SECRET");', "key-name SB_SECRET"],
    ["await client.auth.admin.listUsers();", "auth.admin"],
    ['const m = await import("./x.ts");', "dynamic import("],
    ['import process from "node:process"; process.env.X;', "process.env"],
    ["globalThis.Deno.env;", "globalThis"],
    ['eval("1");', "eval / Function constructor"],
    ['const e = Deno["env"];', "deno-other-access"],
    ["const { env } = Deno;", "deno-other-access"],
    ["function f(env = Deno.env) { return env; }", "deno-other-access"],
  ];
  for (const [source, rule] of cases) {
    assert.ok(
      scanForSecretAccess(source).includes(rule),
      `expected ${rule} for: ${source} (got ${JSON.stringify(scanForSecretAccess(source))})`,
    );
  }
  // Contrast: the forms the functions use today pass.
  for (const source of [
    'Deno.env.get("SUPABASE_URL");',
    "Deno.serve(handler);",
    "// the Deno Edge Function, see Deno.env.toString",
  ]) {
    assert.deepEqual(scanForSecretAccess(source), [], source);
  }
});

test("T-0310b AC6: no file under supabase/functions/ (vendor included) except account/admin.ts reaches a secret", () => {
  const files = listAllFunctionFiles();
  assert.ok(
    files.some((f) => f.includes(`${path.sep}_shared${path.sep}vendor${path.sep}`)),
    "the scan must include _shared/vendor",
  );
  const offenders = [];
  for (const file of files) {
    const rel = functionsRelative(file);
    if (rel === ADMIN_FILE) continue;
    const broken = allowedViolations(rel, readFileSync(file, "utf8"));
    if (broken.length > 0) offenders.push(`${rel}: ${broken.join(", ")}`);
  }
  assert.deepEqual(offenders, []);
});

test("T-0310b AC6: the _shared/cors.ts allowance only ever reads ALLOWED_ORIGINS", () => {
  const cors = readFileSync(path.join(FUNCTIONS_DIR, "_shared", "cors.ts"), "utf8");
  const gets = [...stripComments(cors).matchAll(/\benv\s*\.\s*get\s*\(([^)]*)\)/g)].map((m) =>
    m[1].trim(),
  );
  assert.ok(gets.length > 0, "expected cors.ts to read ALLOWED_ORIGINS");
  assert.deepEqual([...new Set(gets)], ['"ALLOWED_ORIGINS"']);
});

test("T-0310b AC6: exactly one function source reads SUPABASE_SERVICE_ROLE_KEY: account/admin.ts", () => {
  const readers = listAllFunctionFiles()
    .filter((file) => SERVICE_ROLE_READ_RE.test(readFileSync(file, "utf8")))
    .map(functionsRelative)
    .sort();
  assert.deepEqual(readers, [ADMIN_FILE]);
});

test("T-0310b AC6: account/admin.ts reads only SUPABASE_URL and the key, makes one auth.admin.deleteUser( call and no data, rpc, storage, schema or dynamic-import call", () => {
  const admin = readFileSync(path.join(FUNCTIONS_DIR, ADMIN_FILE), "utf8");
  assert.equal(countOccurrences(admin, "auth.admin.deleteUser("), 1);
  assert.equal(countOccurrences(admin, "auth.admin"), 1);
  for (const banned of [".from(", ".rpc(", ".storage", ".schema("]) {
    assert.equal(countOccurrences(admin, banned), 0, `${ADMIN_FILE} contains ${banned}`);
  }
  const reads = [...stripComments(admin).matchAll(/\bDeno\b([^;]*)/g)].map((m) => m[1].trim());
  assert.deepEqual(reads, ['.env.get("SUPABASE_URL")', '.env.get("SUPABASE_SERVICE_ROLE_KEY")']);
  for (const [name, re] of [
    ["dynamic import(", /\bimport\s*\(/],
    ["globalThis", /\bglobalThis\b/],
    ["process.env", /process\s*\.\s*env|node:process/],
  ]) {
    assert.doesNotMatch(admin, re, `${ADMIN_FILE} uses ${name}`);
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
