// Rule 12.3 `insertItem` (UF-09.10, D-0244 §1, D-0246 §8–§10). Pure: adds one exercise to a
// workout in progress, built the way `applySwap` builds an item (one shared `buildItem`), at
// 3 sets or else 2 inside the time left, and recomputes the totals. Every other field and item
// is unchanged. The UI never builds a plan item or decides the fit itself (principle 3).
import { copyItem } from "./apply-swap.js";
import { availableS } from "./cost.js";
import { indexLibrary, normalizeHistory } from "./history.js";
import { aggregateWindow } from "./load.js";
import { plannedDurationFrom, prefillFrom } from "./prefill.js";
import { buildItem, goalOf, MAX_ITEMS, repRange } from "./session.js";
import { dayDiff, instantMs, localDate } from "./time.js";
import {
  AREAS,
  type Area,
  type HistorySet,
  type InsertOptions,
  type InsertResult,
  type Instant,
  type LibraryExercise,
  type Reason,
  type SuggestProfile,
  type TimeZone,
  type Workout,
  type WorkoutItem,
} from "./types.js";
import { WARMUP_COST_S } from "./warmup.js";

/** The set counts tried, in order (D-0244 §1): 3 then 2, or only 2 at Low energy (rule 7.4). */
const SETS_NORMAL = [3, 2] as const;
const SETS_LOW = [2] as const;

/** D-0246 §8 step 1: the structural checks, all `RangeError`, before the cap and the fit. */
function assertInsert(
  workout: Workout,
  exerciseId: string,
  opts: InsertOptions,
  lib: ReadonlyMap<string, LibraryExercise>,
  now: Instant,
): LibraryExercise {
  const ex = lib.get(exerciseId);
  if (ex === undefined) throw new RangeError(`${exerciseId} is not in the library`);
  if (ex.kind !== "exercise") throw new RangeError(`${exerciseId} is a warm-up move`);
  const items = workout.plan.items;
  if (items.some((i) => i.exerciseId === exerciseId)) {
    throw new RangeError(`${exerciseId} is already in the plan`);
  }
  const { atIndex, leftS } = opts;
  if (!Number.isInteger(atIndex) || atIndex < 0 || atIndex > items.length) {
    throw new RangeError(`atIndex must be an integer 0…${items.length}, got ${String(atIndex)}`);
  }
  if (!Number.isInteger(leftS)) throw new RangeError(`leftS must be an integer, got ${leftS}`);
  instantMs(now);
  return ex;
}

/**
 * Rule 12.3 (UF-09.10, D-0244 §1, D-0246 §8–§10): `workout` with `exerciseId` inserted at
 * `atIndex` as an accessory (`isMain: false`, rule 7.2's accessory rep slot for the profile's
 * goal, the rule 14 pre-fill over `history` at `now` with no `previous`, a timed exercise at its
 * planned duration, no back-off). It gets 3 sets, else 2, whichever first has `costS ≤ leftS`;
 * at Low energy only 2 is tried and the item carries `energy_low_trim`. Reasons for its first
 * primary area: `area_deficit` (session-start deficit), `days_since`, `energy_low_trim`,
 * `prefill`. Totals are recomputed (`unusedS` clamps at 0); `plan.version`, `mainLiftId`, the
 * warm-up, `startDeficits`, `sessionReasons`, the session fields and every other item are
 * unchanged. Check order: structural `RangeError`s, then `{refused: "items_cap"}` at 8 items,
 * then `{refused: "time"}`. Never mutates its inputs.
 */
export function insertItem(
  workout: Workout,
  exerciseId: string,
  opts: InsertOptions,
  history: readonly HistorySet[],
  profile: SuggestProfile,
  library: readonly LibraryExercise[],
  now: Instant,
  tz: TimeZone,
): InsertResult {
  const lib = indexLibrary(library);
  const ex = assertInsert(workout, exerciseId, opts, lib, now);
  const goal = goalOf(profile);
  if (workout.plan.items.length >= MAX_ITEMS) return { refused: "items_cap" };

  const hard = normalizeHistory(history);
  const today = localDate(now, tz);
  const [repsMin, repsMax] = repRange(ex, false, goal);
  // D-0244 §1: rule 14 with no `previous`, so step 1 never carries.
  const prefill = prefillFrom(ex, { repsMin, repsMax }, hard, lib, today, tz, null);
  // As in `applySwap` (D-0093 §3): `days_since` counts every set up to `now`, today's included.
  const agg = aggregateWindow(history, library, now, tz);
  const daysSince = {} as Record<Area, number | null>;
  for (const a of AREAS) {
    const last = agg.lastTrainedDate[a];
    daysSince[a] = last === null ? null : dayDiff(last, agg.windowEnd);
  }
  const low = workout.energy === "low";
  const plannedS = plannedDurationFrom(ex, hard, lib, today, tz);
  let item: WorkoutItem | null = null;
  for (const sets of low ? SETS_LOW : SETS_NORMAL) {
    const built = buildItem(
      {
        exercise: ex,
        isMain: false,
        sets,
        prefill,
        backoff: false,
        // D-0246 §9: `undefined` adds no swap reason (`null` would add `swap {null}`).
        swap: undefined,
        lowTrimmed: low,
        plannedS,
        goal,
      },
      { deficits: workout.plan.startDeficits, daysSince },
    );
    if (built.costS <= opts.leftS) {
      item = built;
      break;
    }
  }
  if (item === null) return { refused: "time" };

  const items = workout.plan.items.map(copyItem);
  items.splice(opts.atIndex, 0, item);
  const itemsTotalS = items.reduce((sum, i) => sum + i.costS, 0);
  const available = availableS(workout.budgetMin, workout.warmupInBudget);
  return {
    workout: {
      plan: {
        version: workout.plan.version,
        mainLiftId: workout.plan.mainLiftId,
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
      sessionReasons: workout.sessionReasons.map((r): Reason => ({ ...r })),
    },
    sets: item.sets,
  };
}
