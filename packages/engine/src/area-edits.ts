// Rules 12.5 to 12.7 (UF-08.2, UF-08.6, D-0275 §3 to §5): pure edits of an area plan. A plan is
// grouped by home area (rule 12.4); every edit is local to one area and never leaves a plan over
// budget unless it was over before. The engine picks every exercise and every set count here;
// the UI only decides which call a tap makes (principle 3).
import { copyItem } from "./apply-swap.js";
import { homeAreaOf } from "./area-groups.js";
import { availableS, setCostS } from "./cost.js";
import { indexLibrary, normalizeHistory, primaryAreas, weightsOf } from "./history.js";
import { aggregateWindow } from "./load.js";
import { plannedDurationFrom, prefillFrom } from "./prefill.js";
import { removeItem } from "./remove-item.js";
import {
  avoidedAreas,
  buildItem,
  buildStart,
  candidates,
  durationsOf,
  excludedOutAreas,
  goalOf,
  mainCandidates,
  MAX_ITEMS,
  MAX_ITEMS_PER_AREA,
  newState,
  prefillCtxOf,
  repRange,
  type State,
} from "./session.js";
import { dayDiff, instantMs } from "./time.js";
import {
  AREAS,
  type AddAreaRefusal,
  type AdjustRefusal,
  type Area,
  type AreaCandidate,
  type AreaEditContext,
  type AreaRefused,
  type AreaUnavailableReason,
  type LibraryExercise,
  type Reason,
  type Workout,
  type WorkoutItem,
} from "./types.js";
import { WARMUP_COST_S } from "./warmup.js";

/** Rule 12.5: most sets one item holds (the main lift 4, any other item 3) and the area minimum. */
const CAP_MAIN = 4;
const CAP_OTHER = 3;
const MIN_SETS = 2;
const ADD_TRIES = [3, 2] as const;
const SECOND_TRIES = [2] as const;

interface Env {
  workout: Workout;
  ctx: AreaEditContext;
  lib: ReadonlyMap<string, LibraryExercise>;
  s: State;
  /** `available − Σ item costs`; negative when the plan is over budget. */
  leftS: number;
  low: boolean;
}

function assertArea(area: Area): void {
  if (!(AREAS as readonly string[]).includes(area)) {
    throw new RangeError(`Unknown area: ${String(area)}`);
  }
}

/** The structural checks every edit makes: `now` has an offset, every item is in the library. */
function libOf(workout: Workout, ctx: AreaEditContext): ReadonlyMap<string, LibraryExercise> {
  instantMs(ctx.now);
  const lib = indexLibrary(ctx.library);
  for (const item of workout.plan.items) {
    if (!lib.has(item.exerciseId)) throw new RangeError(`${item.exerciseId} is not in the library`);
  }
  return lib;
}

function envOf(workout: Workout, ctx: AreaEditContext, lib = libOf(workout, ctx)): Env {
  const goal = goalOf(ctx.profile);
  const start = buildStart(
    ctx.history,
    ctx.targets,
    ctx.profile,
    ctx.library,
    ctx.excludeIds ?? [],
    avoidedAreas(ctx.avoidAreas === undefined ? {} : { avoidAreas: ctx.avoidAreas }),
    ctx.favoriteIds ?? [],
    ctx.now,
    ctx.tz,
  );
  const durationOf = durationsOf(prefillCtxOf(ctx.history, ctx.library, ctx.now, ctx.tz, goal));
  const available = availableS(workout.budgetMin, workout.warmupInBudget);
  const total = workout.plan.items.reduce((sum, i) => sum + i.costS, 0);
  const s = newState(start, available - total, durationOf);
  for (const item of workout.plan.items) {
    const ex = lib.get(item.exerciseId);
    if (ex === undefined) throw new RangeError(`${item.exerciseId} is not in the library`);
    s.picked.push({ exercise: ex, sets: item.sets, isMain: item.isMain });
    for (const [a, w] of weightsOf(ex)) s.projected[a] += item.sets * w;
    for (const a of primaryAreas(ex)) s.primaryCount[a] += 1;
  }
  return { workout, ctx, lib, s, leftS: available - total, low: workout.energy === "low" };
}

