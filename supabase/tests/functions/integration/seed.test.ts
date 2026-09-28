// T-0203a AC4, AC5 (CI only — needs a real seeded stack, not runnable on this host's Docker).
// Reads every data/exercises/library/*.json directly (not through the generator) and compares
// it against the seeded public.exercises / exercise_areas / exercise_variants rows over the
// Supabase REST API, using the anon key (the library tables are public-read, D-0021/D-0029).
//
// Env (set by the CI `supabase` job from `supabase status -o env`, D-0053):
//   API_URL   e.g. http://127.0.0.1:54321
//   ANON_KEY  the local anon JWT
import { createClient } from "npm:@supabase/supabase-js@2";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
// supabase/tests/functions/integration -> repo root is four levels up.
const REPO_ROOT = join(HERE, "..", "..", "..", "..");
const LIBRARY_DIR = join(REPO_ROOT, "data", "exercises", "library");

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`${name} is not set (expected from \`supabase status -o env\`)`);
  }
  return value;
}

function client() {
  const url = requireEnv("API_URL");
  const anonKey = requireEnv("ANON_KEY");
  return createClient(url, anonKey);
}

async function loadLibraryFixtures(): Promise<
  Array<{ file: string; json: Record<string, unknown> }>
> {
  const out: Array<{ file: string; json: Record<string, unknown> }> = [];
  for await (const entry of Deno.readDir(LIBRARY_DIR)) {
    if (!entry.isFile || !entry.name.endsWith(".json")) continue;
    const raw = await Deno.readTextFile(join(LIBRARY_DIR, entry.name));
    out.push({ file: entry.name, json: JSON.parse(raw) });
  }
  out.sort((a, b) => (a.json.id as string).localeCompare(b.json.id as string));
  return out;
}

function sortedEntries(obj: Record<string, number>): Array<[string, number]> {
  return Object.entries(obj).sort(([a], [b]) => a.localeCompare(b));
}

Deno.test("AC4: seeded exercises match data/exercises/library/*.json field for field", async () => {
  const supabase = client();
  const fixtures = await loadLibraryFixtures();

  const { count, error: countError } = await supabase
    .from("exercises")
    .select("id", { count: "exact", head: true });
  if (countError) throw countError;
  assertEquals(count, fixtures.length, "count(exercises) equals the library file count");

  for (const { file, json } of fixtures) {
    const { data: rows, error } = await supabase
      .from("exercises")
      .select(
        "id, name, kind, type, level, equipment, instructions, mistakes, cue, timed, source, license, attribution, source_url, increment_kg, default_duration_s, external_load",
      )
      .eq("id", json.id);
    if (error) throw error;
    if (!rows || rows.length !== 1) {
      throw new Error(
        `${file}: expected exactly 1 row for id ${json.id}, got ${rows?.length ?? 0}`,
      );
    }
    const row = rows[0];

    assertEquals(row.name, json.name, `${file}: name`);
    assertEquals(row.kind, json.kind, `${file}: kind`);
    assertEquals(row.type, json.type, `${file}: type`);
    assertEquals(row.level, json.level, `${file}: level`);
    assertEquals(row.equipment, json.equipment, `${file}: equipment`);
    assertEquals(row.instructions, json.instructions, `${file}: instructions`);
    assertEquals(row.mistakes, json.mistakes ?? [], `${file}: mistakes`);
    assertEquals(row.cue, json.cue ?? null, `${file}: cue`);
    assertEquals(row.timed, Boolean(json.timed), `${file}: timed`);
    assertEquals(row.source, json.source, `${file}: source`);
    assertEquals(row.license, json.license, `${file}: license`);
    assertEquals(row.attribution, json.attribution ?? null, `${file}: attribution`);
    assertEquals(row.source_url, json.source_url ?? null, `${file}: source_url`);
    assertEquals(row.increment_kg, json.increment_kg ?? 2.5, `${file}: increment_kg`);
    assertEquals(
      row.default_duration_s,
      json.default_duration_s ?? null,
      `${file}: default_duration_s`,
    );

    const { data: areaRows, error: areaError } = await supabase
      .from("exercise_areas")
      .select("area_id, weight")
      .eq("exercise_id", json.id);
    if (areaError) throw areaError;
    const actualAreas: Record<string, number> = {};
    for (const r of areaRows ?? []) actualAreas[r.area_id] = r.weight;
    const expectedAreas = (json.areas ?? {}) as Record<string, number>;
    assertEquals(
      sortedEntries(actualAreas),
      sortedEntries(expectedAreas),
      `${file}: exercise_areas`,
    );

    const { data: variantRows, error: variantError } = await supabase
      .from("exercise_variants")
      .select("variant_id")
      .eq("exercise_id", json.id);
    if (variantError) throw variantError;
    const actualVariants = (variantRows ?? []).map((r) => r.variant_id as string).sort();
    const expectedVariants = [...((json.variants ?? []) as string[])].sort();
    assertEquals(actualVariants, expectedVariants, `${file}: exercise_variants`);
  }
});

Deno.test("AC5: external_load = NOT bodyweight for every seeded row (D-0044 a, d)", async () => {
  const supabase = client();
  const fixtures = await loadLibraryFixtures();
  const expectedFalseCount = fixtures.filter((f) => f.json.bodyweight === true).length;

  const { data: rows, error } = await supabase.from("exercises").select("id, external_load");
  if (error) throw error;
  const byId = new Map((rows ?? []).map((r) => [r.id as string, r.external_load as boolean]));

  for (const { file, json } of fixtures) {
    const externalLoad = byId.get(json.id as string);
    assertEquals(externalLoad, !json.bodyweight, `${file}: external_load = NOT bodyweight`);
  }

  const actualFalseCount = (rows ?? []).filter((r) => r.external_load === false).length;
  assertEquals(
    actualFalseCount,
    expectedFalseCount,
    "count(external_load = false) = count(bodyweight: true)",
  );
  if (actualFalseCount < 1 || expectedFalseCount < 1) {
    throw new Error("expected both counts to be >= 1");
  }
});
