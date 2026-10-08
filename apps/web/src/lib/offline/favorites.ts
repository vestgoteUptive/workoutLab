// T-0567 (D-0202 §6): the favorite-exercises list, on the same helper as the excluded list.
import { supabase } from "../auth/client.js";
import { createExerciseList, type ListQuery, type ListWriteReason } from "./exercise-list.js";

export type FavoriteWriteReason = ListWriteReason;

export class FavoriteWriteError extends Error {
  readonly reason: FavoriteWriteReason;
  constructor(reason: FavoriteWriteReason, cause?: unknown) {
    super(`favorite_write_${reason}`, { cause });
    this.name = "FavoriteWriteError";
    this.reason = reason;
  }
}

const list = createExerciseList({
  // Same column shape as `excluded_exercises` (T-0564), so the query type is shared.
  table: () => supabase.from("favorite_exercises") as unknown as ListQuery,
  cache: (db) => db.favoriteCache,
  opposite: (db) => db.excludedCache,
  makeError: (reason, cause) => new FavoriteWriteError(reason, cause),
});

/** Replaces this user's cached favorites from the server (never throws). */
export const refreshFavorites = list.refresh;
/** Sorted ids of this user's cached favorites. */
export const loadFavoriteIds = list.loadIds;
/** Favorites an exercise (idempotent upsert). Drops it from the excluded cache. */
export const favoriteExercise = list.add;
/** Removes a favorite (delete; a missing row is success). */
export const unfavoriteExercise = list.remove;

/** `sorted(dedupe(stored))`. */
export function favoriteIdsFor(stored: readonly string[]): string[] {
  return [...new Set(stored)].sort();
}
