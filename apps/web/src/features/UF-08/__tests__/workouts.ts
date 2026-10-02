// T-0303b W-R7E4: the `api/openapi.yaml` Workout example (R7-E4), budget 30, warm-up in budget.
// Each call returns a fresh deep copy, so a test can mutate its own copy.
import type { Workout, WorkoutItem } from "@workoutlab/engine";

const ALL_ONE = {
  chest: 1,
  back: 1,
  shoulders: 1,
  arms: 1,
  core: 1,
  glutes: 1,
  quads: 1,
  hamstrings: 1,
  calves: 1,
};

export function benchItem(overrides: Partial<WorkoutItem> = {}): WorkoutItem {
  return {
    exerciseId: "bench-press",
    isMain: true,
    sets: 4,
    repsMin: 6,
    repsMax: 8,
    durationS: null,
    costS: 720,
    backoff: null,
    prefill: { weightKg: null, reps: 6, durationS: null, kind: "first_time" },
    reasons: [{ code: "main_lift" }, { code: "area_deficit", area: "chest", deficit: 1 }],
    ...overrides,
  };
}

export function wR7E4(): Workout {
  return {
    plan: {
      version: 1,
      mainLiftId: "bench-press",
      warmup: [
        { exerciseId: "wu-scap-push-up", durationS: 40 },
        { exerciseId: "wu-band-pull-apart", durationS: 40 },
        { exerciseId: "wu-bodyweight-squat", durationS: 40 },
        { exerciseId: "wu-arm-circle", durationS: 40 },
      ],
      items: [
        benchItem(),
        {
          exerciseId: "inverted-row",
          isMain: false,
          sets: 3,
          repsMin: 8,
          repsMax: 12,
          durationS: null,
          costS: 555,
          backoff: null,
          prefill: { weightKg: 0, reps: 8, durationS: null, kind: "first_time" },
          reasons: [{ code: "area_deficit", area: "back", deficit: 1 }],
        },
        {
          exerciseId: "leg-extension",
          isMain: false,
          sets: 2,
          repsMin: 10,
          repsMax: 15,
          durationS: null,
          costS: 270,
          backoff: null,
          prefill: { weightKg: null, reps: 10, durationS: null, kind: "first_time" },
          reasons: [{ code: "area_deficit", area: "quads", deficit: 1 }],
        },
      ],
      startDeficits: { ...ALL_ONE },
    },
    budgetMin: 30,
    warmupInBudget: true,
    energy: "normal",
    itemsTotalS: 1545,
    totalS: 1725,
    unusedS: 75,
    sessionReasons: [
      { code: "area_deficit", area: "chest", deficit: 1 },
      { code: "area_deficit", area: "back", deficit: 1 },
      { code: "area_deficit", area: "quads", deficit: 1 },
    ],
  };
}
