// Rule 7.6 `orderItems` (UF-08.2, UF-08.4, D-0274 §4, D-0275 §7). Pure: the run order of a plan.
// A permutation of `plan.items`; nothing else about the workout changes.
import { copyItem } from "./apply-swap.js";
import { homeAreaOf } from "./area-groups.js";
import type { Area, LibraryExercise, Workout, WorkoutItem } from "./types.js";

export type EquipmentGroup = "barbell" | "dumbbell" | "machine" | "cable" | "bodyweight";

/**
 * Rule 7.6 equipment group, from the exercise's first equipment item: barbell, rack and bench
 * are `barbell`; dumbbell, machine and cable are their own; pull-up bar, none, no equipment and
 * any unknown item are `bodyweight`.
 */
export function equipmentGroupOf(exercise: LibraryExercise): EquipmentGroup {
  switch (exercise.equipment[0]) {
    case "barbell":
    case "rack":
    case "bench":
      return "barbell";
    case "dumbbell":
      return "dumbbell";
    case "machine":
      return "machine";
    case "cable":
      return "cable";
    default:
      return "bodyweight";
  }
}

interface Entry {
  item: WorkoutItem;
  index: number;
  area: Area | null;
  group: EquipmentGroup;
}

/**
 * Rule 7.6: `workout` with `plan.items` reordered. Tier 0 is the main lift (`isMain`), tier 1
 * the other compounds, tier 2 isolations (timed holds included). Within tiers 1 and 2 each next
 * item is, in this order of preference: in a home area other than the previously placed item's
 * (the previous item may be from the tier before), then in the previous item's equipment group,
 * then the lowest original index. Everything else (`mainLiftId`, costs, totals, warm-up,
 * `sessionReasons`) is copied unchanged. Idempotent, deterministic, never mutates `workout`.
 * Throws `RangeError` when an item's exercise is not in `library`.
 */
export function orderItems(workout: Workout, library: readonly LibraryExercise[]): Workout {
  const byId = new Map(library.map((e) => [e.id, e] as const));
  const entries: Entry[] = workout.plan.items.map((item, index) => {
    const ex = byId.get(item.exerciseId);
    if (ex === undefined) throw new RangeError(`${item.exerciseId} is not in the library`);
    return { item, index, area: homeAreaOf(item), group: equipmentGroupOf(ex) };
  });
  const tierOf = (e: Entry): number =>
    e.item.isMain ? 0 : byId.get(e.item.exerciseId)?.type === "compound" ? 1 : 2;

  const placed: Entry[] = [];
  for (const tier of [0, 1, 2]) {
    if (tier === 0) {
      placed.push(...entries.filter((e) => tierOf(e) === 0));
      continue;
    }
    const rest = entries.filter((e) => tierOf(e) === tier);
    while (rest.length > 0) {
      const prev = placed[placed.length - 1];
      const key = (e: Entry): [number, number, number] => [
        prev !== undefined && e.area !== null && e.area === prev.area ? 1 : 0,
        prev !== undefined && e.group === prev.group ? 0 : 1,
        e.index,
      ];
      let best = 0;
      for (let k = 1; k < rest.length; k++) {
        const a = key(rest[k] as Entry);
        const b = key(rest[best] as Entry);
        if (a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && a[2] < b[2]))))
          best = k;
      }
      placed.push(...rest.splice(best, 1));
    }
  }

  return {
    plan: {
      version: workout.plan.version,
      mainLiftId: workout.plan.mainLiftId,
      warmup: workout.plan.warmup.map((m) => ({ ...m })),
      items: placed.map((e) => copyItem(e.item)),
      startDeficits: { ...workout.plan.startDeficits },
    },
    budgetMin: workout.budgetMin,
    warmupInBudget: workout.warmupInBudget,
    energy: workout.energy,
    itemsTotalS: workout.itemsTotalS,
    totalS: workout.totalS,
    unusedS: workout.unusedS,
    sessionReasons: workout.sessionReasons.map((r) => ({ ...r })),
  };
}
