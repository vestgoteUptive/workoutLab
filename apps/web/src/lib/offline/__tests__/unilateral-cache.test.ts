// T-0972 AC4 (D-0263 §1, §2): `unilateral` reaches the cached ExerciseDetail; a row cached before
// the field existed reads as null with no IndexedDB version change; offline serves the cache.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSelectSpy } from "./select-spy.js";

const spy = createSelectSpy();
vi.mock("../../auth/client.js", () => ({ supabase: { from: spy.from } }));

const { refreshLibrary } = await import("../history.js");
const { loadExerciseDetail } = await import("../feature-loaders.js");
const { offlineDb } = await import("../db.js");
const { freshOfflineDb, signIn, signOut } = await import("./test-helpers.js");
const { toUnilateral } = await import("@workoutlab/shared");
const { loadLibrary } = await import("../history.js");
const { effectiveLibrary } = await import("../effective-library.js");

const USER = "aaaaaaaa-1111-4111-8111-111111111111";

const base = {
  name: "x",
  type: "compound",
  level: "beginner",
  equipment: [],
  instructions: ["a"],
  mistakes: [],
  cue: null,
  source: "workoutlab",
  license: "LicenseRef-workoutLab",
  attribution: null,
  source_url: null,
  kind: "exercise",
  timed: false,
  increment_kg: 2.5,
  default_duration_s: null,
  external_load: true,
};
const ROWS = [
  { ...base, id: "dumbbell-row", unilateral: "arm" },
  { ...base, id: "barbell-row", unilateral: null },
];

beforeEach(() => {
  freshOfflineDb();
  signIn(USER);
  spy.reset();
  spy.setRows("exercises", ROWS);
  spy.setRows("exercise_areas", []);
  spy.setRows("exercise_variants", []);
});
afterEach(() => signOut());

describe("T-0972 AC4 unilateral in the library cache", () => {
  it("online: refreshLibrary caches arm for dumbbell-row and null for barbell-row", async () => {
    await refreshLibrary();
    expect((await loadExerciseDetail("dumbbell-row"))?.unilateral).toBe("arm");
    expect((await loadExerciseDetail("barbell-row"))?.unilateral).toBeNull();
  });

  it("old cache: a detail cached without the field reads as null, no error, no version bump", async () => {
    await refreshLibrary();
    const db = offlineDb();
    const versionBefore = db.verno;
    const cached = await db.exerciseDetails.toArray();
    for (const c of cached) delete (c.detail as { unilateral?: unknown }).unilateral;
    await db.exerciseDetails.bulkPut(cached);
    const detail = await loadExerciseDetail("dumbbell-row");
    expect(detail).not.toBeNull();
    expect("unilateral" in (detail as object)).toBe(false);
    expect(toUnilateral(detail)).toBeNull();
    expect(db.verno).toBe(versionBefore);
  });

  it("old cache backfills on the next refresh", async () => {
    await refreshLibrary();
    const db = offlineDb();
    const cached = await db.exerciseDetails.toArray();
    for (const c of cached) delete (c.detail as { unilateral?: unknown }).unilateral;
    await db.exerciseDetails.bulkPut(cached);
    await refreshLibrary();
    expect((await loadExerciseDetail("dumbbell-row"))?.unilateral).toBe("arm");
  });

  it("offline: a failed refresh leaves the cached rows unchanged", async () => {
    await refreshLibrary();
    const before = await loadExerciseDetail("dumbbell-row");
    spy.fail("exercises", { code: "PGRST301", message: "offline" });
    await expect(refreshLibrary()).rejects.toMatchObject({ code: "PGRST301" });
    await expect(loadExerciseDetail("dumbbell-row")).resolves.toEqual(before);
  });

  it("T-0978a AC5 refreshLibrary caches the flag on the library row, only for a flagged row", async () => {
    await refreshLibrary();
    const rows = await offlineDb().libraryCache.toArray();
    const byId = (id: string) => rows.find((r) => r.exercise.id === id)?.exercise;
    expect(byId("dumbbell-row")?.unilateral).toBe("arm");
    expect(byId("barbell-row")).toBeDefined();
    expect("unilateral" in (byId("barbell-row") as object)).toBe(false);
    expect((await loadExerciseDetail("dumbbell-row"))?.unilateral).toBe("arm");
  });

  it("T-0978a AC5 a libraryCache row written before the flag reads undefined, no throw", async () => {
    await refreshLibrary();
    const db = offlineDb();
    const rows = await db.libraryCache.toArray();
    for (const r of rows) delete (r.exercise as { unilateral?: unknown }).unilateral;
    await db.libraryCache.bulkPut(rows);
    const lib = await loadLibrary();
    expect(lib.length).toBe(2);
    expect(lib.find((e) => e.id === "dumbbell-row")?.unilateral).toBeUndefined();
  });

  it("T-0978a AC5 effectiveLibrary keeps the flag next to an overridden step", async () => {
    await refreshLibrary();
    const lib = await loadLibrary();
    const out = effectiveLibrary(lib, new Map([["dumbbell-row", 4]]));
    const row = out.find((e) => e.id === "dumbbell-row");
    expect(row?.unilateral).toBe("arm");
    expect(row?.incrementKg).toBe(4);
  });
});
