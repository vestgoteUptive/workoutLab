#!/usr/bin/env node
// T-0203a (D-0053 §2, D-0044): generates supabase/seed.sql from data/exercises/library/*.json.
// Node built-ins only, no new dependency. `--check` exits 1 on drift without writing anything.
//
// Usage:
//   node supabase/scripts/gen-seed.mjs                 write supabase/seed.sql
//   node supabase/scripts/gen-seed.mjs --check          exit 1 (and print the drifting path) on drift
//   node supabase/scripts/gen-seed.mjs --library <dir>  read a different library directory
//   node supabase/scripts/gen-seed.mjs --out <file>     write somewhere other than supabase/seed.sql
//                                                        (--check always compares against the
//                                                        committed supabase/seed.sql, not --out)
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_LIBRARY_DIR = path.join(REPO_ROOT, "data", "exercises", "library");
const SEED_PATH = path.join(REPO_ROOT, "supabase", "seed.sql");
const SEED_REL_PATH = path.relative(REPO_ROOT, SEED_PATH).split(path.sep).join("/");

function parseArgs(argv) {
  const args = { check: false, library: DEFAULT_LIBRARY_DIR, out: SEED_PATH };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--check") {
      args.check = true;
    } else if (argv[i] === "--library") {
      args.library = path.resolve(argv[++i]);
    } else if (argv[i] === "--out") {
      args.out = path.resolve(argv[++i]);
    }
  }
  return args;
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlOrNull(value) {
  return value === undefined || value === null ? "null" : sqlString(value);
}

function sqlNumberOrNull(value) {
  return value === undefined || value === null ? "null" : String(value);
}

function sqlBool(value) {
  return value ? "true" : "false";
}

function sqlTextArray(values) {
  const arr = values ?? [];
  if (arr.length === 0) return "array[]::text[]";
  return `array[${arr.map(sqlString).join(", ")}]::text[]`;
}

/** Reads every *.json file in `libraryDir`, in filename order, validating the one field the
 * seed can't fall back on (D-0044 §3: `external_load` is never defaulted). */
export function loadLibrary(libraryDir) {
  const files = readdirSync(libraryDir)
    .filter((f) => f.endsWith(".json"))
    .sort();
  const exercises = [];
  for (const file of files) {
    const raw = readFileSync(path.join(libraryDir, file), "utf8");
    let json;
    try {
      json = JSON.parse(raw);
    } catch (err) {
      throw new Error(`${file}: invalid JSON (${err.message})`);
    }
    if (typeof json.bodyweight !== "boolean") {
      throw new Error(`${file}: missing required "bodyweight" boolean (D-0044 §3)`);
    }
    if (typeof json.id !== "string" || json.id.length === 0) {
      throw new Error(`${file}: missing required "id" string`);
    }
    exercises.push(json);
  }
  exercises.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return exercises;
}

const EXERCISE_COLUMNS = [
  "id",
  "name",
  "kind",
  "type",
  "level",
  "equipment",
  "instructions",
  "mistakes",
  "cue",
  "timed",
  "default_duration_s",
  "source",
  "license",
  "attribution",
  "source_url",
  "increment_kg",
  "external_load",
];

function renderExerciseInsert(json) {
  // D-0044 §1, §3: external_load = NOT bodyweight, written explicitly on every row, never left
  // to the column default. D-0044 §4: increment_kg is 2.5 when the JSON omits it.
  const externalLoad = !json.bodyweight;
  const incrementKg = json.increment_kg === undefined ? 2.5 : json.increment_kg;
  const values = {
    id: sqlString(json.id),
    name: sqlString(json.name),
    kind: sqlString(json.kind),
    type: sqlString(json.type),
    level: sqlString(json.level),
    equipment: sqlTextArray(json.equipment),
    instructions: sqlTextArray(json.instructions),
    mistakes: sqlTextArray(json.mistakes ?? []),
    cue: sqlOrNull(json.cue),
    timed: sqlBool(Boolean(json.timed)),
    default_duration_s: sqlNumberOrNull(json.default_duration_s),
    source: sqlString(json.source),
    license: sqlString(json.license),
    attribution: sqlOrNull(json.attribution),
    source_url: sqlOrNull(json.source_url),
    increment_kg: sqlNumberOrNull(incrementKg),
    external_load: sqlBool(externalLoad),
  };
  const updates = EXERCISE_COLUMNS.filter((c) => c !== "id")
    .map((c) => `  ${c} = excluded.${c}`)
    .join(",\n");
  return (
    `insert into public.exercises (${EXERCISE_COLUMNS.join(", ")})\n` +
    `values (${EXERCISE_COLUMNS.map((c) => values[c]).join(", ")})\n` +
    `on conflict (id) do update set\n${updates};`
  );
}

function renderAreaInserts(json) {
  const areas = json.areas ?? {};
  return Object.keys(areas)
    .sort()
    .map(
      (areaId) =>
        `insert into public.exercise_areas (exercise_id, area_id, weight)\n` +
        `values (${sqlString(json.id)}, ${sqlString(areaId)}, ${sqlNumberOrNull(areas[areaId])})\n` +
        `on conflict (exercise_id, area_id) do update set weight = excluded.weight;`,
    );
}

function renderVariantInserts(json) {
  const variants = json.variants ?? [];
  return variants.map(
    (variantId) =>
      `insert into public.exercise_variants (exercise_id, variant_id)\n` +
      `values (${sqlString(json.id)}, ${sqlString(variantId)})\n` +
      `on conflict (exercise_id, variant_id) do nothing;`,
  );
}

/** Pure: builds the full seed.sql text from a library directory. Byte-identical across calls
 * for the same input tree (AC1). */
export function generateSql(libraryDir) {
  const exercises = loadLibrary(libraryDir);
  const lines = [
    "-- GENERATED by supabase/scripts/gen-seed.mjs from data/exercises/library/*.json.",
    "-- Do not edit by hand: run `node supabase/scripts/gen-seed.mjs` to regenerate (D-0053 §2).",
    "-- external_load = NOT bodyweight, written explicitly on every row (D-0044).",
    "-- Idempotent: every insert upserts, so applying this file twice is a no-op (AC7).",
    "begin;",
    "",
  ];
  for (const json of exercises) {
    lines.push(renderExerciseInsert(json), "");
  }
  for (const json of exercises) {
    const areaLines = renderAreaInserts(json);
    if (areaLines.length > 0) lines.push(...areaLines, "");
  }
  for (const json of exercises) {
    const variantLines = renderVariantInserts(json);
    if (variantLines.length > 0) lines.push(...variantLines, "");
  }
  lines.push("commit;", "");
  return lines.join("\n");
}

export function main(argv) {
  const args = parseArgs(argv);
  let sql;
  try {
    sql = generateSql(args.library);
  } catch (err) {
    process.stderr.write(`gen-seed: ${err.message}\n`);
    return 1;
  }
  if (args.check) {
    const current = existsSync(SEED_PATH) ? readFileSync(SEED_PATH, "utf8") : null;
    if (current !== sql) {
      console.log(SEED_REL_PATH);
      return 1;
    }
    return 0;
  }
  writeFileSync(args.out, sql, "utf8");
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  process.exit(main(process.argv.slice(2)));
}
