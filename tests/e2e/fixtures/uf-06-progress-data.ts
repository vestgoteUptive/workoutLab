// T-0307b: the history, library and targets the UF-06 e2e spec serves through the Supabase
// mock. Dates are relative to the run's clock (the screens read `new Date()` in the browser),
// so the sets always sit inside the 56-day window.
import type { OfflineFixtures } from "./supabase-mock.js";

const DAY_MS = 86_400_000;

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

function setRow(
  clientId: string,
  exerciseId: string,
  daysAgo: number,
  weightKg: number,
  reps: number,
) {
  const at = new Date(Date.now() - daysAgo * DAY_MS).toISOString();
  return {
    client_id: clientId,
    session_id: `S-${daysAgo}`,
    exercise_id: exerciseId,
    is_warmup: false,
    completed_at: at,
    edited_at: at,
    deleted_at: null,
    reps,
    weight_kg: weightKg,
    duration_s: null,
  };
}

const AREAS = [
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

const base = {
  exercises: [exerciseRow("back-squat", "Back squat"), exerciseRow("bench-press", "Bench press")],
  exerciseAreas: [
    { exercise_id: "back-squat", area_id: "quads", weight: 1 },
    { exercise_id: "back-squat", area_id: "glutes", weight: 1 },
    { exercise_id: "bench-press", area_id: "chest", weight: 1 },
  ],
  areaTargets: AREAS.map((area) => ({
    area_id: area,
    sets_per_14d: 12,
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
};

/** A user who has never logged a set. */
export function zeroHistoryFixtures(): OfflineFixtures {
  return { ...base, sets: [] };
}

/** Back squat on two days and one bench press day. */
export function historyFixtures(): OfflineFixtures {
  return {
    ...base,
    sets: [
      setRow("c1", "back-squat", 2, 100, 8),
      setRow("c2", "back-squat", 2, 102.5, 5),
      setRow("c3", "back-squat", 6, 95, 8),
      setRow("c4", "bench-press", 3, 60, 8),
    ],
  };
}
