// T-0304a fixtures: P1 (the parent T-0304 fixture) and the L1 library entries it touches,
// copied from docs/engine-rules.md §Fixtures (packages/engine/test/fixtures/common.ts).
import type { LibraryExercise, SessionPlan } from "@workoutlab/shared";

export const S1 = "S1";
export const USER_A = "11111111-1111-4111-8111-111111111111";
export const USER_B = "22222222-2222-4222-8222-222222222222";
/** P1's `started_at`. */
export const STARTED_AT = "2026-09-27T10:00:00.000Z";
export const STARTED_AT_MS = Date.parse(STARTED_AT);

type Areas = LibraryExercise["areas"];

function ex(
  id: string,
  name: string,
  type: "compound" | "isolation",
  equipment: string[],
  areas: Areas,
  inc: number | "bw",
  timedS?: number,
): LibraryExercise {
  return {
    id,
    name,
    kind: "exercise",
    type,
    level: "beginner",
    equipment,
    areas,
    timed: timedS !== undefined,
    defaultDurationS: timedS ?? null,
    incrementKg: inc === "bw" ? 0 : inc,
    externalLoad: inc !== "bw",
  };
}

function wu(id: string, name: string, areas: Areas): LibraryExercise {
  return {
    id,
    name,
    kind: "warmup",
    type: "isolation",
    level: "beginner",
    equipment: [],
    areas,
    timed: true,
    defaultDurationS: 40,
    incrementKg: 0,
    externalLoad: false,
  };
}

/** The L1 rows P1 uses, plus its four warm-up moves. */
export const L1: LibraryExercise[] = [
  ex(
    "bench-press",
    "Bench press",
    "compound",
    ["barbell", "bench"],
    { chest: 1, shoulders: 0.5, arms: 0.5 },
    2.5,
  ),
  ex("barbell-row", "Barbell row", "compound", ["barbell"], { back: 1, arms: 0.5 }, 2.5),
  ex("leg-curl", "Leg curl", "isolation", ["machine"], { hamstrings: 1 }, 5),
  ex("plank", "Plank", "isolation", [], { core: 1 }, "bw", 45),
  wu("wu-scap-push-up", "Scap push-up", { chest: 1, shoulders: 0.5 }),
  wu("wu-band-pull-apart", "Band pull-apart", { back: 1, shoulders: 0.5 }),
  wu("wu-bodyweight-squat", "Bodyweight squat", { quads: 1, glutes: 1 }),
  wu("wu-arm-circle", "Arm circle", { shoulders: 1, chest: 0.5 }),
];

const DEFICITS = {
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

type Item = SessionPlan["items"][number];

export const BENCH: Item = {
  exerciseId: "bench-press",
  isMain: true,
  sets: 4,
  repsMin: 6,
  repsMax: 8,
  durationS: null,
  costS: 720,
  backoff: null,
  prefill: { weightKg: 80, reps: 6, durationS: null, kind: "add_rep" },
  reasons: [],
};
export const ROW: Item = {
  exerciseId: "barbell-row",
  isMain: false,
  sets: 3,
  repsMin: 8,
  repsMax: 12,
  durationS: null,
  costS: 555,
  backoff: null,
  prefill: { weightKg: 60, reps: 8, durationS: null, kind: "add_rep" },
  reasons: [],
};
export const CURL: Item = {
  exerciseId: "leg-curl",
  isMain: false,
  sets: 3,
  repsMin: 10,
  repsMax: 15,
  durationS: null,
  costS: 375,
  backoff: null,
  prefill: { weightKg: null, reps: 10, durationS: null, kind: "first_time" },
  reasons: [],
};
export const PLANK: Item = {
  exerciseId: "plank",
  isMain: false,
  sets: 2,
  repsMin: null,
  repsMax: null,
  durationS: 45,
  costS: 330,
  backoff: null,
  prefill: { weightKg: null, reps: null, durationS: 50, kind: "add_rep" },
  reasons: [],
};

export const P1: SessionPlan = {
  version: 1,
  mainLiftId: "bench-press",
  warmup: [
    { exerciseId: "wu-scap-push-up", durationS: 40 },
    { exerciseId: "wu-band-pull-apart", durationS: 40 },
    { exerciseId: "wu-bodyweight-squat", durationS: 40 },
    { exerciseId: "wu-arm-circle", durationS: 40 },
  ],
  items: [BENCH, ROW, CURL, PLANK],
  startDeficits: DEFICITS,
};

export function planWith(overrides: Partial<SessionPlan>): SessionPlan {
  return { ...P1, ...overrides };
}

/** T-0304d (D-0120 §4): a restored UF-09.8 re-runs rule 8 and moves on when it no longer shows.
 *  A `started_at` 1500 s before `nowMs` puts P1 at item 1 60 s behind (1500 + 1260 − 2700), so
 *  a seeded `timeCheck` on P1 still shows UF-09.8. */
export function behindStartedAt(nowMs: number): string {
  return new Date(nowMs - 1_500_000).toISOString();
}
