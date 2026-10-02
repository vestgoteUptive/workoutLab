// T-0303a F-web: docs/engine-rules.md §Fixtures as web test data. F-tz, F-targets, F-profile,
// and a copy of the L1 library plus the eight `wu-*` moves. AC-6's engine values (R7-E2, -E4,
// -E11, -E12, -E14) are the check that this copy is right.
import type { AreaTarget, LibraryExercise } from "@workoutlab/shared";
import type { EngineProfile } from "@workoutlab/engine";

export const TZ = "Europe/Stockholm";
export const NOW = "2026-09-27T12:00:00+02:00";
export const LOCALE = "en-GB";

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

const F_TARGET_VALUES: Record<(typeof AREAS)[number], number> = {
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

export function fProfile(overrides: Partial<EngineProfile> = {}): EngineProfile {
  return {
    goal: "build_muscle",
    level: "beginner",
    equipment: FULL_EQUIPMENT,
    rhythmMin: 3,
    rhythmMax: 4,
    priorityAreas: [],
    onboardedAt: "2026-08-02T10:00:00Z",
    planUpdatedAt: "2026-08-02T10:00:00Z",
    ...overrides,
  };
}

function nameFromId(id: string): string {
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
