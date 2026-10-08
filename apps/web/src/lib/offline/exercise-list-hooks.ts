// T-0567: live reads of an exercise-list cache (excluded or favorites), shared by both lists.
import { useEffect, useState } from "react";
import { liveQuery } from "dexie";
import type { Table } from "dexie";
import { offlineDb, type CachedExerciseListRow, type OfflineDb } from "./db.js";

export function useLive<T>(
  userId: string | null | undefined,
  query: (id: string) => Promise<T>,
  initial: T,
): { value: T; loaded: boolean } {
  const [state, setState] = useState<{ value: T; loaded: boolean }>({
    value: initial,
    loaded: !userId,
  });
  useEffect(() => {
    if (!userId) {
      setState({ value: initial, loaded: true });
      return;
    }
    setState((prev) => (prev.loaded ? { value: initial, loaded: false } : prev));
    const sub = liveQuery(() => query(userId)).subscribe({
      next: (value) => setState({ value, loaded: true }),
      error: () => undefined,
    });
    return () => sub.unsubscribe();
    // `query` and `initial` are module-level constants at both call sites.
  }, [userId]);
  // No user: nothing to load, whatever the effect has caught up to.
  return userId ? state : { value: initial, loaded: true };
}

const NO_IDS: string[] = [];
const NO_ROWS: CachedExerciseListRow[] = [];

type TableOf = (db: OfflineDb) => Table<CachedExerciseListRow, string>;

/** `{ids, loaded}` (sorted ids; `loaded` false until the first cache read answers). */
export function useListIds(
  tableOf: TableOf,
  userId: string | null | undefined,
): { ids: string[]; loaded: boolean } {
  const { value, loaded } = useLive(
    userId,
    async (id) =>
      (await tableOf(offlineDb()).where({ userId: id }).toArray()).map((r) => r.exerciseId).sort(),
    NO_IDS,
  );
  return { ids: value, loaded };
}

/** Rows with `createdAt`, newest first. */
export function useListRows(
  tableOf: TableOf,
  userId: string | null | undefined,
): CachedExerciseListRow[] {
  return useLive(
    userId,
    async (id) =>
      (await tableOf(offlineDb()).where({ userId: id }).toArray()).sort(
        (a, b) =>
          b.createdAt.localeCompare(a.createdAt) || a.exerciseId.localeCompare(b.exerciseId),
      ),
    NO_ROWS,
  ).value;
}
