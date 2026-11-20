// T-0941 (D-0238, D-0239 §3, §13.1): the empty-mode Suggestions list. Principle 3: the engine ranks
// and fits every row; this file only picks which `suggest` call to make and drops what is already
// in the plan. The calls are made through `run`, so the host's data, spy and error handling apply.
import { MAX_ITEMS, type SessionInput, type Workout, type WorkoutItem } from "@workoutlab/engine";
import { overMinutes } from "./budget.js";
import { MAX_BUDGET } from "./time.js";

/** What the Suggestions section shows, first match wins (UF-08.2.md › Suggestions section). */
export type SuggestionList =
  | { kind: "rows"; rows: readonly WorkoutItem[] }
  | { kind: "over"; over: number }
  | { kind: "full" }
  | { kind: "none" };

export interface SuggestionInputs {
  /** The plan call's inputs without the empty-mode switches: `pinnedIds` = `addedIds`, the visit's `excludeIds`. */
  base: SessionInput;
  /** The visit's `shuffle` (the plan call always uses 0). */
  shuffle: number;
  /** The visit's main pick, or null. */
  mainPickId: string | null;
  /** The current plan (what will be started). */
  plan: Workout;
}

/**
 * Over budget: no call (D-0239 §13.1). Else one call with `fill: true`, `autoMainLift` while there
 * is no main pick; a second call with `autoMainLift: false, mainLiftId: null` only when an id in
 * the current plan is missing from the first result (D-0239 §3). The rows are the result's items
 * that are not in the plan, in engine order.
 */
export function computeSuggestions(
  run: (input: SessionInput) => Workout | null,
  { base, shuffle, mainPickId, plan }: SuggestionInputs,
): SuggestionList {
  const over = overMinutes(plan);
  if (over > 0) return { kind: "over", over };
  const call = (autoMainLift: boolean, mainLiftId: string | null, budgetMin = base.budgetMin) =>
    run({ ...base, budgetMin, shuffle, mainLiftId, autoMainLift, fill: true });
  const planIds = plan.plan.items.map((i) => i.exerciseId);
  const has = (w: Workout, id: string) => w.plan.items.some((i) => i.exerciseId === id);
  let result = call(mainPickId === null, mainPickId);
  if (result === null) return { kind: "none" };
  if (planIds.some((id) => !has(result!, id))) {
    result = call(false, null) ?? result;
  }
  const rows = result.plan.items.filter((i) => !planIds.includes(i.exerciseId));
  if (rows.length > 0) return { kind: "rows", rows };
  if (planIds.length === 0) return { kind: "none" };
  if (planIds.length >= MAX_ITEMS) return { kind: "full" };
  // Time or nothing to suggest? Ask the engine once more with the longest budget (no new rule).
  const probe = call(mainPickId === null, mainPickId, MAX_BUDGET);
  const more = probe !== null && probe.plan.items.some((i) => !planIds.includes(i.exerciseId));
  return more ? { kind: "full" } : { kind: "none" };
}
