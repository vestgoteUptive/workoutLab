// T-0302a/T-0302c UF-02.1 test fixtures (docs/engine-rules.md §Fixtures):
//   F-tz      now = 2026-09-27T12:00:00+02:00, Europe/Stockholm, en-GB
//   F-targets chest/back/glutes/quads 20, shoulders/hamstrings 16, arms/core/calves 12
//   L1        the library table, as a web fixture copy, with display names ("Bench press")
//   W-R7E4    the `Workout` example in api/openapi.yaml (T-0302c)
import type { Workout, WorkoutItem } from "@workoutlab/engine";
import type {
  Area,
  AreaBalance,
  AreaTarget,
  BalanceResult,
  EngineProfile,
  HistorySet,
  LibraryExercise,
} from "@workoutlab/shared";

export const TZ = "Europe/Stockholm";
export const NOW = "2026-09-27T12:00:00+02:00";
export const LOCALE = "en-GB";
export const F_TZ = { now: new Date(NOW), timeZone: TZ, locale: LOCALE } as const;

export const AREA_ORDER = [
  "chest",
  "back",
  "shoulders",
  "arms",
  "core",
  "glutes",
  "quads",
  "hamstrings",
  "calves",
] as const satisfies readonly Area[];

export const F_TARGETS: Record<Area, number> = {
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

export function targets(areas: readonly Area[] = AREA_ORDER): AreaTarget[] {
  return areas.map((area) => ({
    area,
    setsPer14d: F_TARGETS[area],
    source: "default" as const,
    updatedAt: "2026-08-02T00:00:00.000Z",
  }));
}

/** F-profile. */
export const PROFILE: EngineProfile = {
  goal: "build_muscle",
  level: "beginner",
  equipment: ["barbell", "rack", "bench", "dumbbell", "cable", "machine", "pullup-bar"],
  rhythmMin: 3,
  rhythmMax: 4,
  priorityAreas: [],
  onboardedAt: "2026-08-02T00:00:00.000Z",
  planUpdatedAt: "2026-08-02T00:00:00.000Z",
};

type Row = [
  id: string,
  type: LibraryExercise["type"],
  equipment: string[],
  areas: LibraryExercise["areas"],
  incrementKg: number | null,
  extra?: Partial<LibraryExercise>,
];

const L1_ROWS: Row[] = [
  [
    "back-squat",
    "compound",
    ["barbell", "rack"],
    { quads: 1, glutes: 1, hamstrings: 0.5, core: 0.5 },
    2.5,
  ],
  ["romanian-deadlift", "compound", ["barbell"], { hamstrings: 1, glutes: 0.5 }, 2.5],
  ["hip-thrust", "compound", ["barbell", "bench"], { glutes: 1, hamstrings: 0.5 }, 2.5],
  ["leg-extension", "isolation", ["machine"], { quads: 1 }, 5],
  ["leg-curl", "isolation", ["machine"], { hamstrings: 1 }, 5],
  ["calf-raise", "isolation", ["machine"], { calves: 1 }, 5],
  ["bench-press", "compound", ["barbell", "bench"], { chest: 1, shoulders: 0.5, arms: 0.5 }, 2.5],
  ["db-bench-press", "compound", ["dumbbell", "bench"], { chest: 1, shoulders: 0.5, arms: 0.5 }, 2],
  ["push-up", "compound", [], { chest: 1, arms: 0.5, core: 0.5 }, null],
  ["overhead-press", "compound", ["barbell"], { shoulders: 1, arms: 0.5, core: 0.5 }, 2.5],
  ["lateral-raise", "isolation", ["dumbbell"], { shoulders: 1 }, 2],
  ["barbell-row", "compound", ["barbell"], { back: 1, arms: 0.5 }, 2.5],
  ["db-row", "compound", ["dumbbell", "bench"], { back: 1, arms: 0.5 }, 2],
  ["inverted-row", "compound", ["rack"], { back: 1, arms: 0.5, core: 0.5 }, null],
  ["lat-pulldown", "compound", ["cable"], { back: 1, arms: 0.5 }, 5],
  ["seated-cable-row", "compound", ["cable"], { back: 1, arms: 0.5 }, 5],
  ["straight-arm-pulldown", "isolation", ["cable"], { back: 1 }, 5],
  ["pull-up", "compound", ["pullup-bar"], { back: 1, arms: 0.5 }, null, { level: "intermediate" }],
  ["biceps-curl", "isolation", ["dumbbell"], { arms: 1 }, 2],
  ["plank", "isolation", [], { core: 1 }, null, { timed: true, defaultDurationS: 45 }],
  ["dead-bug", "isolation", [], { core: 1 }, null],
  ["hanging-knee-raise", "isolation", ["pullup-bar"], { core: 1 }, null],
];

/** "bench-press" → "Bench press": a fixture display name, so a row can show the library name. */
const displayName = (id: string): string => {
  const words = id.replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** The L1 library (docs/engine-rules.md §Fixtures). */
export const L1: LibraryExercise[] = L1_ROWS.map(([id, type, equipment, areas, inc, extra]) => ({
  id,
  name: displayName(id),
  kind: "exercise",
  type,
  level: "beginner",
  equipment,
  areas,
  timed: false,
  defaultDurationS: null,
  // The contract type has a numeric `incrementKg`; a bodyweight row ("bw") is `externalLoad: false`.
  incrementKg: inc ?? 2.5,
  externalLoad: inc !== null,
  ...extra,
}));

export const RDL = "romanian-deadlift";

/** `count` hard sets of `exerciseId`, all completed at `completedAt`. */
export function history(
  exerciseId: string,
  completedAt: string,
  count: number,
  options: { prefix?: string; isWarmup?: boolean } = {},
): HistorySet[] {
  const iso = new Date(completedAt).toISOString();
  const prefix = options.prefix ?? `${exerciseId}-${completedAt}`;
  return Array.from({ length: count }, (_, i) => ({
    clientId: `${prefix}-${i}`,
    sessionId: "S1",
    exerciseId,
    isWarmup: options.isWarmup ?? false,
    completedAt: iso,
    editedAt: iso,
    deletedAt: null,
    reps: 8,
    weightKg: 60,
    durationS: null,
  }));
}

/** R5-E1: 4 hard RDL sets on 2026-09-17 only. */
export const R5_E1 = history(RDL, "2026-09-17T18:00:00+02:00", 4);
/** Only older sets: 4 hard RDL sets on 2026-09-01, before the 09-14…09-27 window. */
export const OLDER_ONLY = history(RDL, "2026-09-01T18:00:00+02:00", 4);
/** A balanced history: every area at or above target, trained yesterday. */
export const BALANCED: HistorySet[] = [
  ...history("back-squat", "2026-09-26T18:00:00+02:00", 20, { prefix: "bs" }),
  ...history("romanian-deadlift", "2026-09-26T18:00:00+02:00", 16, { prefix: "rdl" }),
  ...history("bench-press", "2026-09-26T18:00:00+02:00", 20, { prefix: "bp" }),
  ...history("barbell-row", "2026-09-26T18:00:00+02:00", 20, { prefix: "row" }),
  ...history("lateral-raise", "2026-09-26T18:00:00+02:00", 16, { prefix: "lr" }),
  ...history("calf-raise", "2026-09-26T18:00:00+02:00", 12, { prefix: "cr" }),
];

// ---- Stubbed `BalanceResult`s, for the "the UI computes nothing" ACs ----

export function areaBalance(area: Area, overrides: Partial<AreaBalance> = {}): AreaBalance {
  return {
    area,
    load: 0,
    target: F_TARGETS[area],
    targetSource: "default",
    targetUpdatedAt: "2026-08-02T00:00:00.000Z",
    deficit: 1,
    coverageStep: 0,
    needsAttention: false,
    recovering: false,
    lastTrainedDate: null,
    days: Array.from({ length: 14 }, () => 0),
    contributors: [],
    ...overrides,
  };
}

export function balanceResult(areas: AreaBalance[]): BalanceResult {
  return {
    windowStart: "2026-09-14",
    windowEnd: "2026-09-27",
    computedAt: "2026-09-27T10:00:00.000Z",
    areas,
  };
}

/** A result in which exactly `flagged` areas (in that order, first) need attention. */
export function resultWithAttention(flagged: readonly Area[]): BalanceResult {
  const rest = AREA_ORDER.filter((a) => !flagged.includes(a));
  return balanceResult([
    ...flagged.map((a) => areaBalance(a, { needsAttention: true })),
    ...rest.map((a) => areaBalance(a, { load: 5, deficit: 0.2, coverageStep: 3 })),
  ]);
}

// ---- T-0302c: suggest() outputs, for the "the card renders the engine's Workout" ACs ----

export function workoutItem(
  exerciseId: string,
  sets: number,
  repsMin: number | null,
  repsMax: number | null,
  overrides: Partial<WorkoutItem> = {},
): WorkoutItem {
  return {
    exerciseId,
    isMain: false,
    sets,
    repsMin,
    repsMax,
    durationS: null,
    costS: 300,
    backoff: null,
    prefill: { weightKg: null, reps: repsMin, durationS: null, kind: "first_time" },
    reasons: [],
    ...overrides,
  };
}

const ALL_ONE = Object.fromEntries(AREA_ORDER.map((a) => [a, 1])) as Record<Area, number>;

export function workoutOf(
  items: WorkoutItem[],
  overrides: Partial<Omit<Workout, "plan">> = {},
): Workout {
  return {
    plan: { version: 1, mainLiftId: null, warmup: [], items, startDeficits: ALL_ONE },
    budgetMin: 45,
    warmupInBudget: true,
    energy: "normal",
    itemsTotalS: items.reduce((sum, i) => sum + i.costS, 0),
    totalS: 1725,
    unusedS: 0,
    sessionReasons: [],
    ...overrides,
  };
}

/** W-R7E4: the `Workout` example in api/openapi.yaml (R7-E4). */
export const W_R7E4_ITEMS: WorkoutItem[] = [
  workoutItem("bench-press", 4, 6, 8, {
    isMain: true,
    costS: 720,
    prefill: { weightKg: null, reps: 6, durationS: null, kind: "first_time" },
    reasons: [
      { code: "main_lift" },
      { code: "area_deficit", area: "chest", deficit: 1 },
      { code: "days_since", area: "chest", days: null },
      { code: "prefill", kind: "first_time" },
    ],
  }),
  workoutItem("inverted-row", 3, 8, 12, {
    costS: 555,
    prefill: { weightKg: 0, reps: 8, durationS: null, kind: "first_time" },
    reasons: [{ code: "area_deficit", area: "back", deficit: 1 }],
  }),
  workoutItem("leg-extension", 2, 10, 15, {
    costS: 270,
    prefill: { weightKg: null, reps: 10, durationS: null, kind: "first_time" },
    reasons: [{ code: "area_deficit", area: "quads", deficit: 1 }],
  }),
];

const W_R7E4_BASE = workoutOf(W_R7E4_ITEMS, {
  budgetMin: 30,
  itemsTotalS: 1545,
  totalS: 1725,
  unusedS: 75,
  sessionReasons: [
    { code: "area_deficit", area: "chest", deficit: 1 },
    { code: "area_deficit", area: "back", deficit: 1 },
    { code: "area_deficit", area: "quads", deficit: 1 },
  ],
});

export const W_R7E4: Workout = {
  ...W_R7E4_BASE,
  plan: { ...W_R7E4_BASE.plan, mainLiftId: "bench-press" },
};
