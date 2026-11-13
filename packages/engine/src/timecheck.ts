// Rule 8: running over time (UF-09.8, D-0024, D-0037 §8, D-0040 §10, D-0047). Pure.
// T-0945 adds `timeLeftS`, the time left in a workout in progress (UF-09.10, D-0244 §2,
// D-0246 §11).
import { TRANSITION_S } from "./session.js";
import type {
  Area,
  TimeCheckOption,
  TimeCheckProgress,
  TimeCheckResult,
  TimeLeftProgress,
  Workout,
  WorkoutItem,
} from "./types.js";
import { WARMUP_COST_S } from "./warmup.js";

/** UF-09.8 shows only when `behindS ≥ SHOW_BEHIND_S` (rule 8). */
export const SHOW_BEHIND_S = 60;
/** Trim step 1 only cuts sets from accessories above this many sets (rule 8). */
export const TRIM_MIN_SETS = 2;

function assertProgress(workout: Workout, progress: TimeCheckProgress): void {
  const { elapsedS, nextItemIndex } = progress;
  if (!Number.isInteger(elapsedS) || elapsedS < 0) {
    throw new RangeError(`elapsedS must be an integer ≥ 0, got ${elapsedS}`);
  }
  const n = workout.plan.items.length;
  if (!Number.isInteger(nextItemIndex) || nextItemIndex < 0 || nextItemIndex > n) {
    throw new RangeError(`nextItemIndex must be an integer 0…${n}, got ${nextItemIndex}`);
  }
}

const sumCost = (items: readonly WorkoutItem[], from: number): number =>
  items.slice(from).reduce((s, i) => s + i.costS, 0);

/**
 * Session-start deficit of the item's first primary area. `timeCheck` has no library, so
 * the area comes from the item's `area_deficit` reason, which `suggest` always writes
 * (D-0040 §6). An item without one counts as deficit 1, so it is trimmed last (D-0047).
 */
function trimDeficit(workout: Workout, item: WorkoutItem): number {
  const r = item.reasons.find((x) => x.code === "area_deficit");
  if (r === undefined || r.code !== "area_deficit") return 1;
  const area: Area = r.area;
  return workout.plan.startDeficits[area];
}

/** One set's cost, recovered from the item: `(costS − transition − back-off) / sets`. */
function perSetS(item: WorkoutItem): number {
  const sets = item.sets + (item.backoff === null ? 0 : 1);
  return (item.costS - TRANSITION_S) / sets;
}

/** A deep copy, so the result never aliases the (possibly frozen) input. */
function cloneItem(item: WorkoutItem): WorkoutItem {
  return {
    ...item,
    backoff: item.backoff === null ? null : { ...item.backoff },
    prefill: { ...item.prefill },
    reasons: item.reasons.map((r) => ({ ...r })),
  };
}

/**
 * Trim (rule 8): (1) cut 1 set from the not-started accessory with more than 2 sets and the
 * lowest session-start deficit (ties: the later item), until `behindS ≤ 0`; (2) if still
 * over, drop whole not-started accessories in the same order. The main lift is never cut.
 * Trimmed items get their `costS` recomputed and keep their reasons (D-0040 §10).
 */
function trimPlan(
  workout: Workout,
  items: WorkoutItem[],
  next: number,
  behindS: number,
): WorkoutItem[] {
  let behind = behindS;
  // Candidates in trim order: lowest deficit first, then the later item first.
  const order = (idx: number[]): number[] =>
    [...idx].sort((a, b) => {
      const da = trimDeficit(workout, items[a] as WorkoutItem);
      const db = trimDeficit(workout, items[b] as WorkoutItem);
      return da - db || b - a;
    });
  const accessories = items.map((it, i) => ({ it, i })).filter((x) => x.i >= next && !x.it.isMain);

  while (behind > 0) {
    const open = order(accessories.filter((x) => x.it.sets > TRIM_MIN_SETS).map((x) => x.i));
    const i = open[0];
    if (i === undefined) break;
    const item = items[i] as WorkoutItem;
    const per = perSetS(item);
    item.sets -= 1;
    item.costS -= per;
    behind -= per;
  }

  const removed = new Set<number>();
  for (const i of order(accessories.map((x) => x.i))) {
    if (behind <= 0) break;
    behind -= (items[i] as WorkoutItem).costS;
    removed.add(i);
  }
  return items.filter((_, i) => !removed.has(i));
}

