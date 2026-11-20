// T-0947 fixtures: spec fixture P (bench-press × 4 main 720 s, inverted-row × 3 555 s,
// leg-extension × 2 270 s; budget 45 min, warm-up in the budget) and a library that holds every
// exercise the add tests touch.
import type { LibraryExercise, SessionPlan } from "@workoutlab/shared";
import { initialFocusState, type FocusState, type LoggedSet } from "../machine.js";
import { BENCH, P1, ROW, S1, STARTED_AT_MS } from "./fixtures.js";

type Areas = LibraryExercise["areas"];

function ex(
  id: string,
  name: string,
  type: "compound" | "isolation",
  areas: Areas,
): LibraryExercise {
  return {
    id,
    name,
    kind: "exercise",
    type,
    level: "beginner",
    equipment: [],
    areas,
    timed: false,
    defaultDurationS: null,
    incrementKg: 2.5,
    externalLoad: true,
  };
}

export const LIB: LibraryExercise[] = [
  ex("bench-press", "Bench press", "compound", { chest: 1, shoulders: 0.5, arms: 0.5 }),
  ex("db-bench-press", "Dumbbell bench press", "compound", { chest: 1, arms: 0.5 }),
  ex("inverted-row", "Inverted row", "compound", { back: 1, arms: 0.5 }),
  ex("leg-extension", "Leg extension", "isolation", { quads: 1 }),
  ex("lateral-raise", "Lateral raise", "isolation", { shoulders: 1 }),
  ex("back-squat", "Back squat", "compound", { quads: 1, glutes: 1 }),
  ex("biceps-curl", "Biceps curl", "isolation", { arms: 1 }),
];

export const BENCH_P = BENCH;
export const ROW_P = { ...ROW, exerciseId: "inverted-row", sets: 3, costS: 555 };
export const LEG_P = {
  ...ROW,
  exerciseId: "leg-extension",
  isMain: false,
  sets: 2,
  costS: 270,
  repsMin: 10,
  repsMax: 15,
};
export const PLAN_P: SessionPlan = { ...P1, items: [BENCH_P, ROW_P, LEG_P] };
export const PLAN_LATERAL: SessionPlan = {
  ...P1,
  items: [BENCH_P, { ...LEG_P, exerciseId: "lateral-raise", sets: 3, costS: 375 }, ROW_P, LEG_P],
};

export const NOW = STARTED_AT_MS + 10 * 60_000;
export const PAUSED_AT = NOW - 5000;
/** `started_at` such that Rule 8's `elapsedS` at PAUSED_AT is `elapsedS` (no earlier pauses). */
export const startedFor = (elapsedS: number): string =>
  new Date(PAUSED_AT - elapsedS * 1000).toISOString();

export function logged(
  itemIndex: number,
  setIndex: number,
  exerciseId: string,
  clientId = `c${exerciseId}-${setIndex}`,
): LoggedSet {
  return {
    clientId,
    itemIndex,
    setIndex,
    exerciseId,
    reps: 6,
    weightKg: 80,
    durationS: null,
    rir: null,
    backoff: false,
  };
}

const TIMER_PHASES = ["getReady", "warmup", "next", "rest"];

/** Plan P's focus state, paused (at PAUSED_AT) from `resumePhase`. */
export function pausedP(
  resumePhase: FocusState["resumePhase"],
  over: Partial<FocusState> = {},
  plan: SessionPlan = PLAN_P,
): FocusState {
  return {
    ...initialFocusState(S1, plan, NOW),
    phase: "paused",
    resumePhase,
    pausedAtMs: PAUSED_AT,
    timer: TIMER_PHASES.includes(resumePhase ?? "")
      ? {
          startedAtMs: PAUSED_AT - 10_000,
          durationS: resumePhase === "rest" ? 120 : resumePhase === "next" ? 60 : 5,
          pausedMs: 0,
        }
      : null,
    ...over,
  } as FocusState;
}

/** B1: paused from the rest after bench-press set 2 of 4. */
export const PAUSED_REST = pausedP("rest", {
  itemIndex: 0,
  setIndex: 1,
  loggedSets: [logged(0, 0, "bench-press"), logged(0, 1, "bench-press")],
});
