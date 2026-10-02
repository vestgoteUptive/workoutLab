// T-0421 fixtures: docs/engine-rules.md §Fixtures as web test data (F-tz, F-targets, F-profile,
// the L1 library and the eight `wu-*` moves), and the rule 12 workouts behind R12-E1…E10.
// Names follow the engine fixture rule (the id with hyphens → spaces, first letter capitalised),
// except straight-arm-pulldown, which keeps its library name "Straight-arm pulldown" (T-0421
// AC-4 reads it that way, as does `data/exercises/library/straight-arm-pulldown.json`).
// Engine types, not the shared ones: the L1 "bw" rows have `incrementKg: null`.
import {
  WARMUP_COST_S,
  availableS,
  generateWarmup,
  itemCostS,
  suggest,
  type Area,
  type AreaTarget,
  type EngineProfile,
  type HistorySet,
  type LibraryExercise,
  type SessionInput,
  type SwapCandidate,
  type Workout,
  type WorkoutItem,
} from "@workoutlab/engine";

export const TZ = "Europe/Stockholm";
export const NOW = "2026-09-27T12:00:00+02:00";
export const USER = "11111111-1111-4111-8111-111111111111";

export const AREAS: readonly Area[] = [
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

const F_TARGET_VALUES: Record<Area, number> = {
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

export function fTargets(): AreaTarget[] {
  return AREAS.map((area) => ({
    area,
    setsPer14d: F_TARGET_VALUES[area],
    source: "default" as const,
    updatedAt: "2026-08-02T10:00:00Z",
  }));
}

export const FULL_EQUIPMENT = [
  "barbell",
  "rack",
  "bench",
  "dumbbell",
  "cable",
  "machine",
  "pullup-bar",
];

/** F-profile: beginner, full equipment. */
export function fProfile(): EngineProfile {
  return {
    goal: "build_muscle",
    level: "beginner",
    equipment: [...FULL_EQUIPMENT],
    rhythmMin: 3,
    rhythmMax: 4,
    priorityAreas: [],
    onboardedAt: "2026-08-02T10:00:00Z",
    planUpdatedAt: "2026-08-02T10:00:00Z",
  };
}

const NAMES: Record<string, string> = { "straight-arm-pulldown": "Straight-arm pulldown" };

function nameFromId(id: string): string {
  const named = NAMES[id];
  if (named !== undefined) return named;
  const spaced = id.replace(/-/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

type Weights = LibraryExercise["areas"];

function ex(
  id: string,
  type: "compound" | "isolation",
  equipment: string[],
  areas: Weights,
  inc: number | "bw",
  opts: { level?: LibraryExercise["level"]; timedS?: number } = {},
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

function wu(id: string, areas: Weights): LibraryExercise {
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

const L1: LibraryExercise[] = [
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

const WARMUPS: LibraryExercise[] = [
  wu("wu-scap-push-up", { chest: 1, shoulders: 0.5 }),
  wu("wu-arm-circle", { shoulders: 1, chest: 0.5 }),
  wu("wu-band-pull-apart", { back: 1, shoulders: 0.5 }),
  wu("wu-cat-cow", { core: 1, back: 0.5 }),
  wu("wu-bodyweight-squat", { quads: 1, glutes: 1 }),
  wu("wu-leg-swing", { hamstrings: 1, glutes: 0.5 }),
  wu("wu-jumping-jack", {}),
  wu("wu-march-in-place", {}),
];

export function fLibrary(): LibraryExercise[] {
  return [...L1, ...WARMUPS].map((e) => ({ ...e, equipment: [...e.equipment] }));
}

/**
 * A `Workout` holding exactly `items` (`[exerciseId, sets, isMain?]`), built the D-0069 §5 way:
 * `itemsTotalS = Σ costS`, `totalS = itemsTotalS + 180`, `unusedS = max(0, available −
 * itemsTotalS)`, `sessionReasons: []`. Costs come from the engine's own rule 7.1 helper.
 */
export function sessionOf(
  items: ReadonlyArray<readonly [string, number, boolean?]>,
  opts: { budgetMin?: number; warmupInBudget?: boolean } = {},
): Workout {
  const library = fLibrary();
  const budgetMin = opts.budgetMin ?? 30;
  const warmupInBudget = opts.warmupInBudget ?? true;
  const byId = new Map(library.map((e) => [e.id, e]));
  const planItems: WorkoutItem[] = items.map(([id, sets, isMain = false]) => {
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
      prefill: { weightKg: null, reps: null, durationS: null, kind: "first_time" },
      reasons: [],
    };
  });
  const itemsTotalS = planItems.reduce((sum, i) => sum + i.costS, 0);
  const main = planItems.find((i) => i.isMain);
  const zero = {} as Record<Area, number>;
  for (const a of AREAS) zero[a] = 0;
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

/** `w` with `items[k].prefill` partly replaced. */
export function withPrefill(
  w: Workout,
  k: number,
  prefill: Partial<WorkoutItem["prefill"]>,
): Workout {
  return {
    ...w,
    plan: {
      ...w.plan,
      items: w.plan.items.map((it, i) =>
        i === k ? { ...it, prefill: { ...it.prefill, ...prefill } } : it,
      ),
    },
  };
}

/** W5: bench-press × 4 (main), barbell-row × 3, leg-extension × 2, budget 30, warm-up in. */
export function w5(): Workout {
  return sessionOf([
    ["bench-press", 4, true],
    ["barbell-row", 3],
    ["leg-extension", 2],
  ]);
}

const F_INPUT: SessionInput = {
  budgetMin: 30,
  warmupInBudget: true,
  energy: "normal",
  shuffle: 0,
  mainLiftId: null,
  pinnedIds: [],
  excludeIds: [],
};

/** W = R7-E4 (bench-press × 4 main, inverted-row × 3, leg-extension × 2), zero history. */
export function wR7E4(): Workout {
  return suggest([], fTargets(), fProfile(), fLibrary(), F_INPUT, NOW, TZ);
}

/** R12-E9's session: bench-press × 4 (main) and dead-bug × 2 at budget 20, warm-up off. */
export function wTimed(): Workout {
  return sessionOf(
    [
      ["bench-press", 4, true],
      ["dead-bug", 2],
    ],
    { budgetMin: 20, warmupInBudget: false },
  );
}

/** R14-E9 / R12-E10: bench-press 80 × 8, 7, 6 on 09-24, budget 15, warm-up off, High energy. */
export function wBackoff(history: readonly HistorySet[]): Workout {
  return suggest(
    history,
    fTargets(),
    fProfile(),
    fLibrary(),
    {
      ...F_INPUT,
      budgetMin: 15,
      warmupInBudget: false,
      energy: "high",
      mainLiftId: "bench-press",
    },
    NOW,
    TZ,
  );
}

export type SetEntry = readonly [number | null, number | null] | { readonly durationS: number };

/** One session on local `date` at 10:00 (+02:00) with one hard set per entry. The instants are
 *  stored as UTC ISO strings, the way `refreshHistory` caches them. */
export function sessionSets(
  date: string,
  exerciseId: string,
  entries: readonly SetEntry[],
): HistorySet[] {
  const at = new Date(`${date}T10:00:00+02:00`).toISOString();
  return entries.map((e, i) => {
    const values =
      "durationS" in e
        ? { weightKg: null, reps: null, durationS: e.durationS }
        : { weightKg: e[0], reps: e[1], durationS: null };
    return {
      clientId: `${exerciseId}@${at}#${i}`,
      sessionId: `s@${date}-${exerciseId}`,
      exerciseId,
      isWarmup: false,
      completedAt: at,
      editedAt: at,
      deletedAt: null,
      ...values,
    };
  });
}

export function candidate(
  exerciseId: string,
  overrides: Partial<SwapCandidate> = {},
): SwapCandidate {
  return {
    exerciseId,
    muscleMatch: 1,
    timeCostS: 555,
    equipment: ["cable"],
    fitsBudget: true,
    bestMatch: false,
    ...overrides,
  };
}
