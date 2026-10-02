// T-0419 fixtures (UF-03.3). The ticket's §Test setup:
//   tz Europe/Stockholm, locale en-GB, now 2026-09-27T12:00:00+02:00, library engine L1,
//   the nine default targets.
//   S1: 11:00 → 11:52:40 local, 45 min budget; plan back-squat × 4, romanian-deadlift × 3,
//       leg-curl × 3; queued sets back-squat 100 × 6 × 4, romanian-deadlift 80 × 8 × 3 and one
//       back-squat warm-up 40 × 10.
//   S0: 2026-09-17 (10 days earlier), back-squat 97.5 × 8 × 4, in the cached history.
// The L1 exercise rows are copied from packages/engine/test/fixtures/common.ts (docs/engine-rules.md
// §Fixtures); a feature test doesn't import another package's test files.
import type { AreaBalance, BalanceResult } from "@workoutlab/engine";
import type { Area, AreaTarget, LibraryExercise, SessionPlan } from "@workoutlab/shared";

export const TZ = "Europe/Stockholm";
export const LOCALE = "en-GB";
/** 12:00 local on 2026-09-27. */
export const NOW = "2026-09-27T12:00:00+02:00";
/** AC-6: ten days after the workout. */
export const LATER = "2026-10-07T12:00:00+02:00";

export const USER_A = "11111111-1111-4111-8111-111111111111";
export const USER_B = "22222222-2222-4222-8222-222222222222";

export const S1 = "S1";
export const S0 = "S0";
/** 11:00 local. */
export const STARTED_AT = "2026-09-27T09:00:00.000Z";
/** 11:52:40 local. */
export const ENDED_AT = "2026-09-27T09:52:40.000Z";
/** AC-3's pair: 11:44:59 local. */
export const ENDED_AT_44 = "2026-09-27T09:44:59.000Z";

type Areas = LibraryExercise["areas"];
type Type = LibraryExercise["type"];

function ex(id: string, type: Type, equipment: string[], areas: Areas, inc: number | "bw") {
  const exercise: LibraryExercise = {
    id,
    name: id
      .split("-")
      .map((w, i) => (i === 0 ? w[0]!.toUpperCase() + w.slice(1) : w))
      .join(" "),
    kind: "exercise",
    type,
    level: "beginner",
    equipment,
    areas,
    timed: false,
    defaultDurationS: null,
    incrementKg: inc === "bw" ? 0 : inc,
    externalLoad: inc !== "bw",
  };
  return exercise;
}

/** Engine L1 (the exercises; the warm-up moves aren't needed here). */
export const L1: LibraryExercise[] = [
  ex(
    "back-squat",
    "compound",
    ["barbell", "rack"],
    { quads: 1, glutes: 1, hamstrings: 0.5, core: 0.5 },
    2.5,
  ),
  ex("romanian-deadlift", "compound", ["barbell"], { hamstrings: 1, glutes: 0.5 }, 2.5),
  ex("hip-thrust", "compound", ["barbell", "bench"], { glutes: 1, hamstrings: 0.5 }, 2.5),
  ex("leg-extension", "isolation", ["machine"], { quads: 1 }, 5),
  ex("leg-curl", "isolation", ["machine"], { hamstrings: 1 }, 5),
  ex("calf-raise", "isolation", ["machine"], { calves: 1 }, 5),
  ex("bench-press", "compound", ["barbell", "bench"], { chest: 1, shoulders: 0.5, arms: 0.5 }, 2.5),
  ex("push-up", "compound", [], { chest: 1, arms: 0.5, core: 0.5 }, "bw"),
  ex("overhead-press", "compound", ["barbell"], { shoulders: 1, arms: 0.5, core: 0.5 }, 2.5),
  ex("barbell-row", "compound", ["barbell"], { back: 1, arms: 0.5 }, 2.5),
  ex("lat-pulldown", "compound", ["cable"], { back: 1, arms: 0.5 }, 5),
  ex("biceps-curl", "isolation", ["dumbbell"], { arms: 1 }, 2),
];

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

export const DEFAULT_TARGETS: Record<Area, number> = {
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

export function defaultTargets(): AreaTarget[] {
  return AREA_ORDER.map((area) => ({
    area,
    setsPer14d: DEFAULT_TARGETS[area],
    source: "default" as const,
    updatedAt: "2026-09-01T00:00:00.000Z",
  }));
}

type Item = SessionPlan["items"][number];

function item(exerciseId: string, isMain: boolean, sets: number, min: number, max: number): Item {
  return {
    exerciseId,
    isMain,
    sets,
    repsMin: min,
    repsMax: max,
    durationS: null,
    costS: 600,
    backoff: null,
    prefill: { weightKg: null, reps: min, durationS: null, kind: "first_time" },
    reasons: [],
  };
}

export const PLAN: SessionPlan = {
  version: 1,
  mainLiftId: "back-squat",
  warmup: [],
  items: [
    item("back-squat", true, 4, 6, 8),
    item("romanian-deadlift", false, 3, 8, 12),
    item("leg-curl", false, 3, 10, 15),
  ],
  startDeficits: {
    chest: 1,
    back: 1,
    shoulders: 1,
    arms: 1,
    core: 1,
    glutes: 1,
    quads: 1,
    hamstrings: 1,
    calves: 1,
  },
};

export interface SetSpec {
  clientId: string;
  sessionId: string;
  exerciseId: string;
  setIndex: number;
  reps: number;
  weightKg: number;
  completedAt: string;
  isWarmup?: boolean;
}

function series(
  sessionId: string,
  exerciseId: string,
  weightKg: number,
  reps: number,
  count: number,
  startIso: string,
): SetSpec[] {
  const start = Date.parse(startIso);
  return Array.from({ length: count }, (_, i) => ({
    clientId: `${sessionId}-${exerciseId}-${i}`,
    sessionId,
    exerciseId,
    setIndex: i,
    reps,
    weightKg,
    completedAt: new Date(start + i * 3 * 60_000).toISOString(),
  }));
}

/** S1's queued sets: 4 + 3 hard sets and one warm-up. */
export const S1_SETS: SetSpec[] = [
  {
    clientId: "S1-back-squat-w",
    sessionId: S1,
    exerciseId: "back-squat",
    setIndex: 0,
    reps: 10,
    weightKg: 40,
    completedAt: "2026-09-27T09:02:00.000Z",
    isWarmup: true,
  },
  ...series(S1, "back-squat", 100, 6, 4, "2026-09-27T09:05:00.000Z"),
  ...series(S1, "romanian-deadlift", 80, 8, 3, "2026-09-27T09:30:00.000Z"),
];

/** S0, ten days earlier: back-squat 97.5 × 8 × 4 (cached history). */
export const S0_SETS: SetSpec[] = series(S0, "back-squat", 97.5, 8, 4, "2026-09-17T16:00:00.000Z");

// ---- Stubbed `BalanceResult`s (AC-4 order, AC-5) ----

export function areaBalance(area: Area, overrides: Partial<AreaBalance> = {}): AreaBalance {
  return {
    area,
    load: 0,
    target: DEFAULT_TARGETS[area],
    targetSource: "default",
    targetUpdatedAt: "2026-09-01T00:00:00.000Z",
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
    computedAt: ENDED_AT,
    areas,
  };
}
