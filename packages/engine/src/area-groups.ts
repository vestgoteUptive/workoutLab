// Rule 12.4 `areaGroups` (UF-08.2, UF-08.4, D-0275 §1, §2). Pure arithmetic over a workout:
// the plan grouped by home area, for the areas-first plan screen. It never picks anything.
import type { Area, WorkoutItem, Workout } from "./types.js";

export interface AreaGroup {
  area: Area;
  /** Exercise ids of the area's items, in item order. */
  itemIds: string[];
  /** Σ item `sets`; a back-off set is not counted (D-0040 §5). */
  sets: number;
  /** Σ item `costS` (a back-off set's time is inside its item's cost). */
  costS: number;
}

/**
 * An item's home area (D-0275 §1): the area of its own `area_deficit` reason, i.e. its first
 * primary area as rule 8 reads it. An item without one has none.
 */
export function homeAreaOf(item: WorkoutItem): Area | null {
  const r = item.reasons.find((x) => x.code === "area_deficit");
  return r === undefined || r.code !== "area_deficit" ? null : r.area;
}

/**
 * Rule 12.4: one group per home area, in order of first appearance in `plan.items`. Items with
 * no home area are in no group. Never mutates `workout`.
 */
export function areaGroups(workout: Workout): AreaGroup[] {
  const groups: AreaGroup[] = [];
  for (const item of workout.plan.items) {
    const area = homeAreaOf(item);
    if (area === null) continue;
    let g = groups.find((x) => x.area === area);
    if (g === undefined) {
      g = { area, itemIds: [], sets: 0, costS: 0 };
      groups.push(g);
    }
    g.itemIds.push(item.exerciseId);
    g.sets += item.sets;
    g.costS += item.costS;
  }
  return groups;
}
