// UF-08.2 area plan: the one place the web calls the engine's area edits (T-0996, D-0275, D-0287).
// Principle 3: nothing here picks an area, an exercise or a set count. Each function forwards one
// tap to `adjustAreaSets`, `addArea`, `removeArea` or `areaCandidates` and returns what the engine
// returned, so the screen only decides which call a tap makes. No `suggest` call is made here.
import {
  addArea,
  adjustAreaSets,
  areaCandidates,
  areaGroups,
  homeAreaOf,
  removeArea,
  setMainLift,
  type Area,
  type AreaCandidate,
  type AreaEditContext,
  type MainLiftRefusal,
  type Workout,
  type WorkoutItem,
} from "@workoutlab/engine";
import type { SetupData } from "./use-setup-data.js";

/** Why a **+** would be refused now (the engine's order: area full, then time). */
export type StepRefusal = "area_full" | "time";

export interface PlanOverview {
  /** The areas not in the plan, in the engine's order, each with its availability. */
  candidates: readonly AreaCandidate[];
  /** For each area in the plan whose **+** the engine would refuse, the reason. */
  stepRefusals: Readonly<Partial<Record<Area, StepRefusal>>>;
}

/** What one edit tap came to: the engine's new plan, or the reason nothing changed. */
export type EditResult = { workout: Workout; restored?: boolean } | { refused: string };

export interface EditInputs {
  /** The stored exclusions plus this visit's (`excludeIdsFor`). */
  excludeIds: readonly string[];
  /** The stored favorites (`favoriteIdsFor`). */
  favoriteIds: readonly string[];
  /** The areas skipped on UF-08.1 only: an area removed on this visit can be added back. */
  avoidAreas: readonly Area[];
  /** T-1023 (D-0290): the items removed with whole areas on this visit; `addArea` may put them back. */
  restore?: readonly WorkoutItem[];
  nowIso: string;
  tz: string;
}

/**
 * The `ctx` every area edit takes (D-0287 §3: it carries `targets`). `autoMainLift` is left to the
 * engine's default, so the first area added to an empty plan may get the main lift.
 */
export function editContext(data: SetupData, inputs: EditInputs): AreaEditContext {
  return {
    history: data.history,
    targets: data.targets,
    profile: data.profile,
    library: data.library,
    excludeIds: [...inputs.excludeIds],
    favoriteIds: [...inputs.favoriteIds],
    ...(inputs.avoidAreas.length > 0 ? { avoidAreas: [...inputs.avoidAreas] } : {}),
    ...(inputs.restore !== undefined && inputs.restore.length > 0
      ? { restore: [...inputs.restore] }
      : {}),
    now: inputs.nowIso,
    tz: inputs.tz,
  };
}

/** The addable areas and the **+** refusals of the current plan, from the engine. */
export function overviewOf(workout: Workout, ctx: AreaEditContext): PlanOverview {
  const stepRefusals: Partial<Record<Area, StepRefusal>> = {};
  for (const group of areaGroups(workout)) {
    const result = adjustAreaSets(workout, group.area, 1, ctx);
    if ("refused" in result) stepRefusals[group.area] = result.refused;
  }
  return { candidates: areaCandidates(workout, ctx), stepRefusals };
}

/** One set more (+1) or less (-1) for `area`. */
export function adjustSets(
  workout: Workout,
  area: Area,
  delta: 1 | -1,
  ctx: AreaEditContext,
): EditResult {
  try {
    const result = adjustAreaSets(workout, area, delta, ctx);
    return "refused" in result ? { refused: result.refused } : { workout: result };
  } catch {
    return { refused: "unavailable" };
  }
}

/** Takes `area` out of the plan (the host adds it to this visit's skipped areas). */
export function takeOut(workout: Workout, area: Area): EditResult {
  try {
    return { workout: removeArea(workout, area) };
  } catch {
    return { refused: "unavailable" };
  }
}

/** The items of `area` in `workout`, as `removeArea` is about to take them out (D-0290 §1). */
export function itemsOfArea(workout: Workout, area: Area): WorkoutItem[] {
  return workout.plan.items.filter((i) => homeAreaOf(i) === area);
}

