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
});
