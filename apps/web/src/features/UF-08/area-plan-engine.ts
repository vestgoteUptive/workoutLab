// UF-08.2 area plan: the one place the web calls the engine's area edits (T-0996, D-0275, D-0287).
// Principle 3: nothing here picks an area, an exercise or a set count. Each function forwards one
// tap to `adjustAreaSets`, `addArea`, `removeArea` or `areaCandidates` and returns what the engine
// returned, so the screen only decides which call a tap makes. No `suggest` call is made here.
import {
  addArea,
  adjustAreaSets,
  areaCandidates,
  areaGroups,
  removeArea,
  setMainLift,
  type Area,
  type AreaCandidate,
  type AreaEditContext,
  type MainLiftRefusal,
  type Workout,
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
export type EditResult = { workout: Workout } | { refused: string };

export interface EditInputs {
  /** The stored exclusions plus this visit's (`excludeIdsFor`). */
  excludeIds: readonly string[];
  /** The stored favorites (`favoriteIdsFor`). */
  favoriteIds: readonly string[];
  /** The areas skipped on UF-08.1 only: an area removed on this visit can be added back. */
  avoidAreas: readonly Area[];
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

/** Puts `area` in with its engine default. */
export function putIn(workout: Workout, area: Area, ctx: AreaEditContext): EditResult {
  try {
    const result = addArea(workout, area, ctx);
    return "refused" in result ? { refused: result.refused } : { workout: result };
  } catch {
    return { refused: "unavailable" };
  }
}

/**
 * "Fill the rest for me": `addArea` of the first available candidate, again and again, until none
 * is left. `skip` holds the areas removed on this visit, which a fill never brings back.
 */
export function fillRest(
  workout: Workout,
  ctx: AreaEditContext,
  skip: readonly Area[],
): { workout: Workout; added: Area[] } {
  let current = workout;
  const added: Area[] = [];
  for (let guard = 0; guard < 16; guard += 1) {
    const next = areaCandidates(current, ctx).find(
      (c) => c.available === true && !skip.includes(c.area),
    );
    if (next === undefined) break;
    const result = putIn(current, next.area, ctx);
    if ("refused" in result) break;
    current = result.workout;
    added.push(next.area);
  }
  return { workout: current, added };
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
