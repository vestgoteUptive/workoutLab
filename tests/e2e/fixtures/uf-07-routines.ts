// Fixture data for `uf-07-routines.spec.ts` (T-0308a), passed to `mockSupabaseData`. Names and
// ids match the T-0308a ticket fixtures. Row shapes are PostgREST's (snake_case).
import type { OfflineFixtures } from "./supabase-mock.js";

export const ROUTINE_ID = "22222222-2222-4222-8222-222222222222";

const EXERCISES: Array<[string, string, string]> = [
  ["barbell-back-squat", "Barbell back squat", "quads"],
  ["romanian-deadlift-barbell", "Romanian deadlift (barbell)", "hamstrings"],
  ["leg-curl-machine", "Leg curl (machine)", "hamstrings"],
  ["goblet-squat-dumbbell", "Goblet squat", "quads"],
  ["bench-press-barbell", "Bench press", "chest"],
];

function exerciseRow(id: string, name: string) {
  return {
    id,
    name,
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
  };
}

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
];

export function routineFixtures(): OfflineFixtures {
  return {
    sets: [],
    exercises: EXERCISES.map(([id, name]) => exerciseRow(id, name)),
    exerciseAreas: EXERCISES.map(([id, , area]) => ({ exercise_id: id, area_id: area, weight: 1 })),
    areaTargets: AREAS.map((area) => ({
      area_id: area,
      sets_per_14d: 10,
      source: "default",
      updated_at: "2026-09-01T00:00:00.000Z",
    })),
    profile: {
      goal: "build_muscle",
      level: "beginner",
      equipment: [],
      rhythm_min: 3,
      rhythm_max: 4,
      priority_areas: [],
      onboarded_at: "2026-09-01T00:00:00.000Z",
      plan_changed_at: "2026-09-01T00:00:00.000Z",
    },
    routines: [{ id: ROUTINE_ID, name: "Lower A", updated_at: "2026-09-20T10:00:00.000Z" }],
    routineItems: [
      { routine_id: ROUTINE_ID, position: 0, exercise_id: "barbell-back-squat" },
      { routine_id: ROUTINE_ID, position: 1, exercise_id: "romanian-deadlift-barbell" },
      { routine_id: ROUTINE_ID, position: 2, exercise_id: "leg-curl-machine" },
    ],
  };
}
