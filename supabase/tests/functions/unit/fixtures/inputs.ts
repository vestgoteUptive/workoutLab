// Shared fixtures for the handler-core unit tests (T-0203b). Mirrors the ticket's fixture user A:
// goal build_muscle, level intermediate, equipment [barbell, rack, bench, dumbbell], rhythm 3–4,
// 9 area_targets; now = 2026-09-28T08:00:00Z; tz = Europe/Stockholm.
import type { AreaTarget, EngineProfile, HistorySet, LibraryExercise } from "@workoutlab/shared";

export const NOW = "2026-09-28T08:00:00Z";
export const TZ = "Europe/Stockholm";

export const PROFILE_A: EngineProfile = {
  goal: "build_muscle",
  level: "intermediate",
  equipment: ["barbell", "rack", "bench", "dumbbell"],
  rhythmMin: 3,
  rhythmMax: 4,
  priorityAreas: [],
  onboardedAt: "2026-08-02T09:00:00Z",
  planUpdatedAt: "2026-08-02T09:00:00Z",
};

const AREA_TARGET_BASE: Record<string, number> = {
  chest: 20,
  back: 20,
  shoulders: 16,
  arms: 12,
  core: 12,
  glutes: 20,
  quads: 20,
  hamstrings: 16,
  calves: 12,
};

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

export function nineAreaTargets(): AreaTarget[] {
  return AREAS.map((area) => ({
    area,
    setsPer14d: AREA_TARGET_BASE[area],
    source: "default",
    updatedAt: "2026-08-02T09:00:00Z",
  }));
}

/** A 12-exercise library snapshot: the four named fixture exercises plus 8 filler exercises that
 * cover every area at least once, so `suggest`/`balance` have real candidates for every area. */
export function libraryFixture(): LibraryExercise[] {
  const exercise = (
    id: string,
    name: string,
    areas: Record<string, number>,
    overrides: Partial<LibraryExercise> = {},
  ): LibraryExercise => ({
    id,
    name,
    kind: "exercise",
    type: "compound",
    level: "intermediate",
    equipment: ["none"],
    areas,
    timed: false,
    incrementKg: 2.5,
    defaultDurationS: null,
    externalLoad: true,
    ...overrides,
  });

  return [
    exercise(
      "barbell-bench-press",
      "Barbell bench press",
      { chest: 1, shoulders: 0.5, arms: 0.5 },
      {
        equipment: ["barbell", "bench", "rack"],
      },
    ),
    exercise("barbell-row", "Barbell row", { back: 1, arms: 0.5 }, { equipment: ["barbell"] }),
    exercise(
      "barbell-back-squat",
      "Barbell back squat",
      { quads: 1, glutes: 1, hamstrings: 0.5, core: 0.5 },
      { equipment: ["barbell", "rack"], level: "advanced" },
    ),
    exercise(
      "push-up",
      "Push-up",
      { chest: 1, shoulders: 0.5, arms: 0.5 },
      {
        equipment: ["none"],
        externalLoad: false,
      },
    ),
    exercise(
      "overhead-press",
      "Overhead press",
      { shoulders: 1, arms: 0.5 },
      {
        equipment: ["barbell", "rack"],
      },
    ),
    exercise(
      "bicep-curl",
      "Bicep curl",
      { arms: 1 },
      { equipment: ["dumbbell"], type: "isolation" },
    ),
    exercise("plank", "Plank", { core: 1 }, { equipment: ["none"], externalLoad: false }),
    exercise("hip-thrust", "Hip thrust", { glutes: 1 }, { equipment: ["barbell", "bench"] }),
    exercise(
      "leg-curl",
      "Leg curl",
      { hamstrings: 1 },
      {
        equipment: ["dumbbell"],
        type: "isolation",
      },
    ),
    exercise(
      "calf-raise",
      "Calf raise",
      { calves: 1 },
      {
        equipment: ["dumbbell"],
        type: "isolation",
      },
    ),
    exercise("lat-pulldown", "Lat pulldown", { back: 1, arms: 0.5 }, { equipment: ["dumbbell"] }),
    exercise(
      "dumbbell-fly",
      "Dumbbell fly",
      { chest: 1 },
      {
        equipment: ["dumbbell"],
        type: "isolation",
      },
    ),
  ];
}

/** 20 hard sets over the last 12 days, spread across several exercises/areas. */
export function historyFixture(now: string = NOW): HistorySet[] {
  const set = (
    idx: number,
    exerciseId: string,
    daysAgo: number,
    reps: number,
    weightKg: number | null,
  ): HistorySet => ({
    clientId: `set-${idx}`,
    sessionId: `session-${Math.floor(idx / 4)}`,
    exerciseId,
    isWarmup: false,
    completedAt: new Date(new Date(now).getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
    editedAt: new Date(new Date(now).getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
    deletedAt: null,
    reps,
    weightKg,
    durationS: null,
  });

  const plan: Array<[string, number, number, number | null]> = [
    ["barbell-bench-press", 1, 8, 60],
    ["barbell-bench-press", 1, 8, 60],
    ["barbell-bench-press", 1, 8, 60],
    ["barbell-row", 1, 8, 50],
    ["barbell-row", 1, 8, 50],
    ["barbell-row", 1, 8, 50],
    ["barbell-back-squat", 3, 5, 80],
    ["barbell-back-squat", 3, 5, 80],
    ["barbell-back-squat", 3, 5, 80],
    ["push-up", 5, 15, null],
    ["push-up", 5, 15, null],
    ["overhead-press", 5, 8, 30],
    ["overhead-press", 5, 8, 30],
    ["bicep-curl", 8, 10, 12],
    ["bicep-curl", 8, 10, 12],
    ["plank", 8, 0, null],
    ["hip-thrust", 10, 10, 40],
    ["hip-thrust", 10, 10, 40],
    ["calf-raise", 12, 15, 20],
    ["calf-raise", 12, 15, 20],
  ];
  return plan.map(([exerciseId, daysAgo, reps, weightKg], idx) =>
    set(idx, exerciseId, daysAgo, reps, weightKg),
  );
}
