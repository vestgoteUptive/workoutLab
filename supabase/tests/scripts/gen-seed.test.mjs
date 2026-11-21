// T-0203a AC1, AC2, AC3 (node:test part): supabase/scripts/gen-seed.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateSql, loadLibrary } from "../../scripts/gen-seed.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const SCRIPT = path.join(REPO_ROOT, "supabase", "scripts", "gen-seed.mjs");
const LIBRARY_DIR = path.join(REPO_ROOT, "data", "exercises", "library");
const SEED_PATH = path.join(REPO_ROOT, "supabase", "seed.sql");

test("AC1: gen-seed.mjs run twice via --out produces byte-identical output", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "gen-seed-"));
  const out1 = path.join(dir, "seed-1.sql");
  const out2 = path.join(dir, "seed-2.sql");
  execFileSync("node", [SCRIPT, "--out", out1]);
  execFileSync("node", [SCRIPT, "--out", out2]);
  const content1 = readFileSync(out1, "utf8");
  const content2 = readFileSync(out2, "utf8");
  assert.equal(content1, content2);
  rmSync(dir, { recursive: true, force: true });
});

test("AC1: --check exits 0 on the committed tree", () => {
  assert.doesNotThrow(() => execFileSync("node", [SCRIPT, "--check"]));
});

test("AC1: --check with a changed --library exits 1 and prints supabase/seed.sql", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "gen-seed-lib-"));
  for (const file of readdirSync(LIBRARY_DIR)) {
    let content = readFileSync(path.join(LIBRARY_DIR, file), "utf8");
    if (file === "push-up.json") {
      content = content.replace('"name": "Push-up"', '"name": "Push-up (changed)"');
    }
    writeFileSync(path.join(dir, file), content);
  }
  let stdout = "";
  let exitCode = 0;
  try {
    stdout = execFileSync("node", [SCRIPT, "--check", "--library", dir], { encoding: "utf8" });
  } catch (err) {
    stdout = err.stdout ?? "";
    exitCode = err.status;
  }
  assert.equal(exitCode, 1);
  assert.match(stdout, /supabase\/seed\.sql/);
  rmSync(dir, { recursive: true, force: true });
});

test("AC2: external_load and increment_kg columns and literal values (fixture library)", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "gen-seed-fixture-"));
  writeFileSync(
    path.join(dir, "fx-bw.json"),
    JSON.stringify({
      id: "fx-bw",
      name: "Fx bodyweight",
      kind: "exercise",
      type: "isolation",
      level: "beginner",
      equipment: ["none"],
      bodyweight: true,
      areas: { core: 1 },
      instructions: ["Do it."],
      cue: "Go",
      mistakes: ["None."],
      variants: [],
      timed: false,
      source: "workoutlab",
      license: "LicenseRef-workoutLab",
    }),
  );
  writeFileSync(
    path.join(dir, "fx-loaded.json"),
    JSON.stringify({
      id: "fx-loaded",
      name: "Fx loaded",
      kind: "exercise",
      type: "compound",
      level: "beginner",
      equipment: ["barbell"],
      bodyweight: false,
      increment_kg: 1.25,
      areas: { back: 1 },
      instructions: ["Do it."],
      cue: "Go",
      mistakes: ["None."],
      variants: [],
      timed: false,
      source: "workoutlab",
      license: "LicenseRef-workoutLab",
    }),
  );
  writeFileSync(
    path.join(dir, "fx-wu.json"),
    JSON.stringify({
      id: "fx-wu",
      name: "Fx warmup",
      kind: "warmup",
      type: "isolation",
      level: "beginner",
      equipment: ["none"],
      bodyweight: true,
      areas: {},
      instructions: ["Do it."],
      cue: "Go",
      mistakes: ["None."],
      variants: [],
      timed: false,
      source: "workoutlab",
      license: "LicenseRef-workoutLab",
    }),
  );
  const sql = generateSql(dir);
  assert.match(sql, /external_load/);
  assert.match(sql, /increment_kg/);
  const bwLine = sql.split("\n").find((l) => l.includes("'fx-bw'"));
  const loadedLine = sql.split("\n").find((l) => l.includes("'fx-loaded'"));
  const wuLine = sql.split("\n").find((l) => l.includes("'fx-wu'"));
  // column order: ... increment_kg, external_load at the tail of the values list.
  assert.match(bwLine, /2\.5, false\)$/);
  assert.match(loadedLine, /1\.25, true\)$/);
  assert.match(wuLine, /2\.5, false\)$/);
  rmSync(dir, { recursive: true, force: true });
});

test("AC2: a fixture file with no bodyweight fails closed (no fallback, no output)", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "gen-seed-nobw-"));
  writeFileSync(
    path.join(dir, "fx-nobw.json"),
    JSON.stringify({
      id: "fx-nobw",
      name: "No bodyweight field",
      kind: "exercise",
      type: "isolation",
      level: "beginner",
      equipment: ["none"],
      areas: { core: 1 },
      instructions: ["Do it."],
      cue: "Go",
      mistakes: ["None."],
      variants: [],
      timed: false,
      source: "workoutlab",
      license: "LicenseRef-workoutLab",
    }),
  );
  assert.throws(() => loadLibrary(dir), /fx-nobw\.json.*bodyweight/s);
  const out = path.join(dir, "seed.sql");
  let exitCode = 0;
  try {
    execFileSync("node", [SCRIPT, "--library", dir, "--out", out]);
  } catch (err) {
    exitCode = err.status;
  }
  assert.equal(exitCode, 1);
  assert.equal(existsSync(out), false);
  rmSync(dir, { recursive: true, force: true });
});

test("AC3: a name with a single quote is emitted doubled ('')", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "gen-seed-quote-"));
  writeFileSync(
    path.join(dir, "fx-quote.json"),
    JSON.stringify({
      id: "fx-quote",
      name: 'Farmer\'s "carry"',
      kind: "exercise",
      type: "compound",
      level: "beginner",
      equipment: ["none"],
      bodyweight: true,
      areas: { core: 1 },
      instructions: ["A line with a backslash \\ and braces {} and a comma, here."],
      cue: "Go",
      mistakes: ["None."],
      variants: [],
      timed: false,
      source: "workoutlab",
      license: "LicenseRef-workoutLab",
    }),
  );
  const sql = generateSql(dir);
  assert.match(sql, /Farmer''s "carry"/);
  assert.match(sql, /backslash \\ and braces \{\} and a comma, here\./);
  rmSync(dir, { recursive: true, force: true });
});

test("loadLibrary reads the committed library without error and in id order", () => {
  const exercises = loadLibrary(LIBRARY_DIR);
  assert.ok(exercises.length > 0);
  const ids = exercises.map((e) => e.id);
  const sorted = [...ids].sort();
  assert.deepEqual(ids, sorted);
});

test("committed supabase/seed.sql matches the generator output", () => {
  const generated = generateSql(LIBRARY_DIR);
  const committed = readFileSync(SEED_PATH, "utf8");
  assert.equal(committed, generated);
});
