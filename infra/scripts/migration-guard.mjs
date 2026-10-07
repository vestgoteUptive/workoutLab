// T-0543 (D-0201 §3): destructive-migration guard. Node built-ins only (check-all AC23).
// Input: the output of `supabase-prod-release.sh plan` (its "db push dry run" section lists the
// pending migration files). Fails closed: no dry-run section, or a listed file that is missing
// locally, is an error. CLI:
//   node migration-guard.mjs --plan <file> [--migrations <dir>] [--decisions <dir>]
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

export const PATTERNS = [
  ["DROP", /\bDROP\b/i],
  ["TRUNCATE", /\bTRUNCATE\b/i],
  ["ALTER ... TYPE", /\bALTER\b[^;]*\bTYPE\b/i],
  ["DELETE FROM", /\bDELETE\s+FROM\b/i],
  ["RENAME", /\bRENAME\b/i],
];
const HEADER = /^[ \t]*--[ \t]*release:[ \t]*destructive-approved[ \t]+(D-\d{4})[ \t]*$/m;

/** Remove -- line comments and (non-nested) block comments, keeping everything else. */
export function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/** Pending file names from the plan output (only the dry-run section). null = section missing. */
export function pendingFromPlan(text) {
  const start = text.indexOf("== db push dry run ==");
  if (start < 0) return null;
  let section = text.slice(start + "== db push dry run ==".length);
  const end = section.indexOf("\n== ");
  if (end >= 0) section = section.slice(0, end);
  return [...new Set(section.match(/\b\d{14}_[A-Za-z0-9_]+\.sql\b/g) ?? [])];
}

export function decisionDecided(id, decisionsDir) {
  if (!existsSync(decisionsDir)) return false;
  const f = readdirSync(decisionsDir).find((n) => n.startsWith(id + "-") && n.endsWith(".md"));
  if (!f) return false;
  const fm = /^---\n([\s\S]*?)\n---/.exec(readFileSync(path.join(decisionsDir, f), "utf8"));
  return !!fm && /^status:[ \t]*decided[ \t]*$/m.test(fm[1]);
}

/** Returns problems for one migration's SQL. */
export function checkSql(name, sql, decisionsDir) {
  const hits = PATTERNS.filter(([, re]) => re.test(stripComments(sql))).map(([n]) => n);
  if (!hits.length) return [];
  const h = HEADER.exec(sql);
  if (!h) return [`${name}: destructive (${hits.join(", ")}) without a "-- release: destructive-approved D-NNNN" header`];
  if (!decisionDecided(h[1], decisionsDir))
    return [`${name}: header names ${h[1]}, which is missing or not status: decided`];
  return [];
}

export function guard({ planText, migrationsDir, decisionsDir }) {
  const pending = pendingFromPlan(planText);
  if (pending === null) return { problems: ["plan output has no 'db push dry run' section; refusing"], pending: [] };
  const problems = [];
  for (const name of pending) {
    const p = path.join(migrationsDir, name);
    if (!existsSync(p)) problems.push(`${name}: listed as pending but not in ${migrationsDir}`);
    else problems.push(...checkSql(name, readFileSync(p, "utf8"), decisionsDir));
  }
  return { problems, pending };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (k, d) => {
    const i = process.argv.indexOf(k);
    return i > 0 ? process.argv[i + 1] : d;
  };
  const planFile = arg("--plan");
  if (!planFile) {
    console.error("usage: migration-guard.mjs --plan <file> [--migrations <dir>] [--decisions <dir>]");
    process.exit(2);
  }
  const { problems, pending } = guard({
    planText: readFileSync(planFile, "utf8"),
    migrationsDir: path.resolve(arg("--migrations", path.join(repoRoot, "supabase", "migrations"))),
    decisionsDir: path.resolve(arg("--decisions", path.join(repoRoot, ".squad", "decisions"))),
  });
  if (problems.length) {
    console.error("migration guard: BLOCKED\n" + problems.join("\n"));
    process.exit(1);
  }
  console.log(`migration guard: ${pending.length} pending migration(s), none destructive`);
}
