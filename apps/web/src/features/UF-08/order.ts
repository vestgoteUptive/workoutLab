// T-0576 (D-0205 §7): Reorder mode's display order. A UI-only permutation of `plan.items`; the
// engine never reads it. `order` is null while the plan is in engine order.
import type { Workout } from "@workoutlab/engine";

/** `workout` with its items in `ids` order (ids not in the plan are ignored; the rest follow). */
export function permute(workout: Workout, ids: readonly string[]): Workout {
  const byId = new Map(workout.plan.items.map((i) => [i.exerciseId, i]));
  const first = ids.flatMap((id) => {
    const item = byId.get(id);
    byId.delete(id);
    return item ? [item] : [];
  });
  return { ...workout, plan: { ...workout.plan, items: [...first, ...byId.values()] } };
}

/**
 * The order merge after a re-suggest: survivors keep the user's relative order, a new main lift
 * (or `mainFirst`) goes first, other new items follow in engine order. `order` null: engine order.
 */
export function mergeOrder(
  order: readonly string[] | null,
  next: Workout,
  mainFirst = false,
): { workout: Workout; order: string[] | null } {
  if (order === null) return { workout: next, order: null };
  const engine = next.plan.items.map((i) => i.exerciseId);
  const main = next.plan.mainLiftId;
  const survivors = order.filter((id) => engine.includes(id));
  const fresh = engine.filter((id) => !order.includes(id));
  const promote = main !== null && (mainFirst || fresh.includes(main));
  const rest = [...survivors, ...fresh].filter((id) => !promote || id !== main);
  const merged = promote ? [main, ...rest] : rest;
  return { workout: permute(next, merged), order: merged };
}
