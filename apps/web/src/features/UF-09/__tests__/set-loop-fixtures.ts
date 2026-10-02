// T-0304b fixtures: push-up (bodyweight) added to L1 as L2, the PU item, one-off plans, and the
// cached exercise details the ticket's tests read.
import type { LibraryExercise, SessionPlan } from "@workoutlab/shared";
import type { ExerciseDetail } from "../../../lib/offline/index.js";
import { BENCH, L1, P1, S1 } from "./fixtures.js";

/** Push-up: bodyweight (`externalLoad: false`), compound, `incrementKg` 0. */
export const PUSH_UP: LibraryExercise = {
  id: "push-up",
  name: "Push-up",
  kind: "exercise",
  type: "compound",
  level: "beginner",
  equipment: [],
  areas: { chest: 1, arms: 0.5 },
  timed: false,
  defaultDurationS: null,
  incrementKg: 0,
  externalLoad: false,
};

export const L2: LibraryExercise[] = [...L1, PUSH_UP];

export const BENCH_CUE = "Shoulder blades back";

const BENCH_DETAIL: ExerciseDetail = {
  id: "bench-press",
  instructions: [],
  mistakes: [],
  cue: BENCH_CUE,
  source: "test",
  license: "CC0",
  attribution: null,
  sourceUrl: null,
  variants: [],
};

export async function defaultDetail(id: string): Promise<ExerciseDetail | null> {
  return id === "bench-press" ? BENCH_DETAIL : null;
}

type Item = SessionPlan["items"][number];

/** PU: push-up × 3 (8–12), prefill 0 × 12. */
export const PU: Item = {
  exerciseId: "push-up",
  isMain: false,
  sets: 3,
  repsMin: 8,
  repsMax: 12,
  durationS: null,
  costS: 300,
  backoff: null,
  prefill: { weightKg: 0, reps: 12, durationS: null, kind: "add_rep" },
  reasons: [],
};

export const KEY = `wl-focus:${S1}`;
export const NBSP = " ";

export function planOf(items: Item[]): SessionPlan {
  return { ...P1, warmup: [], items, mainLiftId: items[0]?.exerciseId ?? null };
}

export const BENCH_ONLY = planOf([BENCH]);