/** `restore` without `also`' items, without items that have no home area, and without the items of any area now in `workout`. */
export function pruneRestore(
  restore: readonly WorkoutItem[],
  workout: Workout,
  also: readonly Area[] = [],
): WorkoutItem[] {
  const inPlan = new Set(areaGroups(workout).map((g) => g.area));
  return restore.filter((i) => {
    const a = homeAreaOf(i);
    return a !== null && !inPlan.has(a) && !also.includes(a);
  });
}

/** The areas `restore` holds items for. */
export function restoreAreas(restore: readonly WorkoutItem[]): Area[] {
  const out: Area[] = [];
  for (const i of restore) {
    const a = homeAreaOf(i);
    if (a !== null && !out.includes(a)) out.push(a);
  }
  return out;
}

/**
 * The removed areas whose Add the engine would put back as they were (not fall back for): the ones
 * "Fill the rest" can add (D-0290 §7). Asks the engine, so it follows its validity rules.
 */
export function restorableOf(workout: Workout, ctx: AreaEditContext): Area[] {
  return restoreAreas(ctx.restore ?? []).filter((a) => {
    const r = putIn(workout, a, ctx);
    return "workout" in r && r.restored === true;
  });
}

/** True when `after` holds every remembered item of `area` that `before` did not (a restore, not a fresh add). */
function wasRestored(before: Workout, after: Workout, area: Area, ctx: AreaEditContext): boolean {
  const mine = (ctx.restore ?? []).filter((i) => homeAreaOf(i) === area);
  if (mine.length === 0) return false;
  const had = new Set(before.plan.items.map((i) => i.exerciseId));
  const has = new Set(after.plan.items.map((i) => i.exerciseId));
  return mine.every((i) => has.has(i.exerciseId) && !had.has(i.exerciseId));
}

/** Puts `area` in: the remembered items if `ctx.restore` has them and they fit, else the engine default. */
export function putIn(workout: Workout, area: Area, ctx: AreaEditContext): EditResult {
  try {
    const result = addArea(workout, area, ctx);
    return "refused" in result
      ? { refused: result.refused }
      : { workout: result, restored: wasRestored(workout, result, area, ctx) };
  } catch {
    return { refused: "unavailable" };
  }
}

/**
 * "Fill the rest for me": `addArea` of the first available candidate, again and again, until none
 * is left. `skip` holds the areas removed on this visit: a fill brings one back only as it was
 * (`ctx.restore`, D-0290 §7), never as a fresh suggestion.
 */
export function fillRest(
  workout: Workout,
  ctx: AreaEditContext,
  skip: readonly Area[],
): { workout: Workout; added: Area[]; restored: Area[] } {
  let current = workout;
  const added: Area[] = [];
  const restored: Area[] = [];
  for (let guard = 0; guard < 16; guard += 1) {
    let progressed = false;
    for (const c of areaCandidates(current, ctx)) {
      if (c.available !== true) continue;
      const result = putIn(current, c.area, ctx);
      if ("refused" in result) {
        if (skip.includes(c.area)) continue;
        return { workout: current, added, restored };
      }
      if (skip.includes(c.area) && result.restored !== true) continue;
      current = result.workout;
      added.push(c.area);
      if (result.restored === true) restored.push(c.area);
      progressed = true;
      break;
    }
    if (!progressed) break;
  }
  return { workout: current, added, restored };
}

/** "Start with this" (UF-08.6, T-1021, D-0288 §2 superseded): the engine's `setMainLift`, no rebuild. */
export function makeMain(
  workout: Workout,
  exerciseId: string,
  ctx: AreaEditContext,
): { workout: Workout } | { refused: MainLiftRefusal } | { failed: true } {
  try {
    const result = setMainLift(workout, exerciseId, ctx);
    return "refused" in result ? { refused: result.refused } : { workout: result };
  } catch {
    // T-0998 (T-1009 review): an engine throw is not a refusal; the host says the change failed.
    return { failed: true };
  }
}
