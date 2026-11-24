// T-0994 UF-08.2 UF-08.4 (D-0275): fixture W and plan builders for rules 7.6 and 12.4.
import {
  itemCostS,
  primaryAreas,
  suggest,
  type Area,
  type LibraryExercise,
  type Workout,
  type WorkoutItem,
} from "../../src/index.js";
import { F_INPUT, F_PROFILE, F_TARGETS, LIBRARY, NOW, TZ } from "./common.js";

/** Fixture W: R7-E4's plan (bench-press × 4 main, inverted-row × 3, leg-extension × 2). */
export function fixtureW(): Workout {
  return suggest([], F_TARGETS, F_PROFILE, LIBRARY, F_INPUT, NOW, TZ);
}

export function exerciseOf(id: string): LibraryExercise {
  const e = LIBRARY.find((x) => x.id === id);
  if (e === undefined) throw new Error(`unknown exercise ${id}`);
  return e;
}

/** A synthetic item: home area = the exercise's first primary area, cost from rule 7.1. */
export function mkItem(id: string, sets: number, isMain = false): WorkoutItem {
  const ex = exerciseOf(id);
  const area = primaryAreas(ex)[0] as Area;
  return {
    exerciseId: id,
    isMain,
    sets,
    repsMin: ex.timed ? null : 8,
    repsMax: ex.timed ? null : 12,
    durationS: ex.timed ? ex.defaultDurationS : null,
    costS: itemCostS(ex, sets),
    backoff: null,
    prefill: { weightKg: null, reps: null, durationS: null, kind: "first_time" },
    reasons: [
      { code: "area_deficit", area, deficit: 1 },
      { code: "days_since", area, days: null },
    ],
  };
}

/** A workout over W's frame with the given items; totals follow the items. */
export function mkWorkout(items: WorkoutItem[], mainLiftId: string | null = null): Workout {
  const w = fixtureW();
  const itemsTotalS = items.reduce((s, i) => s + i.costS, 0);
  return {
    ...w,
    plan: { ...w.plan, items, mainLiftId },
    itemsTotalS,
    totalS: itemsTotalS + 180,
    unusedS: Math.max(0, 1620 - itemsTotalS),
  };
}

export const ids = (w: Workout): string[] => w.plan.items.map((i) => i.exerciseId);
