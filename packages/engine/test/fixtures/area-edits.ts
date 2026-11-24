// T-0995 UF-08.2 UF-08.6 (D-0275 §3 to §5): fixtures for rules 12.5 to 12.7.
import {
  availableS,
  setCostS,
  type AreaEditContext,
  type HistorySet,
  type LibraryExercise,
  type Workout,
} from "../../src/index.js";
import { F_PROFILE, F_TARGETS, LIBRARY, NOW, TZ, shift, setsAt, HOUR } from "./common.js";
import { fixtureW } from "./order-groups.js";

export { fixtureW };

/** Fixture W at `budgetMin 45`: R7-E4's plan with the budget raised (available 2520, unused 975). */
export function fixtureW45(): Workout {
  const w = fixtureW();
  return {
    ...w,
    budgetMin: 45,
    unusedS: availableS(45, w.warmupInBudget) - w.itemsTotalS,
  };
}

export function ctxOf(over: Partial<AreaEditContext> = {}): AreaEditContext {
  return {
    history: [],
    targets: F_TARGETS,
    profile: F_PROFILE,
    library: LIBRARY,
    excludeIds: [],
    favoriteIds: [],
    avoidAreas: [],
    now: NOW,
    tz: TZ,
    ...over,
  };
}

/** R7-E3's history: 6 hard back-squat sets 24 h before `now` (quads and glutes recover). */
export const R7_E3_HISTORY: HistorySet[] = setsAt(6, "back-squat", shift(NOW, -24 * HOUR));

export function lib(id: string, library: readonly LibraryExercise[] = LIBRARY): LibraryExercise {
  const e = library.find((x) => x.id === id);
  if (e === undefined) throw new Error(`unknown exercise ${id}`);
  return e;
}

/** One set's time of `id` (rule 7.1). */
export const setS = (id: string, library: readonly LibraryExercise[] = LIBRARY): number =>
  setCostS(lib(id, library));

export const sets = (w: Workout): Array<[string, number]> =>
  w.plan.items.map((i) => [i.exerciseId, i.sets]);