/**
 * The UF-09.8 time check, run between exercises (rule 8). `behindS = elapsedS + Σ costS of
 * not-started items − budgetMin × 60`. `trim` and `skipNext` are always computed. After the
 * last item (`nextItemIndex = items.length`) nothing is shown and both equal the plan.
 * Skip next removes the next item even when it is the main lift (D-0040 §10).
 */
export function timeCheck(workout: Workout, progress: TimeCheckProgress): TimeCheckResult {
  assertProgress(workout, progress);
  const { elapsedS, nextItemIndex: next } = progress;
  const plan = workout.plan.items;
  const behindS = elapsedS + sumCost(plan, next) - workout.budgetMin * 60;
  const done = next === plan.length;
  const show = !done && behindS >= SHOW_BEHIND_S;

  const option = (items: WorkoutItem[]): TimeCheckOption => ({
    items,
    projectedS: elapsedS + sumCost(items, next),
  });

  const trimmed = done
    ? plan.map(cloneItem)
    : trimPlan(workout, plan.map(cloneItem), next, behindS);
  const skipped = plan.map(cloneItem).filter((_, i) => done || i !== next);

  return {
    behindS,
    show,
    minutesBehind: show ? Math.ceil(behindS / 60) : null,
    projectedS: elapsedS + sumCost(plan, next),
    trim: option(trimmed),
    skipNext: option(skipped),
  };
}

const isInt = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);

/** D-0244 §2, D-0246 §11: `RangeError` on any input outside the documented domain. */
function assertTimeLeft(workout: Workout, progress: TimeLeftProgress): void {
  const { elapsedS, setsDone, skippedItems, warmupLeftS } = progress;
  const n = workout.plan.items.length;
  if (!isInt(elapsedS) || elapsedS < 0) {
    throw new RangeError(`elapsedS must be an integer ≥ 0, got ${String(elapsedS)}`);
  }
  if (!isInt(warmupLeftS) || warmupLeftS < 0 || warmupLeftS > WARMUP_COST_S) {
    throw new RangeError(
      `warmupLeftS must be an integer 0…${WARMUP_COST_S}, got ${String(warmupLeftS)}`,
    );
  }
  if (!workout.warmupInBudget && warmupLeftS !== 0) {
    throw new RangeError(`warmupLeftS must be 0 when the warm-up is not in the budget`);
  }
  if (setsDone.length !== n) {
    throw new RangeError(`setsDone has ${setsDone.length} entries for ${n} items`);
  }
  setsDone.forEach((d, i) => {
    if (!isInt(d) || d < 0) {
      throw new RangeError(`setsDone[${i}] must be an integer ≥ 0, got ${String(d)}`);
    }
  });
  for (const k of skippedItems) {
    if (!isInt(k) || k < 0 || k >= n) {
      throw new RangeError(`skippedItems entry ${String(k)} is not an item index 0…${n - 1}`);
    }
  }
}

/**
 * What is left of item `item` after `done` sets (rule 8, D-0244 §2): its whole `costS` when
 * nothing is logged, otherwise the sets still to do (a back-off counts as a set) at rule 8's
 * per-set cost, with no transition. Rounded up to the whole second, which is exact for every
 * item the engine builds; D-0244 §2 asks for an integer, and up is the conservative side.
 */
function remainingS(item: WorkoutItem, done: number): number {
  if (done === 0) return item.costS;
  const sets = item.sets + (item.backoff === null ? 0 : 1);
  const left = Math.max(0, sets - done);
  return left === 0 ? 0 : Math.ceil((left * (item.costS - TRANSITION_S)) / sets);
}

/**
 * Rule 8 time left in a workout in progress (UF-09.10, D-0244 §2, D-0246 §11):
 * `budgetMin × 60 − elapsedS − warmupLeftS − Σ remaining(i)` over the items that are not
 * skipped. An integer, negative when the workout is behind. Between exercises it equals
 * `−timeCheck(…).behindS` only when no item at or after the next one has sets logged ahead
 * and none of them is skipped. Throws `RangeError` on an input outside its domain. Never
 * mutates its inputs.
 */
export function timeLeftS(workout: Workout, progress: TimeLeftProgress): number {
  assertTimeLeft(workout, progress);
  const skipped = new Set(progress.skippedItems);
  let left = workout.budgetMin * 60 - progress.elapsedS - progress.warmupLeftS;
  workout.plan.items.forEach((item, i) => {
    if (!skipped.has(i)) left -= remainingS(item, progress.setsDone[i] as number);
  });
  return left;
}
