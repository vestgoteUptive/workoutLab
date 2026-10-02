// UF-09.8 rule 8 through the engine (T-0304d, D-0024, D-0066 §11, D-0120 §2–§4). Principle 3:
// `timeCheck` picks what to cut; this module only calls it, keeps its answer and does the
// clock maths around it. Pure apart from the call itself; no I/O.
import { timeCheck, type TimeCheckResult } from "@workoutlab/engine";
import type { SessionPlan } from "@workoutlab/shared";
import type { FocusCtx, FocusState } from "./machine.js";
import type { SessionRow } from "./session.js";
import { buildWorkout } from "./session.js";
import { elapsedS as elapsedSOf } from "./timer.js";
import type { ResolveCheckPoint } from "./store.js";

/** One rule 8 answer, kept for the UF-09.8 view (D-0120 §4: one call per check point). */
export interface HeldCheck {
  /** The item UF-09.8 is in front of (`nextItemIndex`). */
  itemIndex: number;
  /** The `elapsedS` passed to `timeCheck`. */
  elapsedS: number;
  /** The wall-clock moment of the check: the projected finishes are fixed at it. */
  atMs: number;
  result: TimeCheckResult;
}

/** What the host shares with the rule 8 resolver: the loaded row and the last answer. */
export interface CheckHolder {
  row: SessionRow | null;
  held: HeldCheck | null;
}

export function createCheckHolder(): CheckHolder {
  return { row: null, held: null };
}

/** Rule 8's elapsed seconds at `atMs` (D-0066 §11, D-0120 §3): `max(0, floor(…))`, an integer,
 *  with the pauses and an off-budget warm-up taken out. A clock moved back gives 0. */
export function checkElapsedS(row: SessionRow, state: FocusState, atMs: number): number {
  const startedAtMs = Date.parse(row.started_at);
  return elapsedSOf(
    {
      startedAtMs: Number.isFinite(startedAtMs) ? startedAtMs : atMs,
      workoutPausedMs: state.workoutPausedMs,
      pausedAtMs: state.pausedAtMs,
      warmupSpentMs: state.warmupSpentMs,
      warmupInBudget: row.warmup_in_budget ?? true,
    },
    atMs,
  );
}

/** "You planned to finish by" (D-0120 §2): start + budget + pauses + an off-budget warm-up. */
export function plannedFinishMs(row: SessionRow, state: FocusState): number | null {
  const startedAtMs = Date.parse(row.started_at);
  if (!Number.isFinite(startedAtMs)) return null;
  const warmupMs = (row.warmup_in_budget ?? true) ? 0 : state.warmupSpentMs;
  return startedAtMs + row.time_budget_min * 60_000 + state.workoutPausedMs + warmupMs;
}

/** An option's projected finish (D-0120 §2): `now + (projectedS − elapsedS)`, at the check. */
export function projectedFinishMs(held: HeldCheck, projectedS: number): number {
  return held.atMs + (projectedS - held.elapsedS) * 1000;
}

/**
 * Calls `timeCheck(workout, {elapsedS, nextItemIndex})` once. `null` when it throws (D-0120 §3:
 * a failing check never blocks the workout).
 */
export function runTimeCheck(
  row: SessionRow,
  plan: SessionPlan,
  state: FocusState,
  nextItemIndex: number,
  atMs: number,
): HeldCheck | null {
  const elapsedS = checkElapsedS(row, state, atMs);
  try {
    const result = timeCheck(buildWorkout(row, plan), { elapsedS, nextItemIndex });
    return { itemIndex: nextItemIndex, elapsedS, atMs, result };
  } catch {
    return null;
  }
}

/**
 * The default check point (D-0111 §5, D-0120 §4): rule 8 for the item after the one that just
 * ended. It keeps the answer in `holder`, so UF-09.8 shows it with no second call.
 */
export function ruleEightCheckPoint(holder: CheckHolder): ResolveCheckPoint {
  return (state: FocusState, ctx: FocusCtx, atMs: number) => {
    const next = state.itemIndex + 1;
    holder.held = null;
    // After the last item nothing is checked: the machine goes to `done`.
    if (!holder.row || next >= ctx.plan.items.length) return "next";
    const held = runTimeCheck(holder.row, ctx.plan, state, next, atMs);
    holder.held = held;
    return held?.result.show ? "timeCheck" : "next";
  };
}

/** Deep equality over JSON-shaped values (D-0120 §1: Trim is offered only when its item list
 *  differs from the plan's). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(rb, k) && deepEqual(ra[k], rb[k]));
}
