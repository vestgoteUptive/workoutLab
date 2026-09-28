// T-0102b AC18: row → engine mappers (D-0034 §1, D-0035, D-0037 §6, D-0041 §2).
import { describe, expect, it } from "vitest";
import {
  AREAS,
  toAreaTarget,
  toAreaTargets,
  toEngineProfile,
  toHistorySet,
  toLibraryExercise,
  toPlanCheckin,
  type HistorySet,
  type Tables,
} from "../src/index.js";
import { isValid } from "./support/spec.js";

const C1 = "c0000000-0000-4000-8000-000000000001";
const S1 = "10000000-0000-4000-8000-000000000001";
const USER = "00000000-0000-4000-8000-00000000000a";

const setRow: Tables<"session_sets"> = {
  id: "90000000-0000-4000-8000-000000000001",
  user_id: USER,
  client_id: C1,
  session_id: S1,
  exercise_id: "back-squat",
  set_index: 0,
  is_warmup: false,
  kind: "reps",
  reps: 8,
  weight_kg: 60,
  duration_s: null,
  rir: 2,
  backoff: false,
  completed_at: "2026-09-20T10:00:00+00:00",
  edited_at: "2026-09-20T10:05:00+00:00",
  deleted_at: null,
  created_at: "2026-09-20T10:05:01+00:00",
};

const expectedSet: HistorySet = {
  clientId: C1,
  sessionId: S1,
  exerciseId: "back-squat",
  isWarmup: false,
  completedAt: "2026-09-20T10:00:00+00:00",
  editedAt: "2026-09-20T10:05:00+00:00",
  deletedAt: null,
  reps: 8,
  weightKg: 60,
  durationS: null,
};

const backSquatRow: Tables<"exercises"> = {
  id: "back-squat",
  name: "Back squat",
  type: "compound",
  level: "intermediate",
  equipment: ["barbell", "rack"],
  instructions: ["Squat"],
  mistakes: [],
  cue: null,
  timed: false,
  source: "own",
  license: "CC0",
  attribution: null,
  source_url: null,
  kind: "exercise",
  increment_kg: 2.5,
  default_duration_s: null,
  external_load: true,
};

const profileRow: Tables<"profiles"> = {
  user_id: USER,
  goal: "build_muscle",
  level: "beginner",
  rhythm_min: 3,
  rhythm_max: 4,
  equipment: ["barbell", "rack", "bench"],
  priority_areas: ["back", "glutes"],
  onboarded_at: "2026-08-02T09:00:00+00:00",
  onboarding_timing_ms: 41000,
  plan_changed_at: "2026-09-20T08:00:00+00:00",
  created_at: "2026-08-02T09:00:00+00:00",
  updated_at: "2026-09-20T08:00:00+00:00",
};

describe("AC18 toHistorySet", () => {
  it("maps the row to camelCase with no pending key", () => {
    const set = toHistorySet(setRow);
    expect(set).toStrictEqual(expectedSet);
    expect("pending" in set).toBe(false);
    expect(isValid("HistorySet", set)).toBe(true);
  });

  it("sets pending only when passed", () => {
    expect(toHistorySet(setRow, { pending: true })).toStrictEqual({
      ...expectedSet,
      pending: true,
    });
  });

  it("keeps deletedAt on a tombstoned row (the engine filters it, rule 0)", () => {
    const tomb = { ...setRow, deleted_at: "2026-09-20T11:00:00+00:00" };
    expect(toHistorySet(tomb).deletedAt).toBe("2026-09-20T11:00:00+00:00");
  });
});

