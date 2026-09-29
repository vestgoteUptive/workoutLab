// Shared fixtures from docs/engine-rules.md §Fixtures: F-tz, F-targets, library L1 and the
// warm-up moves (D-0034 §9: names are the id with hyphens → spaces, first letter capitalised).
import {
  availableS,
  generateWarmup,
  itemCostS,
  WARMUP_COST_S,
  type Area,
  type AreaTarget,
  type AreaWeights,
  type EngineProfile,
  type ExerciseType,
  type HistorySet,
  type LibraryExercise,
  type Level,
  type SessionInput,
  type Workout,
} from "../../src/index.js";

export const TZ = "Europe/Stockholm";
export const NOW = "2026-09-27T12:00:00+02:00";
export const NOW_MIDNIGHT_28 = "2026-09-28T00:00:00+02:00";
export const NOW_OCT_01 = "2026-10-01T12:00:00+02:00";

export const F_TARGET_VALUES: Record<Area, number> = {
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

export function targetsFrom(
  values: Record<Area, number>,
  overrides: Partial<Record<Area, Partial<AreaTarget>>> = {},
): AreaTarget[] {
  return (Object.keys(values) as Area[]).map((area) => ({
    area,
    setsPer14d: values[area],
    source: "default" as const,
    updatedAt: "2026-08-02T10:00:00Z",
    ...overrides[area],
  }));
}

export const F_TARGETS: AreaTarget[] = targetsFrom(F_TARGET_VALUES);

export function nameFromId(id: string): string {
  const spaced = id.replace(/-/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** `inc` is the L1 "inc" column in kg, or "bw" for bodyweight (D-0040 §3). */
function ex(
  id: string,
  type: ExerciseType,
  equipment: string[],
  areas: AreaWeights,
  inc: number | "bw",
  opts: { level?: Level; timedS?: number } = {},
): LibraryExercise {
  return {
    id,
    name: nameFromId(id),
    kind: "exercise",
    type,
    level: opts.level ?? "beginner",
    equipment,
    areas,
    timed: opts.timedS !== undefined,
    defaultDurationS: opts.timedS ?? null,
    incrementKg: inc === "bw" ? null : inc,
    externalLoad: inc !== "bw",
  };
}

function wu(id: string, areas: AreaWeights): LibraryExercise {
  return {
    id,
    name: nameFromId(id),
    kind: "warmup",
    type: "isolation",
    level: "beginner",
    equipment: [],
    areas,
    timed: true,
    defaultDurationS: 40,
    incrementKg: null,
    externalLoad: false,
  };
}

// Equipment is copied from the L1 table ("—" = []; D-0040 §1 makes it ≡ ["none"]).
export const L1: LibraryExercise[] = [
  ex(
    "back-squat",
    "compound",
    ["barbell", "rack"],
    {
      quads: 1,
      glutes: 1,
      hamstrings: 0.5,
      core: 0.5,
    },
    2.5,
  ),
  ex("romanian-deadlift", "compound", ["barbell"], { hamstrings: 1, glutes: 0.5 }, 2.5),
  ex("hip-thrust", "compound", ["barbell", "bench"], { glutes: 1, hamstrings: 0.5 }, 2.5),
  ex("leg-extension", "isolation", ["machine"], { quads: 1 }, 5),
  ex("leg-curl", "isolation", ["machine"], { hamstrings: 1 }, 5),
  ex("calf-raise", "isolation", ["machine"], { calves: 1 }, 5),
  ex("bench-press", "compound", ["barbell", "bench"], { chest: 1, shoulders: 0.5, arms: 0.5 }, 2.5),
  ex(
    "db-bench-press",
    "compound",
    ["dumbbell", "bench"],
    { chest: 1, shoulders: 0.5, arms: 0.5 },
    2,
  ),
  ex("push-up", "compound", [], { chest: 1, arms: 0.5, core: 0.5 }, "bw"),
  ex("overhead-press", "compound", ["barbell"], { shoulders: 1, arms: 0.5, core: 0.5 }, 2.5),
  ex("lateral-raise", "isolation", ["dumbbell"], { shoulders: 1 }, 2),
  ex("barbell-row", "compound", ["barbell"], { back: 1, arms: 0.5 }, 2.5),
  ex("db-row", "compound", ["dumbbell", "bench"], { back: 1, arms: 0.5 }, 2),
  ex("inverted-row", "compound", ["rack"], { back: 1, arms: 0.5, core: 0.5 }, "bw"),
  ex("lat-pulldown", "compound", ["cable"], { back: 1, arms: 0.5 }, 5),
  ex("seated-cable-row", "compound", ["cable"], { back: 1, arms: 0.5 }, 5),
  ex("straight-arm-pulldown", "isolation", ["cable"], { back: 1 }, 5),
  ex("pull-up", "compound", ["pullup-bar"], { back: 1, arms: 0.5 }, "bw", {
    level: "intermediate",
  }),
  ex("biceps-curl", "isolation", ["dumbbell"], { arms: 1 }, 2),
  ex("plank", "isolation", [], { core: 1 }, "bw", { timedS: 45 }),
  ex("dead-bug", "isolation", [], { core: 1 }, "bw"),
  ex("hanging-knee-raise", "isolation", ["pullup-bar"], { core: 1 }, "bw"),
];

export const WARMUPS: LibraryExercise[] = [
  wu("wu-scap-push-up", { chest: 1, shoulders: 0.5 }),
  wu("wu-arm-circle", { shoulders: 1, chest: 0.5 }),
  wu("wu-band-pull-apart", { back: 1, shoulders: 0.5 }),
  wu("wu-cat-cow", { core: 1, back: 0.5 }),
  wu("wu-bodyweight-squat", { quads: 1, glutes: 1 }),
  wu("wu-leg-swing", { hamstrings: 1, glutes: 0.5 }),
  wu("wu-jumping-jack", {}),
  wu("wu-march-in-place", {}),
];

export const LIBRARY: LibraryExercise[] = [...L1, ...WARMUPS];

export interface SetOptions {
  isWarmup?: boolean;
  deletedAt?: string | null;
  editedAt?: string;
  pending?: boolean;
  /** Makes the generated clientIds unique when the same exercise/time repeats. */
  tag?: string;
}

/** `n` hard sets of `exerciseId` completed at the instant `at` (distinct clientIds). */
export function setsAt(
  n: number,
  exerciseId: string,
  at: string,
  opts: SetOptions = {},
): HistorySet[] {
  const out: HistorySet[] = [];
  for (let i = 0; i < n; i++) {
    const row: HistorySet = {
      clientId: `${opts.tag ?? ""}${exerciseId}@${at}#${i}`,
      sessionId: `s@${at}`,
      exerciseId,
      isWarmup: opts.isWarmup ?? false,
      completedAt: at,
      editedAt: opts.editedAt ?? at,
      deletedAt: opts.deletedAt ?? null,
      reps: 8,
      weightKg: 50,
      durationS: null,
    };
    if (opts.pending !== undefined) row.pending = opts.pending;
    out.push(row);
  }
  return out;
}

/** "N sets of X on DATE": N hard sets at `time` local (CEST, +02:00) on `date`. */
export function setsOn(
  n: number,
  exerciseId: string,
  date: string,
  opts: SetOptions & { time?: string } = {},
): HistorySet[] {
  return setsAt(n, exerciseId, `${date}T${opts.time ?? "10:00"}:00+02:00`, opts);
}

/** Recursively `Object.freeze` a value (AC4). */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}

/** A shifted ISO instant in UTC (`Z`), for "now − 47 h" style fixtures. */
export function shift(instant: string, ms: number): string {
  return new Date(new Date(instant).getTime() + ms).toISOString();
}

export const HOUR = 3_600_000;

// ---- Session building fixtures (T-0201a): F-profile and F-input ----

export const FULL_EQUIPMENT = [
  "barbell",
  "rack",
  "bench",
  "dumbbell",
  "cable",
  "machine",
  "pullup-bar",
];

/** F-profile: beginner, equipment `full`, rhythm 3–4, no priorities. */
export const F_PROFILE: EngineProfile = {
  goal: "build_muscle",
  level: "beginner",
  equipment: FULL_EQUIPMENT,
  rhythmMin: 3,
  rhythmMax: 4,
  priorityAreas: [],
  onboardedAt: "2026-08-02T10:00:00Z",
  planUpdatedAt: "2026-08-02T10:00:00Z",
};

/** F-input: budget 30, warm-up in budget, normal energy, no main/pinned/excluded ids. */
export const F_INPUT: SessionInput = {
  budgetMin: 30,
  warmupInBudget: true,
  energy: "normal",
  shuffle: 0,
  mainLiftId: null,
  pinnedIds: [],
  excludeIds: [],
};

export function input(overrides: Partial<SessionInput> = {}): SessionInput {
  return { ...F_INPUT, ...overrides };
}

export function profile(overrides: Partial<EngineProfile> = {}): EngineProfile {
  return { ...F_PROFILE, ...overrides };
}

/** `[exerciseId, sets]` per item, for "X × n" assertions. */
export function itemsOf(w: Workout): Array<[string, number]> {
  return w.plan.items.map((i) => [i.exerciseId, i.sets]);
}

export function warmupOf(w: Workout): string[] {
  return w.plan.warmup.map((m) => m.exerciseId);
}

// ---- Swap fixtures (T-0204): F-swap and hand-built sessions ----

/**
 * A `Workout` holding exactly `items` (`[exerciseId, sets, isMain?]`), with every cost and
 * total computed by the engine's own rule 7.1 helpers. Reasons are left empty: `rankSwaps`
 * reads only ids, sets, `isMain`, `costS` and the budget fields.
 */
export function sessionOf(
  items: ReadonlyArray<readonly [string, number, boolean?]>,
  opts: { budgetMin?: number; warmupInBudget?: boolean } = {},
  library: readonly LibraryExercise[] = LIBRARY,
): Workout {
  const budgetMin = opts.budgetMin ?? 30;
  const warmupInBudget = opts.warmupInBudget ?? true;
  const byId = new Map(library.map((e) => [e.id, e]));
  const planItems = items.map(([id, sets, isMain = false]) => {
    const e = byId.get(id);
    if (e === undefined) throw new Error(`sessionOf: ${id} is not in the library`);
    return {
      exerciseId: id,
      isMain,
      sets,
      repsMin: null,
      repsMax: null,
      durationS: null,
      costS: itemCostS(e, sets),
      backoff: null,
      prefill: { weightKg: null, reps: null, durationS: null, kind: "first_time" as const },
      reasons: [],
    };
  });
  const itemsTotalS = planItems.reduce((sum, i) => sum + i.costS, 0);
  const main = planItems.find((i) => i.isMain);
  const zero = {} as Record<Area, number>;
  for (const a of Object.keys(F_TARGET_VALUES) as Area[]) zero[a] = 0;
  return {
    plan: {
      version: 1,
      mainLiftId: main === undefined ? null : main.exerciseId,
      warmup: generateWarmup(
        planItems.map((i) => i.exerciseId),
        library,
      ),
      items: planItems,
      startDeficits: zero,
    },
    budgetMin,
    warmupInBudget,
    energy: "normal",
    itemsTotalS,
    totalS: itemsTotalS + WARMUP_COST_S,
    unusedS: Math.max(0, availableS(budgetMin, warmupInBudget) - itemsTotalS),
    sessionReasons: [],
  };
}

/** F-swap: bench-press × 4 (main), barbell-row × 3, leg-extension × 2 at budget 30, warm-up in. */
export function fSwap(opts: { warmupInBudget?: boolean } = {}): Workout {
  return sessionOf(
    [
      ["bench-press", 4, true],
      ["barbell-row", 3],
      ["leg-extension", 2],
    ],
    opts,
  );
}
