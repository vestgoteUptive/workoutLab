// T-0578 fixtures: plan P (bench-press × 4 main, inverted-row × 3, leg-extension × 2) and paused
// focus states on it.
import type { SessionPlan } from "@workoutlab/shared";
import { initialFocusState, type FocusState, type LoggedSet } from "../machine.js";
import { BENCH, CURL, L1, P1, ROW, S1, STARTED_AT_MS } from "./fixtures.js";

export const INV_ROW = { ...ROW, exerciseId: "inverted-row", sets: 3 };
export const LEG_EXT = { ...CURL, exerciseId: "leg-extension", sets: 2 };
export const PLAN_P: SessionPlan = { ...P1, items: [BENCH, INV_ROW, LEG_EXT] };
export const CTX_P = { plan: PLAN_P, library: L1 };
export const NOW = STARTED_AT_MS + 10 * 60_000;
export const PAUSED_AT = NOW - 5000;

export function logged(itemIndex: number, setIndex: number, exerciseId?: string): LoggedSet {
  return {
    clientId: `c${itemIndex}-${setIndex}`,
    itemIndex,
    setIndex,
    exerciseId: exerciseId ?? PLAN_P.items[itemIndex]!.exerciseId,
    reps: 6,
    weightKg: 80,
    durationS: null,
    rir: null,
    backoff: false,
  };
}

export const benchDone = [0, 1, 2, 3].map((s) => logged(0, s));

/** P1 paused (at PAUSED_AT) from `resumePhase`. */
export function paused(resumePhase: FocusState["resumePhase"], over: Partial<FocusState> = {}) {
  const timerPhases = ["getReady", "warmup", "next"];
  return {
    ...initialFocusState(S1, PLAN_P, NOW),
    phase: "paused",
    resumePhase,
    pausedAtMs: PAUSED_AT,
    timer: timerPhases.includes(resumePhase ?? "")
      ? { startedAtMs: PAUSED_AT - 10_000, durationS: resumePhase === "next" ? 60 : 5, pausedMs: 0 }
      : null,
    ...over,
  } as FocusState;
}

/** AC1's state: bench-press logged, paused from `next` for item 1. */
export const PAUSED_NEXT = paused("next", { itemIndex: 1, loggedSets: benchDone });
