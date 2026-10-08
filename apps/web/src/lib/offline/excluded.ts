// T-0536 (D-0199 §5-§6, D-0197 §2): the excluded-exercises list. The logic lives in
// `exercise-list.ts` (T-0567); this file keeps the public names and the error type.
import { supabase } from "../auth/client.js";
import { createExerciseList, type ListWriteReason } from "./exercise-list.js";

export type ExcludedWriteReason = ListWriteReason;

export class ExcludedWriteError extends Error {
  readonly reason: ExcludedWriteReason;
  constructor(reason: ExcludedWriteReason, cause?: unknown) {
    super(`excluded_write_${reason}`, { cause });
    this.name = "ExcludedWriteError";
    this.reason = reason;
  }
}

const list = createExerciseList({
  table: () => supabase.from("excluded_exercises"),
  cache: (db) => db.excludedCache,
  opposite: (db) => db.favoriteCache,
  makeError: (reason, cause) => new ExcludedWriteError(reason, cause),
});

/** Replaces this user's cached exclusions from the server (never throws). */
export const refreshExcluded = list.refresh;
/** Sorted ids of this user's cached exclusions. */
export const loadExcludedIds = list.loadIds;
/** Excludes an exercise (idempotent upsert; zero rows back is success). Drops it from favorites. */
export const excludeExercise = list.add;
/** Includes an exercise again (delete; a missing row is success). */
export const includeExercise = list.remove;

/** `sorted(dedupe(stored ∪ visit))`: the engine's `excludeIds` (D-0199 §6). */
export function excludeIdsFor(stored: readonly string[], visit: readonly string[]): string[] {
  return [...new Set([...stored, ...visit])].sort();
}
