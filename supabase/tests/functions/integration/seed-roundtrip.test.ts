// T-0203a AC3 (CI only): the generator's SQL string-escaping survives a real psql round-trip.
// Builds a one-exercise fixture seed with `generateSql` (the same code path that produces the
// committed supabase/seed.sql), loads it against the local stack inside a transaction that's
// always rolled back (so it never pollutes the real seeded library), and checks that `name` and
// `instructions` read back byte-for-byte equal to the source JSON.
//
// Env: DB_URL, e.g. `postgresql://postgres:postgres@127.0.0.1:54322/postgres`, set by the CI
// `supabase` job from `supabase status -o env` (D-0053). Requires `psql` on PATH and
// --allow-run=psql --allow-write --allow-read --allow-env.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
// supabase/tests/functions/integration -> supabase/scripts is two levels up, then into scripts.
const GEN_SEED_PATH = join(HERE, "..", "..", "..", "scripts", "gen-seed.mjs");

const FIXTURE = {
  id: "fx-quote-roundtrip",
  name: 'Farmer\'s "carry"',
  kind: "exercise",
  type: "compound",
  level: "beginner",
  equipment: ["none"],
  bodyweight: true,
  areas: { core: 1 },
  instructions: [
    "A line with a backslash \\ and braces {} and a comma, here.",
    "A second line with a single quote ' in it.",
  ],
  cue: "Go",
  mistakes: ["None."],
  variants: [],
  timed: false,
  source: "workoutlab",
  license: "LicenseRef-workoutLab",
};

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`${name} is not set (expected from \`supabase status -o env\`)`);
  }
  return value;
}

/** Strips the generator's own `begin;` / `commit;` wrapper so the caller can supply its own. */
function unwrapTransaction(sql: string): string {
  const lines = sql.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  if (lines[lines.length - 1] !== "commit;") {
    throw new Error("generateSql output did not end with commit;");
  }
  lines.pop();
  const beginIdx = lines.findIndex((l) => l === "begin;");
  if (beginIdx === -1) throw new Error("generateSql output did not contain begin;");
  return lines.slice(beginIdx + 1).join("\n");
}

Deno.test("AC3: a generated fixture seed round-trips through psql unchanged", async () => {
  const dbUrl = requireEnv("DB_URL");

  const dir = await Deno.makeTempDir({ prefix: "gen-seed-roundtrip-" });
  try {
    await Deno.writeTextFile(join(dir, `${FIXTURE.id}.json`), JSON.stringify(FIXTURE, null, 2));

    const { generateSql } = await import(`file://${GEN_SEED_PATH}`);
    const inserts = unwrapTransaction(generateSql(dir));

    const script = [
      "begin;",
      inserts,
      "\\pset tuples_only on",
      "\\pset format unaligned",
      `select jsonb_build_object('name', name, 'instructions', instructions)` +
        ` from public.exercises where id = '${FIXTURE.id}';`,
      "rollback;",
      "",
    ].join("\n");
    const scriptPath = join(dir, "roundtrip.sql");
    await Deno.writeTextFile(scriptPath, script);

    const command = new Deno.Command("psql", {
      args: [dbUrl, "-v", "ON_ERROR_STOP=1", "-f", scriptPath],
      stdout: "piped",
      stderr: "piped",
    });
    const { code, stdout, stderr } = await command.output();
    const out = new TextDecoder().decode(stdout).trim();
    const err = new TextDecoder().decode(stderr);
    if (code !== 0) {
      throw new Error(`psql exited ${code}: ${err}`);
    }
    const lastLine = out
      .split("\n")
      .filter((l) => l.length > 0)
      .pop();
    if (!lastLine) {
      throw new Error(`psql produced no row for id ${FIXTURE.id}: stdout was empty`);
    }
    const row = JSON.parse(lastLine) as { name: string; instructions: string[] };

    assertEquals(row.name, FIXTURE.name, "name round-trips exactly");
    assertEquals(row.instructions, FIXTURE.instructions, "instructions round-trip exactly");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
