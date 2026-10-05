// T-0402c AC-2 (UF-01.5, D-0184 §6): every table, view and Edge Function the web app reaches is
// covered by an RLS or owner-scoping test. A preview build talks to prod, so a name the app
// reaches without such a test is a hole a signed-in tester could walk through.
//   tables     library (read-only) or in 002_rls_owner.test.sql's two-user isolation asserts
//   views      security_invoker = true in the latest migration that defines them
//   functions  an owner-scoping integration test in supabase/tests/functions/integration/
// `.from(x)` with a non-literal x fails as dynamic, unless x resolves statically to an
// `as const` string-array in the same file (param `x: T`, `type T = (typeof C)[number]`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..", "..");
const FIXTURES = path.join(here, "fixtures", "rls-coverage");

export const LIBRARY = new Set(["areas", "exercises", "exercise_areas", "exercise_variants"]);
/** Edge Function -> its owner-scoping integration test and a line that proves another user is untouched. */
export const FUNCTION_TESTS = {
  account: { file: "account-delete.test.ts", marker: "B's counts are unchanged" },
};
const EXPECTED = [
  "account",
  "area_targets",
  "exercise_areas",
  "exercise_variants",
  "exercises",
  "plan_checkins",
  "profiles",
  "routine_items",
  "routines",
  "session_sets",
  "session_sets_live",
  "sessions",
];

const isTestFile = (p) => /\.(test|spec)\.tsx?$/.test(p) || /[\\/](__tests__|test|tests)[\\/]/.test(p);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "node_modules") walk(p, out);
    } else if (/\.tsx?$/.test(name) && !isTestFile(p)) out.push(p);
  }
  return out;
}

const lineOf = (src, i) => src.slice(0, i).split("\n").length;

