// T-0945 UF-09.10 (D-0244, D-0246 §8–§13): fixture P from docs/specs/add-exercise-in-session.md
// and the helpers the rule 12.3 / rule 8 `timeLeftS` tests share.
import {
  availableS,
  insertItem,
  suggest,
  type HistorySet,
  type InsertResult,
  type LibraryExercise,
  type TimeLeftProgress,
  type Workout,
} from "../../src/index.js";
import { F_INPUT, F_PROFILE, F_TARGETS, LIBRARY, NOW, TZ } from "./common.js";

/**
 * Fixture P: F-tz, F-profile, F-goal, L1, `budgetMin 45`, warm-up in budget, energy normal;
 * bench-press × 4 (main, 720 s), inverted-row × 3 (555 s), leg-extension × 2 (270 s).
 * The items are R7-E4's (`suggest` at 30 min over empty history, so their reasons and
 * `startDeficits` are the engine's own); only the budget moves to 45, so `available` is
 * 2700 − 180 = 2520 and `unusedS` 2520 − 1545 = 975.
 */
export function fixtureP(
  overrides: Partial<Pick<Workout, "budgetMin" | "energy" | "warmupInBudget">> = {},
): Workout {
  const w = suggest([], F_TARGETS, F_PROFILE, LIBRARY, F_INPUT, NOW, TZ);
  const budgetMin = overrides.budgetMin ?? 45;
  const warmupInBudget = overrides.warmupInBudget ?? true;
  return {
    ...w,
    budgetMin,
    warmupInBudget,
    energy: overrides.energy ?? "normal",
    unusedS: Math.max(0, availableS(budgetMin, warmupInBudget) - w.itemsTotalS),
  };
}

/** A progress state with nothing logged, nothing skipped and the warm-up done. */
export function progress(w: Workout, p: Partial<TimeLeftProgress> = {}): TimeLeftProgress {
  return {
    elapsedS: 0,
    setsDone: w.plan.items.map(() => 0),
    skippedItems: [],
    warmupLeftS: 0,
    ...p,
  };
}

/** AC1's state (spec B1): paused in the rest after bench-press set 2 of 4, `elapsedS` 600. */
export const B1_STATE = { elapsedS: 600, setsDone: [2, 0, 0], skippedItems: [], warmupLeftS: 0 };

/** `insertItem` with the F-profile, L1 + warm-ups, `NOW` and F-tz unless given. */
export function insert(
  w: Workout,
  id: string,
  atIndex: number,
  leftS: number,
  history: readonly HistorySet[] = [],
  now: string = NOW,
  library: readonly LibraryExercise[] = LIBRARY,
): InsertResult {
  return insertItem(w, id, { atIndex, leftS }, history, F_PROFILE, library, now, TZ);
}

/**
 * The caller's remap after an insert at `k` (D-0245 §1): the new item has 0 sets done, and
 * every `skippedItems` entry ≥ k moves up by one.
 */
export function progressAfterInsert(p: TimeLeftProgress, k: number): TimeLeftProgress {
  const setsDone = [...p.setsDone];
  setsDone.splice(k, 0, 0);
  return {
    elapsedS: p.elapsedS,
    setsDone,
    skippedItems: p.skippedItems.map((i) => (i >= k ? i + 1 : i)),
    warmupLeftS: p.warmupLeftS,
  };
}

/** The L1 exercises (kind `exercise`) that are not items of `w`, in L1 order. */
export function notInPlan(w: Workout): LibraryExercise[] {
  const ids = new Set(w.plan.items.map((i) => i.exerciseId));
  return LIBRARY.filter((e) => e.kind === "exercise" && !ids.has(e.id));
}
