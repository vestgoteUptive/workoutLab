// T-0307a UF-10 test fixtures. The ticket's §Fixtures, verbatim:
//   tz Europe/Stockholm, now 2026-09-27T12:00:00+02:00
//   default targets chest/back/glutes/quads 20, shoulders/hamstrings 16, arms/core/calves 12
//   back squat  = quads 1, glutes 1, hamstrings .5, core .5
//   Romanian deadlift = hamstrings 1, glutes .5
import type {
  Area,
  AreaBalance,
  AreaTarget,
  BalanceResult,
  LibraryExercise,
} from "@workoutlab/shared";

export const TZ = "Europe/Stockholm";
/** D = 2026-09-27; 12:00 local is 10:00Z. */
export const NOW = "2026-09-27T12:00:00+02:00";
export const LOCALE = "en-GB";

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

/** The nine default `area_targets` rows, all `source: "default"`. */
export function defaultTargets(updatedAt = "2026-09-01T00:00:00.000Z"): AreaTarget[] {
  return AREA_ORDER.map((area) => ({
    area,
    setsPer14d: DEFAULT_TARGETS[area],
    source: "default" as const,
    updatedAt,
  }));
}

function exercise(id: string, name: string, areas: LibraryExercise["areas"]): LibraryExercise {
  return {
    id,
    name,
    kind: "exercise",
    type: "compound",
    level: "beginner",
    equipment: [],
    areas,
    timed: false,
    defaultDurationS: null,
    incrementKg: 2.5,
    externalLoad: true,
  };
}

export const BACK_SQUAT = exercise("back-squat", "Back squat", {
  quads: 1,
  glutes: 1,
  hamstrings: 0.5,
  core: 0.5,
});

export const RDL = exercise("romanian-deadlift", "Romanian deadlift", {
  hamstrings: 1,
  glutes: 0.5,
});

export const LIBRARY: LibraryExercise[] = [BACK_SQUAT, RDL];

export const EXERCISE_NAMES: ReadonlyMap<string, string> = new Map(
  LIBRARY.map((e) => [e.id, e.name]),
);

/** One `session_sets` row as the offline cache stores it. `localTime` is wall-clock in `TZ`. */
export interface SetSpec {
  id: string;
  exerciseId: string;
  /** e.g. `2026-09-25T10:00:00+02:00`. */
  completedAt: string;
  isWarmup?: boolean;
}

export function sets(
  exerciseId: string,
  completedAt: string,
  count: number,
  options: { isWarmup?: boolean; prefix?: string } = {},
): SetSpec[] {
  const prefix = options.prefix ?? `${exerciseId}-${completedAt}`;
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${options.isWarmup ? "w" : "h"}${i}`,
    exerciseId,
    completedAt,
    ...(options.isWarmup ? { isWarmup: true } : {}),
  }));
}

// ---- Stubbed `BalanceResult`s: the "the UI computes nothing" half of the suite ----

/** A complete `AreaBalance` whose every field can be overridden, so a test can build one that
 *  is deliberately internally inconsistent (AC-A13) without TypeScript filling gaps for it. */
export function areaBalance(area: Area, overrides: Partial<AreaBalance> = {}): AreaBalance {
  const target = DEFAULT_TARGETS[area];
  return {
    area,
    load: 0,
    target,
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

/** A `BalanceResult` over the ticket's window (D−13 = 14 Sep … D = 27 Sep). */
export function balanceResult(areas: AreaBalance[]): BalanceResult {
  return {
    windowStart: "2026-09-14",
    windowEnd: "2026-09-27",
    computedAt: "2026-09-27T10:00:00.000Z",
    areas,
  };
}

/** The nine areas in `AREAS` order, every one at zero. */
export function zeroAreas(): AreaBalance[] {
  return AREA_ORDER.map((area) => areaBalance(area));
}
