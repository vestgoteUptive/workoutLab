// T-0543 (D-0201 §3): destructive-migration guard. Node built-ins only (check-all AC23).
// Input: the output of `supabase-prod-release.sh plan` (its "db push dry run" section lists the
// pending migration files). Fails closed: no dry-run section, or a listed file that is missing
// locally, is an error. CLI:
//   node migration-guard.mjs --plan <file> [--migrations <dir>] [--decisions <dir>] [--seed <file>]
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
const HEADER = /^--[ \t]*release:[ \t]*destructive-approved[ \t]+(D-\d{4})[ \t]*$/;

const NAME_STRICT = /^\d{14}_[A-Za-z0-9_]+\.sql$/;

/**
 * String-aware scan (T-0543 M4). Returns { code, comments }: `code` is the SQL with comments,
 * quoted identifiers (and string literals unless `keepStrings`) blanked out; dollar-quoted bodies are kept as code
 * (scanned recursively), since DO blocks and function bodies are SQL. `comments` holds the text
 * of every `--` line comment, which is where the allow header must be.
 */
export function scan(sql, keepStrings = false) {
  let code = "";
  const comments = [];
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    const two = sql.slice(i, i + 2);
    if (two === "--") {
      let j = sql.indexOf("\n", i);
      if (j < 0) j = n;
      comments.push(sql.slice(i, j));
      code += " ";
      i = j;
    } else if (two === "/*") {
      let depth = 1;
      let j = i + 2;
      while (j < n && depth > 0) {
        if (sql.startsWith("/*", j)) {
          depth++;
          j += 2;
        }
        else if (sql.startsWith("*/", j)) {
          depth--;
          j += 2;
        }
        else j++;
      }
      code += " ";
      i = j;
    } else if (c === "'") {
      const escaped = /[eE]$/.test(code) && !/[A-Za-z0-9_]/.test(code.slice(-2, -1) || " ");
      let j = i + 1;
      while (j < n) {
        if (escaped && sql[j] === "\\") j += 2;
        else if (sql[j] === "'" && sql[j + 1] === "'") j += 2;
        else if (sql[j] === "'") break;
        else j++;
      }
      // N1: dynamic SQL (EXECUTE 'drop ...', format('truncate %I')) lives in strings, so
      // migrations keep literal contents; only the seed (prose in strings) blanks them.
      code += keepStrings ? " " + sql.slice(i + 1, j) + " " : " ";
      i = j + 1;
    } else if (c === '"') {
      let j = i + 1;
      while (j < n && !(sql[j] === '"' && sql[j + 1] !== '"')) j += sql[j] === '"' ? 2 : 1;
      code += " ";
      i = j + 1;
    } else if (c === "$" && !/[A-Za-z0-9_]/.test(sql[i - 1] ?? " ")) {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
      if (!m) {
        code += c;
        i++;
        continue;
      }
      const end = sql.indexOf(m[0], i + m[0].length);
      const bodyEnd = end < 0 ? n : end;
      const inner = scan(sql.slice(i + m[0].length, bodyEnd), keepStrings);
      code += " " + inner.code + " ";
      comments.push(...inner.comments);
      i = end < 0 ? n : end + m[0].length;
    } else {
      code += c;
      i++;
    }
  }
  return { code, comments };
}

/** Pending file names from the plan output (only the dry-run section). null = section missing. */
export function pendingFromPlan(text) {
  const start = text.indexOf("== db push dry run ==");
  if (start < 0) return null;
  let section = text.slice(start + "== db push dry run ==".length);
  const end = section.indexOf("\n== ");
  if (end >= 0) section = section.slice(0, end);
  // Loose on purpose (T-0543 M1): anything the CLI could push looks like <digits>_<anything>.sql.
  return [...new Set(section.match(/\b\d+_[^\s'"|]*\.sql\b/g) ?? [])];
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
  const scanned = scan(sql, true);
  const { comments } = scanned;
  // T-0555 AC-2b: GRANT/REVOKE statements only change privileges ("revoke truncate ... from x" is
  // not a TRUNCATE). Drop those whole statements before matching.
  const code = scanned.code
    .split(";")
    .filter((st) => !/^\s*(GRANT|REVOKE)\b/i.test(st))
    .join(";");
  const hits = PATTERNS.filter(([, re]) => re.test(code)).map(([n]) => n);
  if (!hits.length) return [];
  const h = comments.map((c) => HEADER.exec(c)).find(Boolean);
  if (!h) return [`${name}: destructive (${hits.join(", ")}) without a "-- release: destructive-approved D-NNNN" header`];
  if (!decisionDecided(h[1], decisionsDir))
    return [`${name}: header names ${h[1]}, which is missing or not status: decided`];
  return [];
}

/**
 * T-0555 AC-1: the seed runs as the postgres role on every release, so it is an allow-list.
 * Only comments, begin, commit and INSERT INTO public.<catalogue table> ... ON CONFLICT ... DO
 * UPDATE|NOTHING are allowed; any other statement fails closed. Strings are blanked first.
 */
const SEED_INSERT =
  /^insert\s+into\s+public\.(exercises|exercise_areas|exercise_variants)\b[\s\S]*\bon\s+conflict\b[\s\S]*\bdo\s+(update|nothing)\b/i;
export function checkSeed(name, sql) {
  const { code } = scan(sql);
  const problems = [];
  code.split(";").forEach((raw, i) => {
    const st = raw.trim().replace(/\s+/g, " ");
    if (!st || /^(begin|commit)$/i.test(st)) return;
    if (SEED_INSERT.test(st) && !/\b(select|with|returning)\b/i.test(st)) return;
    problems.push(`${name}: statement ${i + 1} is not allowed in the seed (allow-list: begin, commit, upsert into exercises/exercise_areas/exercise_variants): ${st.slice(0, 60)}`);
  });
  return problems;
}

export function guard({ planText, migrationsDir, decisionsDir, seedFile }) {
  const pending = pendingFromPlan(planText);
  if (pending === null) return { problems: ["plan output has no 'db push dry run' section; refusing"], pending: [] };
  const problems = [];
  // M1: fail closed on any name the convention doesn't allow, in the plan or on disk.
  for (const name of pending) if (!NAME_STRICT.test(name)) problems.push(`${name}: unrecognised migration file name; refusing`);
  if (existsSync(migrationsDir))
    for (const f of readdirSync(migrationsDir))
      if (!NAME_STRICT.test(f)) problems.push(`${f}: migration file name must match <14 digits>_<word chars>.sql`);
  for (const name of pending) {
    if (!NAME_STRICT.test(name)) continue;
    const p = path.join(migrationsDir, name);
    if (!existsSync(p)) problems.push(`${name}: listed as pending but not in ${migrationsDir}`);
    else problems.push(...checkSql(name, readFileSync(p, "utf8"), decisionsDir));
  }
  if (seedFile && existsSync(seedFile)) problems.push(...checkSeed(path.basename(seedFile), readFileSync(seedFile, "utf8")));
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
    seedFile: path.resolve(arg("--seed", path.join(repoRoot, "supabase", "seed.sql"))),
  });
  if (problems.length) {
    console.error("migration guard: BLOCKED\n" + problems.join("\n"));
    process.exit(1);
  }
  console.log(`migration guard: ${pending.length} pending migration(s), none destructive`);
}