describe("AC18 toLibraryExercise", () => {
  const ex = toLibraryExercise(backSquatRow, [
    { area_id: "quads", weight: 1 },
    { area_id: "hamstrings", weight: 0.5 },
  ]);

  it("maps areas and the D-0037 §6 engine fields", () => {
    expect(ex.areas).toStrictEqual({ quads: 1, hamstrings: 0.5 });
    expect(ex).toMatchObject({
      externalLoad: true,
      incrementKg: 2.5,
      defaultDurationS: null,
      timed: false,
      kind: "exercise",
    });
    expect(isValid("LibraryExercise", ex)).toBe(true);
  });

  // D-0044 §2: DB → engine is a straight rename. The only inversion (NOT bodyweight) is in the
  // seed; an inverted mapper would turn every bodyweight row into a loaded one.
  const pushUpRow: Tables<"exercises"> = {
    ...backSquatRow,
    id: "push-up",
    name: "Push-up",
    equipment: [],
    increment_kg: 2.5, // D-0044 §4: the seed leaves the column default on bodyweight rows
    external_load: false,
  };

  it("maps external_load: false to externalLoad: false (D-0044, no inversion)", () => {
    const bw = toLibraryExercise(pushUpRow, [{ area_id: "chest", weight: 1 }]);
    expect(bw.externalLoad).toBe(false);
    expect(bw).toMatchObject({ id: "push-up", externalLoad: false, incrementKg: 2.5 });
    expect(isValid("LibraryExercise", bw)).toBe(true);
  });

  it("externalLoad equals external_load for every row polarity (D-0044)", () => {
    for (const row of [backSquatRow, pushUpRow]) {
      expect(toLibraryExercise(row, []).externalLoad).toBe(row.external_load);
    }
    expect(toLibraryExercise(backSquatRow, []).externalLoad).not.toBe(
      toLibraryExercise(pushUpRow, []).externalLoad,
    );
  });

  it("rejects an unknown area or weight", () => {
    expect(() => toLibraryExercise(backSquatRow, [{ area_id: "neck", weight: 1 }])).toThrow(
      RangeError,
    );
    expect(() => toLibraryExercise(backSquatRow, [{ area_id: "quads", weight: 0.7 }])).toThrow(
      RangeError,
    );
  });
});

describe("AC18 toEngineProfile", () => {
  it("maps plan_changed_at to planUpdatedAt (D-0035)", () => {
    const p = toEngineProfile(profileRow);
    expect(p.planUpdatedAt).toBe("2026-09-20T08:00:00+00:00");
    expect(p).toStrictEqual({
      goal: "build_muscle",
      level: "beginner",
      equipment: ["barbell", "rack", "bench"],
      rhythmMin: 3,
      rhythmMax: 4,
      priorityAreas: ["back", "glutes"],
      onboardedAt: "2026-08-02T09:00:00+00:00",
      planUpdatedAt: "2026-09-20T08:00:00+00:00",
    });
    expect(isValid("EngineProfile", p)).toBe(true);
  });
});

describe("AC18 toAreaTarget(s)", () => {
  const rows: Tables<"area_targets">[] = [...AREAS].reverse().map((area, i) => ({
    user_id: USER,
    area_id: area,
    sets_per_14d: 10 + i,
    source: i === 0 ? "manual" : "default",
    updated_at: "2026-08-02T09:00:00+00:00",
  }));

  it("maps nine rows to nine AreaTargets in the fixed area order", () => {
    const targets = toAreaTargets(rows);
    expect(targets.map((t) => t.area)).toEqual([...AREAS]);
    expect(targets.find((t) => t.area === "calves")).toStrictEqual({
      area: "calves",
      setsPer14d: 10,
      source: "manual",
      updatedAt: "2026-08-02T09:00:00+00:00",
    });
    for (const t of targets) expect(isValid("AreaTarget", t)).toBe(true);
    expect(toAreaTarget(rows[8]!)).toStrictEqual(targets[0]);
  });
});

describe("AC18 toPlanCheckin (engine reads only answeredAt, D-0041 §2)", () => {
  it("maps the row", () => {
    const c = toPlanCheckin({
      id: "20000000-0000-4000-8000-000000000001",
      user_id: USER,
      period_index: 3,
      completed_prev: 4,
      completed_last: 3,
      rhythm_min_before: 3,
      rhythm_max_before: 4,
      proposed_min: 2,
      proposed_max: 3,
      proposed_at: "2026-09-27T10:00:00+00:00",
      answer: null,
      answered_at: null,
    });
    expect(c).toMatchObject({ periodIndex: 3, proposedMin: 2, answer: null, answeredAt: null });
    expect(isValid("PlanCheckin", c)).toBe(true);
  });
});
