// Rule 0 eligibility and the rule 7.1 time model (D-0034 §7, D-0040 §1, §3, §7). Shared by
// session building (rule 7) and swap ranking (rules 12–13).
import type { EngineProfile, Level, LibraryExercise } from "./types.js";
import { WARMUP_COST_S } from "./warmup.js";

/** Rule 7.1 time model. */
export const WORK_S = 45;
export const REST_COMPOUND_S = 120;
export const REST_ISOLATION_S = 60;
export const TRANSITION_S = 60;
const LEVEL_RANK: Record<Level, number> = { beginner: 0, intermediate: 1, advanced: 2 };

/** "none" means no equipment on both sides (D-0040 §1). Other spellings are not aliased. */
export function realEquipment(list: readonly string[]): string[] {
  return list.filter((e) => e !== "none");
}

/**
 * Rule 0 eligible exercise: kind `exercise`, every equipment item in `profile.equipment`
 * (no equipment is always eligible), level ≤ profile level, and not in `excludeIds`.
 */
export function isEligible(
  exercise: LibraryExercise,
  profile: Pick<EngineProfile, "level" | "equipment">,
  excludeIds: readonly string[] = [],
): boolean {
  if (exercise.kind !== "exercise") return false;
  if (excludeIds.includes(exercise.id)) return false;
  if (LEVEL_RANK[exercise.level] > LEVEL_RANK[profile.level]) return false;
  const have = new Set(realEquipment(profile.equipment));
  return realEquipment(exercise.equipment).every((e) => have.has(e));
}

/**
 * Work + rest for one set (rule 7.1). `durationS` is a timed set's planned duration (D-0092 §1,
 * `plannedDurationS`); without it (or when it is null) a timed set works its library
 * `defaultDurationS`, so the 1-argument result is unchanged (D-0092 §4). A non-timed set
 * always works 45 s, and a timed exercise with no duration at all falls back to 45 s.
 */
export function setCostS(exercise: LibraryExercise, durationS?: number | null): number {
  const work = exercise.timed ? (durationS ?? exercise.defaultDurationS ?? WORK_S) : WORK_S;
  const rest = exercise.type === "compound" ? REST_COMPOUND_S : REST_ISOLATION_S;
  return work + rest;
}

/**
 * `sets × (work + rest) + 60 s transition` (rule 7.1). `durationS` as for `setCostS`; the
 * 2-argument result is unchanged (D-0092 §4).
 */
export function itemCostS(
  exercise: LibraryExercise,
  sets: number,
  durationS?: number | null,
): number {
  return sets * setCostS(exercise, durationS) + TRANSITION_S;
}

/** `budgetMin × 60 − (warmupInBudget ? 180 : 0)`; may be negative (D-0040 §7). */
export function availableS(budgetMin: number, warmupInBudget: boolean): number {
  return budgetMin * 60 - (warmupInBudget ? WARMUP_COST_S : 0);
}

/**
 * Rule 7.4 / 12.1 (D-0093 §2, D-0105 §2): whether `exercise` in a slot gets a back-off set.
 * True exactly when the slot has one (`slotHasBackoff`) and `exercise` is not timed (a timed
 * exercise never gets one, D-0047). The one predicate behind `buildItem` (so `suggest` and
 * `applySwap`) and rule 12's `fitsBudget`, so the two cannot drift.
 */
export function getsBackoff(
  slotHasBackoff: boolean,
  exercise: Pick<LibraryExercise, "timed">,
): boolean {
  return slotHasBackoff && !exercise.timed;
}
