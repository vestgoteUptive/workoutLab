// What each set pre-fills (T-0304b, D-0066 §6, D-0118 §7). Pure: the engine's `prefill` for set 1,
// then the saved values carried forward, field by field. Principle 3: "pre-fill, don't ask".
import type { SessionPlan } from "@workoutlab/shared";
import type { LoggedSet } from "./machine.js";

export interface SetPrefill {
  weightKg: number | null;
  reps: number | null;
}

/**
 * The values UF-09.3 (and UF-09.5's "Next" line) show for set `setIndex` of item `itemIndex`:
 * - set 1: `item.prefill`, with a `null` `prefill.reps` falling back to `item.repsMin`;
 * - the back-off set (index `item.sets`, when the item has one): `backoff.weightKg` / `.reps`;
 * - set k > 1: each of weight and reps from the saved entry for set k − 1, each falling back on
 *   its own to the set 1 value when the saved one is `null` (or there is none).
 */
export function nextSetPrefill(
  plan: SessionPlan,
  itemIndex: number,
  setIndex: number,
  loggedSets: readonly LoggedSet[],
): SetPrefill {
  const item = plan.items[itemIndex];
  if (!item) return { weightKg: null, reps: null };
  const first: SetPrefill = {
    weightKg: item.prefill.weightKg,
    reps: item.prefill.reps ?? item.repsMin,
  };
  if (setIndex <= 0) return first;
  if (item.backoff && setIndex >= item.sets) {
    return { weightKg: item.backoff.weightKg, reps: item.backoff.reps };
  }
  let previous: LoggedSet | undefined;
  for (const s of loggedSets) {
    if (s.itemIndex === itemIndex && s.setIndex === setIndex - 1) previous = s;
  }
  return {
    weightKg: previous?.weightKg ?? first.weightKg,
    reps: previous?.reps ?? first.reps,
  };
}
