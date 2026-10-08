// T-0567 (D-0202 §6): live reads of the favorites cache (shared helper, see exercise-list-hooks).
import type { CachedFavorite, OfflineDb } from "./db.js";
import { useListIds, useListRows } from "./exercise-list-hooks.js";

const table = (db: OfflineDb) => db.favoriteCache;

/** Sorted favorite exercise ids; `[]` until the first read (offline reads the cache). */
export function useFavoriteIds(userId: string | null | undefined): string[] {
  return useListIds(table, userId).ids;
}

/** Like `useFavoriteIds`, plus `loaded`. */
export function useFavoriteList(userId: string | null | undefined): {
  ids: string[];
  loaded: boolean;
} {
  return useListIds(table, userId);
}

/** Rows with `createdAt`, newest first. */
export function useFavoriteRows(userId: string | null | undefined): CachedFavorite[] {
  return useListRows(table, userId);
}