/** Resolves `.from(ident)` to the string literals of an `as const` array, or null. */
function resolveIdent(src, ident) {
  const typed = new RegExp(`\\b${ident}\\s*:\\s*([A-Z][\\w$]*)`).exec(src);
  if (!typed) return null;
  const alias = new RegExp(`\\btype\\s+${typed[1]}\\s*=\\s*\\(\\s*typeof\\s+([\\w$]+)\\s*\\)\\s*\\[\\s*number\\s*\\]`).exec(src);
  if (!alias) return null;
  const arr = new RegExp(`\\bconst\\s+${alias[1]}\\s*=\\s*\\[([^\\]]*)\\]\\s*as\\s+const`).exec(src);
  if (!arr) return null;
  const items = arr[1].split(",").map((s) => s.trim()).filter(Boolean);
  const names = items.map((s) => /^(["'])([\w]+)\1$/.exec(s)?.[2]);
  return names.length && names.every(Boolean) ? names : null;
}

export function scanSources(srcDir) {
  const tables = new Set();
  const functions = new Set();
  const dynamic = [];
  for (const file of walk(srcDir)) {
    const src = readFileSync(file, "utf8");
    const rel = path.relative(ROOT, file);
    for (const m of src.matchAll(/\.\s*from\s*\(/g)) {
      // `Array.from(`, `Buffer.from(`, ...: a static on a capitalised global, not a query.
      const before = /([A-Za-z_$][\w$]*)\s*$/.exec(src.slice(0, m.index));
      if (before && /^[A-Z]/.test(before[1])) continue;
      const rest = src.slice(m.index + m[0].length);
      const lit = /^\s*(["'`])([\w]+)\1\s*\)/.exec(rest);
      if (lit) {
        tables.add(lit[2]);
        continue;
      }
      const ident = /^\s*([A-Za-z_$][\w$]*)\s*\)/.exec(rest);
      const resolved = ident && resolveIdent(src, ident[1]);
      if (resolved) for (const n of resolved) tables.add(n);
      else dynamic.push(`${rel}:${lineOf(src, m.index)}: .from(${(ident?.[1] ?? rest.split(")")[0]).trim()})`);
    }
    for (const m of src.matchAll(/\/functions\/v1\/([A-Za-z0-9_-]+)/g)) functions.add(m[1]);
    for (const m of src.matchAll(/\.functions\s*\.\s*invoke\s*\(\s*(["'`])([\w-]+)\1/g)) functions.add(m[2]);
  }
  return { tables, functions, dynamic };
}

/** Views in the migrations, in apply order: name -> security_invoker of the latest definition. */
export function migrationViews(migrationsDir) {
  const views = new Map();
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  const invoker = (opts) => /security_invoker\s*=\s*(true|on|1)\b/i.test(opts ?? "");
  for (const f of files) {
    const sql = readFileSync(path.join(migrationsDir, f), "utf8").replace(/--[^\n]*/g, "");
    const re = /create\s+(?:or\s+replace\s+)?view\s+public\.(\w+)\s*(?:with\s*\(([^)]*)\))?|alter\s+view\s+(?:if\s+exists\s+)?public\.(\w+)\s+(set|reset)\s*\(([^)]*)\)/gi;
    for (const m of sql.matchAll(re)) {
      if (m[1]) views.set(m[1], invoker(m[2]));
      else if (/security_invoker/i.test(m[5])) views.set(m[3], m[4].toLowerCase() === "set" && invoker(m[5]));
    }
  }
  return views;
}

export function isolationTables(rlsTestPath) {
  const sql = readFileSync(rlsTestPath, "utf8");
  return new Set([...sql.matchAll(/from\s+public\.(\w+)/gi)].map((m) => m[1]));
}

export function checkCoverage(found, { rlsTestPath, migrationsDir, fnTestsDir }) {
  const problems = [];
  const isolated = isolationTables(rlsTestPath);
  const views = migrationViews(migrationsDir);
  for (const d of found.dynamic) problems.push(`dynamic table name: ${d}`);
  for (const t of [...found.tables].sort()) {
    if (views.has(t)) {
      if (!views.get(t)) problems.push(`view ${t}: not security_invoker in the migrations`);
    } else if (!LIBRARY.has(t) && !isolated.has(t)) {
      problems.push(`table ${t}: not a library table and not in 002's two-user isolation asserts`);
    }
  }
  for (const fn of [...found.functions].sort()) {
    const spec = FUNCTION_TESTS[fn];
    const file = spec && path.join(fnTestsDir, spec.file);
    if (!spec || !existsSync(file) || !readFileSync(file, "utf8").includes(spec.marker)) {
      problems.push(`function ${fn}: no owner-scoping integration test in ${path.relative(ROOT, fnTestsDir)}`);
    }
  }
  return problems;
}

const REAL = {
  rlsTestPath: path.join(ROOT, "supabase/tests/database/002_rls_owner.test.sql"),
  migrationsDir: path.join(ROOT, "supabase/migrations"),
  fnTestsDir: path.join(ROOT, "supabase/tests/functions/integration"),
};
const names = (f) => [...f.tables, ...f.functions].sort();

test("T-0402c AC-2 the web app reaches exactly the 12 expected names, each covered", () => {
  const found = scanSources(path.join(ROOT, "apps/web/src"));
  console.log(`T-0402c AC-2 found ${names(found).length}: ${names(found).join(", ")}`);
  assert.deepEqual(found.dynamic, []);
  assert.deepEqual(names(found), EXPECTED);
  assert.deepEqual(checkCoverage(found, REAL), []);
});

test("T-0402c AC-2 session_sets_live is security_invoker in the migrations", () => {
  assert.equal(migrationViews(REAL.migrationsDir).get("session_sets_live"), true);
});

test("T-0402c AC-2 planted fault: a fixture .from(\"new_table\") fails and names new_table", () => {
  const found = scanSources(path.join(FIXTURES, "new-table"));
  assert.deepEqual([...found.tables].sort(), ["new_table", "profiles"], "test files are skipped");
  const problems = checkCoverage(found, REAL);
  assert.equal(problems.length, 1, problems.join("\n"));
  assert.match(problems[0], /table new_table: not a library table/);
});

test("T-0402c AC-2 planted fault: a fixture .from(tableVar) fails as dynamic", () => {
  const found = scanSources(path.join(FIXTURES, "dynamic"));
  const problems = checkCoverage(found, REAL);
  assert.equal(problems.length, 1, problems.join("\n"));
  assert.match(problems[0], /dynamic table name: .*dynamic[\\/]src[\\/]query\.ts:\d+: \.from\(tableVar\)/);
});

test("T-0402c AC-2 planted fault: an unknown function and a non-invoker view fail", (t) => {
  const found = { tables: new Set(["session_sets_live"]), functions: new Set(["admin"]), dynamic: [] };
  assert.deepEqual(checkCoverage(found, REAL), ["function admin: no owner-scoping integration test in supabase/tests/functions/integration"]);
  const problems = checkCoverage(found, { ...REAL, migrationsDir: path.join(FIXTURES, "migrations-definer") });
  assert.ok(problems.includes("view session_sets_live: not security_invoker in the migrations"), problems.join("\n"));
  t.diagnostic("unknown function and definer view both reported");
});
