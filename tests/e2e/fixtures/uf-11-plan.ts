// T-0308b: the UF-11 e2e fixture data, in PostgREST row shape (snake_case), fed to the shared
// `mockSupabaseData(page, fixtures)`. Fixture F plus the AC-B4 check-in rows and two routines.
//
// Kept out of `uf-11-plan.spec.ts` so T-0308c can append its own cases to that spec without
// re-deriving the rows, and out of `fixtures/supabase-mock.ts`, which every lane shares and this
// ticket may not edit.
import type { OfflineFixtures } from "./supabase-mock.js";

export const AREAS = [
  "chest",
  "back",
  "shoulders",
  "arms",
  "core",
  "glutes",
  "quads",
  "hamstrings",
  "calves",
] as const;

/** Fixture F's 9 targets: 20/20/16/12/12/20/20/16/12, all `default`. */
const F_SETS = [20, 20, 16, 12, 12, 20, 20, 16, 12] as const;

export const AREA_TARGETS = AREAS.map((area, i) => ({
  area_id: area,
  sets_per_14d: F_SETS[i],
  source: "default",
  updated_at: "2026-08-02T08:00:00.000Z",
}));

/** Fixture F's profile. `onboarded_at` is well in the past, so the engine always has periods. */
export const PROFILE = {
  goal: "build_muscle",
  level: "intermediate",
  equipment: [],
  rhythm_min: 3,
  rhythm_max: 4,
  priority_areas: [],
  onboarded_at: "2026-08-02T08:00:00.000Z",
  plan_changed_at: "2026-08-02T08:00:00.000Z",
};

function checkinRow(
  id: string,
  proposedAt: string,
  completedLast: number,
  before: [number, number],
  proposed: [number, number],
  answer: "accepted" | "kept" | "withdrawn" | null,
) {
  return {
    id,
    period_index: 1,
    completed_prev: 0,
    completed_last: completedLast,
    rhythm_min_before: before[0],
    rhythm_max_before: before[1],
    proposed_min: proposed[0],
    proposed_max: proposed[1],
    proposed_at: proposedAt,
    answer,
    answered_at: answer ? proposedAt : null,
  };
}

/** AC-B4's four rows, deliberately NOT in newest-first order. */
export const CHECKINS = [
  checkinRow("K2", "2026-08-30T08:00:00.000Z", 2, [3, 4], [2, 3], "withdrawn"),
  checkinRow("K4", "2026-09-27T09:00:00.000Z", 1, [3, 4], [2, 3], null),
  checkinRow("K1", "2026-08-16T08:00:00.000Z", 3, [4, 5], [3, 4], "accepted"),
  checkinRow("K3", "2026-09-13T08:00:00.000Z", 10, [3, 4], [4, 5], "kept"),
];

export const ROUTINE_A_ID = "11111111-1111-4111-8111-aaaaaaaaaaaa";
export const ROUTINE_B_ID = "11111111-1111-4111-8111-bbbbbbbbbbbb";

export const ROUTINES = [
  { id: ROUTINE_A_ID, name: "Lower A", updated_at: "2026-09-01T08:00:00.000Z" },
  { id: ROUTINE_B_ID, name: "Upper B", updated_at: "2026-09-02T08:00:00.000Z" },
];

export const ROUTINE_ITEMS = [
  { routine_id: ROUTINE_A_ID, position: 0, exercise_id: "squat" },
  { routine_id: ROUTINE_A_ID, position: 1, exercise_id: "rdl" },
  { routine_id: ROUTINE_B_ID, position: 0, exercise_id: "bench" },
];

function exercise(id: string, area: string) {
  return {
    id,
    name: id,
    type: "compound",
    level: "beginner",
    equipment: [],
    instructions: [],
    mistakes: [],
    cue: null,
    timed: false,
    source: "test",
    license: "test",
    attribution: null,
    source_url: null,
    kind: "exercise",
    increment_kg: 2.5,
    default_duration_s: null,
    external_load: true,
    _area: area,
  };
}

const EXERCISES = [exercise("squat", "quads"), exercise("rdl", "hamstrings"), exercise("bench", "chest")];

/** Everything `mockSupabaseData` needs for UF-11.2 and UF-11.3. */
export const UF11_FIXTURES: OfflineFixtures = {
  sets: [],
  exercises: EXERCISES.map(({ _area, ...rest }) => rest),
  exerciseAreas: EXERCISES.map((e) => ({ exercise_id: e.id, area_id: e._area, weight: 1 })),
  areaTargets: AREA_TARGETS,
  profile: PROFILE,
  checkins: CHECKINS,
  routines: ROUTINES,
  routineItems: ROUTINE_ITEMS,
};
