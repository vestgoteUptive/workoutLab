// T-0422 fixtures: the cache UF-05.1 reads inside focus mode (T-0421's test setup): a beginner,
// full-equipment profile and the engine L1 library (docs/engine-rules.md §Fixtures), names by
// the engine fixture rule ("db-row" → "Db row"). Written straight into the `lib/offline` cache
// tables, the rows `refreshProfile`/`refreshLibrary` write.
import type { EngineProfile, LibraryExercise as EngineExercise } from "@workoutlab/engine";
import type { LibraryExercise } from "@workoutlab/shared";
import { offlineDb, userScopedKey } from "../../../lib/offline/db.js";
import { USER_A } from "./fixtures.js";

type Areas = EngineExercise["areas"];

function name(id: string): string {
  const spaced = id.replace(/-/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function ex(
  id: string,
  type: "compound" | "isolation",
  equipment: string[],
  areas: Areas,
  inc: number | "bw",
  opts: { level?: EngineExercise["level"]; timedS?: number } = {},
): EngineExercise {
  return {
    id,
    name: name(id),
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

function wu(id: string, areas: Areas): EngineExercise {
  return {
    id,
    name: name(id),
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

/** Engine L1 plus its warm-up moves. */
export const ENGINE_L1: EngineExercise[] = [
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
  wu("wu-scap-push-up", { chest: 1, shoulders: 0.5 }),
  wu("wu-arm-circle", { shoulders: 1, chest: 0.5 }),
  wu("wu-band-pull-apart", { back: 1, shoulders: 0.5 }),
  wu("wu-cat-cow", { core: 1, back: 0.5 }),
  wu("wu-bodyweight-squat", { quads: 1, glutes: 1 }),
  wu("wu-leg-swing", { hamstrings: 1, glutes: 0.5 }),
  wu("wu-jumping-jack", {}),
  wu("wu-march-in-place", {}),
];

/** F-profile: beginner, full equipment. */
export function fullProfile(): EngineProfile {
  return {
    goal: "build_muscle",
    level: "beginner",
    equipment: ["barbell", "rack", "bench", "dumbbell", "cable", "machine", "pullup-bar"],
    rhythmMin: 3,
    rhythmMax: 4,
    priorityAreas: [],
    onboardedAt: "2026-08-02T10:00:00Z",
    planUpdatedAt: "2026-08-02T10:00:00Z",
  };
}

/** Fills the profile and library caches of the current (fresh) database for `userId`. */
export async function seedSwapCache(userId: string = USER_A): Promise<void> {
  const db = offlineDb();
  await db.profileCache.put({ userId, profile: fullProfile() as never });
  await db.libraryCache.bulkPut(
    ENGINE_L1.map((exercise) => ({
      key: userScopedKey(userId, exercise.id),
      userId,
      // The cached row is the shared shape; the engine's has a looser `incrementKg` (bodyweight).
      exercise: exercise as unknown as LibraryExercise,
    })),
  );
}
