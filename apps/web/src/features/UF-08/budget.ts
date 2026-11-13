// T-0940 (D-0239 §6-§7, §13): the minutes UF-08.2 shows and refuses with, read from the engine's
// `Workout` totals only (principle 3). The bar, the empty-mode budget line, the UF-08.5 lead line
// and the over-budget refusal all use these, so they can never disagree.
import { availableS, type Workout } from "@workoutlab/engine";

/** `used` (D-0239 §7): what the bar shows, rounded up; it counts the warm-up when it is in the budget. */
export function usedMinutes(workout: Workout): number {
  return Math.ceil((workout.warmupInBudget ? workout.totalS : workout.itemsTotalS) / 60);
}

/** `left` (D-0239 §7): the engine's `unusedS`, rounded down. */
export function leftMinutes(workout: Workout): number {
  return Math.floor(workout.unusedS / 60);
}

/** Whole minutes over the budget (rounded up), 0 when the items fit `available` (rule 7.1). */
export function overMinutes(workout: Workout): number {
  const over = workout.itemsTotalS - availableS(workout.budgetMin, workout.warmupInBudget);
  return over > 0 ? Math.ceil(over / 60) : 0;
}