/** Indexes of the items homed in `area`, in item order. */
function homed(workout: Workout, area: Area): number[] {
  const out: number[] = [];
  workout.plan.items.forEach((item, k) => {
    if (homeAreaOf(item) === area) out.push(k);
  });
  return out;
}

/** The workout over `items`, with the totals of rule 12.2 and everything else as it was. */
function withItems(workout: Workout, items: WorkoutItem[], mainLiftId: string | null): Workout {
  const itemsTotalS = items.reduce((sum, i) => sum + i.costS, 0);
  const available = availableS(workout.budgetMin, workout.warmupInBudget);
  return {
    plan: {
      version: workout.plan.version,
      mainLiftId,
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
  };
}

/** One new item built as `insertItem` builds it (rule 12.3): rule 14 pre-fill, no `previous`. */
function buildNew(env: Env, ex: LibraryExercise, isMain: boolean, sets: number): WorkoutItem {
  const { ctx, workout } = env;
  const goal = goalOf(ctx.profile);
  const pc = prefillCtxOf(ctx.history, ctx.library, ctx.now, ctx.tz, goal);
  const [repsMin, repsMax] = repRange(ex, isMain, goal);
  const prefill = prefillFrom(ex, { repsMin, repsMax }, pc.hard, pc.lib, pc.today, ctx.tz, null);
  const agg = aggregateWindow(ctx.history, ctx.library, ctx.now, ctx.tz);
  const daysSince = {} as Record<Area, number | null>;
  for (const a of AREAS) {
    const last = agg.lastTrainedDate[a];
    daysSince[a] = last === null ? null : dayDiff(last, agg.windowEnd);
  }
  return buildItem(
    {
      exercise: ex,
      isMain,
      sets,
      prefill,
      backoff: false,
      swap: undefined,
      lowTrimmed: env.low && !isMain,
      plannedS: plannedDurationFrom(ex, normalizeHistory(ctx.history), pc.lib, pc.today, ctx.tz),
      goal,
    },
    { deficits: workout.plan.startDeficits, daysSince },
  );
}

/** The rule 7.2 candidates for `area` whose home area is `area`, ignoring the 8-item cap. */
function candidatesOf(env: Env, area: Area, forMain: boolean): LibraryExercise[] {
  const { s } = env;
  const ids = new Set(s.picked.map((p) => p.exercise.id));
  const st: State =
    s.picked.length >= MAX_ITEMS ? { ...s, picked: s.picked.slice(0, MAX_ITEMS - 1) } : s;
  const list = forMain ? mainCandidates(st, area) : candidates(st, area);
  return list.filter((e) => !ids.has(e.id) && primaryAreas(e)[0] === area);
}

type Plan =
  | { kind: "ok"; ex: LibraryExercise; isMain: boolean; item: WorkoutItem }
  | { kind: "unavailable"; reason: "recovering" | "avoided" | "excluded_out" | "no_exercise" }
  | { kind: "items_cap" }
  | { kind: "time" };

/**
 * What adding a new area item to the plan would do. `wantMain`: rule 7.2 step 1 (an empty plan
 * with `autoMainLift` not `false`). The order is: unavailable, `items_cap`, `time` (the cap beats
 * time as in rule 12.3).
 */
function planNew(env: Env, area: Area, wantMain: boolean, tries: readonly number[]): Plan {
  const { s, ctx } = env;
  if (s.start.recovering.has(area)) return { kind: "unavailable", reason: "recovering" };
  if (s.start.avoided.has(area)) return { kind: "unavailable", reason: "avoided" };
  if (excludedOutAreas(ctx.profile, ctx.library, ctx.excludeIds ?? []).includes(area)) {
    return { kind: "unavailable", reason: "excluded_out" };
  }
  let isMain = false;
  let list: LibraryExercise[] = wantMain ? candidatesOf(env, area, true) : [];
  if (list.length > 0) isMain = true;
  else list = candidatesOf(env, area, false);
  const top = list[0];
  if (top === undefined) return { kind: "unavailable", reason: "no_exercise" };
  if (s.picked.length >= MAX_ITEMS) return { kind: "items_cap" };
  // Low energy trims an accessory to 2 sets (rule 7.4); the main lift keeps 3 then 2.
  const order = env.low && !isMain ? SECOND_TRIES : tries;
  for (const sets of order) {
    const item = buildNew(env, top, isMain, sets);
    if (item.costS <= env.leftS) return { kind: "ok", ex: top, isMain, item };
  }
  return { kind: "time" };
}

/**
 * Rule 12.5 (UF-08.2, D-0275 §3): one set more or less for `area`. `delta` is +1 or −1; the area
 * must have an item in the plan (its home area, rule 12.4).
 *
 * **+1:** the first item of the area, in item order, below its cap (the main lift 4, any other
 * item 3) gets one set and its `costS` rises by one set cost (rule 7.1, one-side exercises
 * included, D-0268). Otherwise, with fewer than 2 items in the area and fewer than 8 in the
 * plan, the area's top rule 7.2 candidate not in the plan (first primary area = `area`, the
 * `favoriteIds`, `excludeIds` and `avoidAreas` filters of `suggest`) is added at 2 sets, not
 * main. Otherwise `{refused: "area_full"}`. If the extra cost exceeds the time left
 * (`available − Σ costS`, negative when over budget) → `{refused: "time"}`. Check order:
 * structural `RangeError`, `area_full`, `time`.
 *
 * **−1:** the area's last item loses one set when it has more than 2; else, with two items in
 * the area, that last item is removed; else (one item at 2 sets) the area is removed as
 * `removeArea`. The freed time stays unused; nothing is refilled.
 *
 * Other fields as `removeItem` and `insertItem`. Never mutates its inputs.
 */
export function adjustAreaSets(
  workout: Workout,
  area: Area,
  delta: 1 | -1,
  ctx: AreaEditContext,
): Workout | AreaRefused<AdjustRefusal> {
  assertArea(area);
  if (delta !== 1 && delta !== -1) {
    throw new RangeError(`delta must be 1 or -1, got ${String(delta)}`);
  }
  const idx = homed(workout, area);
  if (idx.length === 0) throw new RangeError(`${area} is not an area of the plan`);
  const lib = libOf(workout, ctx);
  const items = workout.plan.items;
  const leftS =
    availableS(workout.budgetMin, workout.warmupInBudget) -
    items.reduce((sum, i) => sum + i.costS, 0);

  if (delta === -1) {
    const lastIdx = idx[idx.length - 1] as number;
    const last = items[lastIdx] as WorkoutItem;
    if (last.sets > MIN_SETS) {
      const ex = lib.get(last.exerciseId) as LibraryExercise;
      const next = items.map(copyItem);
      const cut = next[lastIdx] as WorkoutItem;
      cut.sets -= 1;
      cut.costS -= setCostS(ex, last.durationS);
      return withItems(workout, next, workout.plan.mainLiftId);
    }
    if (idx.length >= MAX_ITEMS_PER_AREA) return removeItem(workout, last.exerciseId);
    return removeArea(workout, area);
  }

  // +1: the first item with room.
  for (const k of idx) {
    const item = items[k] as WorkoutItem;
    if (item.sets >= (item.isMain ? CAP_MAIN : CAP_OTHER)) continue;
    const ex = lib.get(item.exerciseId) as LibraryExercise;
    const extra = setCostS(ex, item.durationS);
    if (extra > leftS) return { refused: "time" };
    const next = items.map(copyItem);
    const grown = next[k] as WorkoutItem;
    grown.sets += 1;
    grown.costS += extra;
    return withItems(workout, next, workout.plan.mainLiftId);
  }
  // No room: a second item, at 2 sets.
  if (idx.length >= MAX_ITEMS_PER_AREA || items.length >= MAX_ITEMS) {
    return { refused: "area_full" };
  }
  const plan = planNew(envOf(workout, ctx, lib), area, false, SECOND_TRIES);
  if (plan.kind === "unavailable" || plan.kind === "items_cap") return { refused: "area_full" };
  if (plan.kind === "time") return { refused: "time" };
  return withItems(workout, [...items.map(copyItem), plan.item], workout.plan.mainLiftId);
}

/**
 * Rule 12.6 (UF-08.2, D-0275 §4): adds `area`, which must not be in the plan, as one item: its
 * top rule 7.2 candidate (first primary area = `area`) at 3 sets, else 2 (only 2 at Low energy
 * for an accessory, as rule 12.3). Into an **empty** plan with `autoMainLift` not `false` the
 * item is rule 7.2 step 1's top compound candidate (D-0269), `isMain` true, and `mainLiftId` is
 * set; into any other plan it is not main. The item goes last. Refusals, in order after the
 * structural `RangeError`s (unknown area, area already in the plan): `area_unavailable`
 * (recovering, avoided, every exercise excluded, or no eligible exercise), `items_cap` (8
 * items), `time` (not even 2 sets fit). Never mutates its inputs.
 */
export function addArea(
  workout: Workout,
  area: Area,
  ctx: AreaEditContext,
): Workout | AreaRefused<AddAreaRefusal> {
  assertArea(area);
  if (homed(workout, area).length > 0) throw new RangeError(`${area} is already in the plan`);
  const env = envOf(workout, ctx);
  const wantMain = workout.plan.items.length === 0 && ctx.autoMainLift !== false;
  const plan = planNew(env, area, wantMain, ADD_TRIES);
  if (plan.kind === "unavailable") return { refused: "area_unavailable" };
  if (plan.kind !== "ok") return { refused: plan.kind };
  return withItems(
    workout,
    [...workout.plan.items.map(copyItem), plan.item],
    plan.isMain ? plan.ex.id : workout.plan.mainLiftId,
  );
}

/**
 * Rule 12.6 (UF-08.2, D-0275 §4): `workout` without every item homed in `area`, as repeated
 * `removeItem` (the main lift becomes null if it was removed, nothing is promoted, the freed time
 * stays unused). `RangeError` for an unknown area or an area with no item in the plan.
 */
export function removeArea(workout: Workout, area: Area): Workout {
  assertArea(area);
  const idx = homed(workout, area);
  if (idx.length === 0) throw new RangeError(`${area} is not an area of the plan`);
  let out = workout;
  for (const k of idx) out = removeItem(out, (workout.plan.items[k] as WorkoutItem).exerciseId);
  return out;
}

/**
 * Rule 12.7 (UF-08.2, D-0275 §5): the areas not in the plan, lowest projected `r` first (the
 * history load plus the plan's own sets over the target; ties by the fixed area order), each
 * `{area, load, target, available}`. `load` is the 14-day history load (rule 3), `target` the
 * target. `available` is `true` when `addArea` would add the area, else `{reason}` in this
 * order: `recovering`, `avoided`, `excluded_out`, `no_exercise`, `items_cap`, `time`.
 * `favoriteIds` rank exercises only, never areas.
 */
export function areaCandidates(workout: Workout, ctx: AreaEditContext): AreaCandidate[] {
  const env = envOf(workout, ctx);
  const inPlan = new Set<Area>();
  for (const item of workout.plan.items) {
    const a = homeAreaOf(item);
    if (a !== null) inPlan.add(a);
  }
  const wantMain = workout.plan.items.length === 0 && ctx.autoMainLift !== false;
  const { start, projected } = env.s;
  return AREAS.map((area, i) => ({ area, i, r: projected[area] / start.targets[area] }))
    .filter((x) => !inPlan.has(x.area))
    .sort((x, y) => x.r - y.r || x.i - y.i)
    .map(({ area }): AreaCandidate => {
      const plan = planNew(env, area, wantMain, ADD_TRIES);
      const reason: AreaUnavailableReason | null =
        plan.kind === "ok" ? null : plan.kind === "unavailable" ? plan.reason : plan.kind;
      return {
        area,
        load: start.loads[area],
        target: start.targets[area],
        available: reason === null ? true : { reason },
      };
    });
}
