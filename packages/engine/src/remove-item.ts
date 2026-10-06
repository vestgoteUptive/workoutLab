// Rule 12.2 `removeItem` (UF-08.2, D-0191 §4, GitHub #33). Pure: drops one item of a workout
// without refilling the freed time, keeps every other field, and recomputes the totals. The UI
// never edits a plan item itself (principle 3).
import { copyItem } from "./apply-swap.js";
import { availableS } from "./cost.js";
import type { Area, Reason, Workout, WorkoutItem } from "./types.js";
import { WARMUP_COST_S } from "./warmup.js";

/**
 * An item's first primary area: the area of its `area_deficit` reason, which rule 10 writes for
 * the item's first primary area (`suggest` and `applySwap` always write one). Same reading as
 * rule 8's `timeCheck`. An item without one has no area here.
 */
function firstPrimaryArea(item: WorkoutItem): Area | null {
  const r = item.reasons.find((x) => x.code === "area_deficit");
  return r === undefined || r.code !== "area_deficit" ? null : r.area;
}

/**
 * Rule 12.2 (UF-08.2, D-0191 §4): `workout` without the item `exerciseId`, and nothing in its
 * place. The other items keep their order and are unchanged. `plan.mainLiftId` becomes null when
 * the removed item was the main lift (no other item is promoted). `itemsTotalS = Σ costS`,
 * `totalS = itemsTotalS + 180`, `unusedS = max(0, available − itemsTotalS)`. `sessionReasons`
 * loses the `area_deficit` entries whose area is no remaining item's first primary area;
 * `recovering_skipped` stays and nothing is added. The warm-up is not regenerated, and
 * `plan.version`, `plan.startDeficits`, `budgetMin`, `warmupInBudget` and `energy` are unchanged.
 * Throws `RangeError` when `exerciseId` is not an item of the plan. Never mutates `workout`.
 */
export function removeItem(workout: Workout, exerciseId: string): Workout {
  const index = workout.plan.items.findIndex((i) => i.exerciseId === exerciseId);
  const removed = workout.plan.items[index];
  if (removed === undefined) throw new RangeError(`${exerciseId} is not an item of the plan`);

  const items = workout.plan.items.filter((_, k) => k !== index).map(copyItem);
  const kept = new Set<Area>();
  for (const i of items) {
    const a = firstPrimaryArea(i);
    if (a !== null) kept.add(a);
  }
  const sessionReasons = workout.sessionReasons
    .filter((r) => r.code !== "area_deficit" || kept.has(r.area))
    .map((r): Reason => ({ ...r }));
  const itemsTotalS = items.reduce((sum, i) => sum + i.costS, 0);
  const available = availableS(workout.budgetMin, workout.warmupInBudget);
  return {
    plan: {
      version: workout.plan.version,
      mainLiftId: removed.isMain ? null : workout.plan.mainLiftId,
      warmup: workout.plan.warmup.map((m) => ({ ...m })),
      items,
      startDeficits: { ...workout.plan.startDeficits },
    },
    budgetMin: workout.budgetMin,
    warmupInBudget: workout.warmupInBudget,
    energy: workout.energy,
    itemsTotalS,
    totalS: itemsTotalS + WARMUP_COST_S,
    unusedS: Math.max(0, available - itemsTotalS),
    sessionReasons,
  };
}
