// T-0319 AC-2 (exercise details + variants), AC-4 (check-ins + routines), AC-6 (a refresh
// replaces, a failed refresh keeps), AC-7 (per user) and AC-9 (no write helpers).
//
// Clock per the ticket: tz Europe/Stockholm, now 2026-09-27T12:00:00+02:00.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSelectSpy } from "./select-spy.js";

const spy = createSelectSpy();
vi.mock("../../auth/client.js", () => ({ supabase: { from: spy.from } }));

const { refreshLibrary, refreshCheckins, refreshRoutines } = await import("../history.js");
const { loadExerciseDetail, loadVariants, loadCheckins, loadRoutines } =
  await import("../feature-loaders.js");
const { freshOfflineDb, signIn, signOut } = await import("./test-helpers.js");

const USER_A = "aaaaaaaa-1111-4111-8111-111111111111";
const USER_B = "bbbbbbbb-2222-4222-8222-222222222222";

/** The AC-2 back-squat row, as `select("*")` returns it. */
const BACK_SQUAT = {
  id: "back-squat",
  name: "Back squat",
  type: "compound",
  level: "beginner",
  equipment: [],
  instructions: ["a", "b"],
  mistakes: [],
  cue: "c",
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

const CHECKIN_ROW = {
  id: "ck-2",
  user_id: USER_A,
  period_index: 2,
  completed_prev: 3,
  completed_last: 5,
  rhythm_min_before: 3,
  rhythm_max_before: 4,
  proposed_min: 4,
  proposed_max: 5,
  proposed_at: "2026-09-26T09:00:00.000Z",
  answer: "accepted",
  answered_at: "2026-09-26T09:30:00.000Z",
};

const OLDER_CHECKIN_ROW = {
  ...CHECKIN_ROW,
  id: "ck-1",
  period_index: 1,
  proposed_at: "2026-09-12T09:00:00.000Z",
  answer: null,
  answered_at: null,
};

beforeEach(() => {
  freshOfflineDb();
  signIn(USER_A);
  spy.reset();
});

afterEach(() => signOut());

describe("AC-2 exercise details + variants", () => {
  beforeEach(() => {
    spy.setRows("exercises", [BACK_SQUAT]);
    spy.setRows("exercise_areas", [{ exercise_id: "back-squat", area_id: "quads", weight: 1 }]);
    // Deliberately NOT in id order, so the "sorted by id" clause is a real assertion.
    spy.setRows("exercise_variants", [
      { exercise_id: "back-squat", variant_id: "leg-press" },
      { exercise_id: "back-squat", variant_id: "goblet-squat" },
    ]);
  });

  it("caches the how-to text with variants sorted by id", async () => {
    await refreshLibrary();

    await expect(loadExerciseDetail("back-squat")).resolves.toEqual({
      id: "back-squat",
      instructions: ["a", "b"],
      mistakes: [],
      cue: "c",
      source: "workoutlab",
      license: "LicenseRef-workoutLab",
      attribution: null,
      sourceUrl: null,
      variants: ["goblet-squat", "leg-press"],
    });
    await expect(loadVariants("back-squat")).resolves.toEqual(["goblet-squat", "leg-press"]);
  });

  it("returns null / [] for an unknown id", async () => {
    await refreshLibrary();
    await expect(loadExerciseDetail("nope")).resolves.toBeNull();
    await expect(loadVariants("nope")).resolves.toEqual([]);
  });

  it("selects `exercises` exactly once per refresh (no second request for the text)", async () => {
    await refreshLibrary();
    expect(spy.countFor("exercises")).toBe(1);
    expect(spy.countFor("exercise_variants")).toBe(1);
  });

  it("gives an exercise with no variant row an empty variants list", async () => {
    spy.setRows("exercises", [BACK_SQUAT, { ...BACK_SQUAT, id: "plank", cue: null }]);
    await refreshLibrary();
    await expect(loadVariants("plank")).resolves.toEqual([]);
    expect((await loadExerciseDetail("plank"))?.cue).toBeNull();
  });
});

describe("AC-4 check-ins", () => {
  it("maps every row with toPlanCheckin, newest proposedAt first", async () => {
    // Oldest first in the server response, so the sort is doing the work.
    spy.setRows("plan_checkins", [OLDER_CHECKIN_ROW, CHECKIN_ROW]);
    await refreshCheckins();

    await expect(loadCheckins()).resolves.toEqual([
      {
        id: "ck-2",
        periodIndex: 2,
        completedPrev: 3,
        completedLast: 5,
        rhythmMinBefore: 3,
        rhythmMaxBefore: 4,
        proposedMin: 4,
        proposedMax: 5,
        proposedAt: "2026-09-26T09:00:00.000Z",
        answer: "accepted",
        answeredAt: "2026-09-26T09:30:00.000Z",
      },
      {
        id: "ck-1",
        periodIndex: 1,
        completedPrev: 3,
        completedLast: 5,
        rhythmMinBefore: 3,
        rhythmMaxBefore: 4,
        proposedMin: 4,
        proposedMax: 5,
        proposedAt: "2026-09-12T09:00:00.000Z",
        answer: null,
        answeredAt: null,
      },
    ]);
  });

  it("returns [] on a fresh database (zero history)", async () => {
    await expect(loadCheckins()).resolves.toEqual([]);
  });
});

describe("AC-4 routines", () => {
  beforeEach(() => {
    spy.setRows("routines", [
      { id: "R", name: "Lower A", updated_at: "2026-09-20T10:00:00.000Z" },
      { id: "R2", name: "Full body", updated_at: "2026-09-21T10:00:00.000Z" },
    ]);
    // Positions out of order on the wire (2, 0, 1), as the AC requires.
    spy.setRows("routine_items", [
      { routine_id: "R", position: 2, exercise_id: "calf-raise" },
      { routine_id: "R", position: 0, exercise_id: "back-squat" },
      { routine_id: "R", position: 1, exercise_id: "leg-curl" },
      { routine_id: "R2", position: 0, exercise_id: "bench-press" },
    ]);
  });

  it("sorts items by position and routines by name", async () => {
    await refreshRoutines();
    await expect(loadRoutines()).resolves.toEqual([
      {
        id: "R2",
        name: "Full body",
        updatedAt: "2026-09-21T10:00:00.000Z",
        items: [{ position: 0, exerciseId: "bench-press" }],
      },
      {
        id: "R",
        name: "Lower A",
        updatedAt: "2026-09-20T10:00:00.000Z",
        items: [
          { position: 0, exerciseId: "back-squat" },
          { position: 1, exerciseId: "leg-curl" },
          { position: 2, exerciseId: "calf-raise" },
        ],
      },
    ]);
  });

  it("breaks a name tie by id, so the order is total", async () => {
    spy.setRows("routines", [
      { id: "r-b", name: "Lower A", updated_at: "2026-09-20T10:00:00.000Z" },
      { id: "r-a", name: "Lower A", updated_at: "2026-09-21T10:00:00.000Z" },
    ]);
    spy.setRows("routine_items", []);
    await refreshRoutines();
    expect((await loadRoutines()).map((r) => r.id)).toEqual(["r-a", "r-b"]);
  });

  it("keeps a routine with no items", async () => {
    spy.setRows("routine_items", []);
    await refreshRoutines();
    expect((await loadRoutines()).map((r) => r.items)).toEqual([[], []]);
  });
});

describe("AC-6 a refresh replaces, a failed refresh keeps", () => {
  it("a second refreshRoutines whose data no longer holds R removes R", async () => {
    spy.setRows("routines", [{ id: "R", name: "Lower A", updated_at: "2026-09-20T10:00:00Z" }]);
    spy.setRows("routine_items", [{ routine_id: "R", position: 0, exercise_id: "back-squat" }]);
    await refreshRoutines();
    expect(await loadRoutines()).toHaveLength(1);

    spy.setRows("routines", []);
    spy.setRows("routine_items", []);
    await refreshRoutines();
    expect(await loadRoutines()).toEqual([]);
  });

  it("a rejecting routines select throws and leaves the previous rows intact", async () => {
    spy.setRows("routines", [{ id: "R", name: "Lower A", updated_at: "2026-09-20T10:00:00Z" }]);
    spy.setRows("routine_items", [{ routine_id: "R", position: 0, exercise_id: "back-squat" }]);
    await refreshRoutines();

    spy.fail("routines", { code: "PGRST301", message: "JWT expired" });
    await expect(refreshRoutines()).rejects.toMatchObject({ code: "PGRST301" });

    // The whole point: a failed refresh must not empty the cache the user is reading offline.
    const kept = await loadRoutines();
    expect(kept).toHaveLength(1);
    expect(kept[0]!.items).toEqual([{ position: 0, exerciseId: "back-squat" }]);
  });

  it("a rejecting routine_items select also keeps the previous rows", async () => {
    spy.setRows("routines", [{ id: "R", name: "Lower A", updated_at: "2026-09-20T10:00:00Z" }]);
    spy.setRows("routine_items", [{ routine_id: "R", position: 0, exercise_id: "back-squat" }]);
    await refreshRoutines();

    spy.fail("routine_items", { code: "PGRST301", message: "JWT expired" });
    await expect(refreshRoutines()).rejects.toMatchObject({ code: "PGRST301" });
    expect(await loadRoutines()).toHaveLength(1);
  });

  it("a rejecting plan_checkins select keeps the previous check-ins", async () => {
    spy.setRows("plan_checkins", [CHECKIN_ROW]);
    await refreshCheckins();
    expect(await loadCheckins()).toHaveLength(1);

    spy.fail("plan_checkins", { code: "PGRST301", message: "JWT expired" });
    await expect(refreshCheckins()).rejects.toMatchObject({ code: "PGRST301" });
    expect(await loadCheckins()).toHaveLength(1);
  });

  it("a rejecting exercise_variants select keeps the previous details AND library", async () => {
    spy.setRows("exercises", [BACK_SQUAT]);
    spy.setRows("exercise_areas", [{ exercise_id: "back-squat", area_id: "quads", weight: 1 }]);
    spy.setRows("exercise_variants", [{ exercise_id: "back-squat", variant_id: "leg-press" }]);
    await refreshLibrary();

    spy.fail("exercise_variants", { code: "PGRST301", message: "JWT expired" });
    await expect(refreshLibrary()).rejects.toMatchObject({ code: "PGRST301" });
    await expect(loadVariants("back-squat")).resolves.toEqual(["leg-press"]);
    const { loadLibrary } = await import("../history.js");
    expect(await loadLibrary()).toHaveLength(1);
  });

  it("a second refreshLibrary drops a detail whose exercise is gone", async () => {
    spy.setRows("exercises", [BACK_SQUAT, { ...BACK_SQUAT, id: "gone" }]);
    spy.setRows("exercise_areas", []);
    spy.setRows("exercise_variants", []);
    await refreshLibrary();
    expect(await loadExerciseDetail("gone")).not.toBeNull();

    spy.setRows("exercises", [BACK_SQUAT]);
    await refreshLibrary();
    expect(await loadExerciseDetail("gone")).toBeNull();
    expect(await loadExerciseDetail("back-squat")).not.toBeNull();
  });
});

describe("AC-7 per user", () => {
  it("B never sees A's details, check-ins or routines, and B's refresh keeps A's rows", async () => {
    spy.setRows("exercises", [BACK_SQUAT]);
    spy.setRows("exercise_areas", []);
    spy.setRows("exercise_variants", [{ exercise_id: "back-squat", variant_id: "leg-press" }]);
    spy.setRows("plan_checkins", [CHECKIN_ROW]);
    spy.setRows("routines", [{ id: "R", name: "Lower A", updated_at: "2026-09-20T10:00:00Z" }]);
    spy.setRows("routine_items", [{ routine_id: "R", position: 0, exercise_id: "back-squat" }]);

    await refreshLibrary();
    await refreshCheckins();
    await refreshRoutines();

    // B signs in on the same device. RLS means B's selects return B's rows: here, none.
    signOut();
    signIn(USER_B);
    expect(await loadExerciseDetail("back-squat")).toBeNull();
    expect(await loadVariants("back-squat")).toEqual([]);
    expect(await loadCheckins()).toEqual([]);
    expect(await loadRoutines()).toEqual([]);

    spy.setRows("exercises", []);
    spy.setRows("exercise_variants", []);
    spy.setRows("plan_checkins", []);
    spy.setRows("routines", []);
    spy.setRows("routine_items", []);
    await refreshLibrary();
    await refreshCheckins();
    await refreshRoutines();

    // A's rows survived B's replacing refreshes: the delete is scoped by userId, not global.
    signOut();
    signIn(USER_A);
    expect(await loadExerciseDetail("back-squat")).not.toBeNull();
    expect(await loadVariants("back-squat")).toEqual(["leg-press"]);
    expect(await loadCheckins()).toHaveLength(1);
    expect(await loadRoutines()).toHaveLength(1);
  });

  it("every loader is empty when signed out", async () => {
    spy.setRows("plan_checkins", [CHECKIN_ROW]);
    await refreshCheckins();
    signOut();
    expect(await loadExerciseDetail("back-squat")).toBeNull();
    expect(await loadVariants("back-squat")).toEqual([]);
    expect(await loadCheckins()).toEqual([]);
    expect(await loadRoutines()).toEqual([]);
  });
});
