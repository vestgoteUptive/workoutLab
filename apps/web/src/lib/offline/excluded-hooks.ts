// T-0536 (D-0199 §6): live reads of the excluded-exercises cache, and the shared online flag.
import { useEffect, useState } from "react";
import { liveQuery } from "dexie";
import { offlineDb, type CachedExcluded } from "./db.js";

function useLive<T>(
  userId: string | null | undefined,
  query: (id: string) => Promise<T>,
  initial: T,
): T {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    if (!userId) {
      setValue(initial);
      return;
    }
    const sub = liveQuery(() => query(userId)).subscribe({
      next: setValue,
      error: () => undefined,
    });
    return () => sub.unsubscribe();
    // `query` and `initial` are module-level constants at both call sites.
  }, [userId]);
  return value;
}

const NO_IDS: string[] = [];
const NO_ROWS: CachedExcluded[] = [];

/** Sorted excluded exercise ids; `[]` until the first read (and offline reads the cache). */
export function useExcludedIds(userId: string | null | undefined): string[] {
  return useLive(
    userId,
    async (id) =>
      (await offlineDb().excludedCache.where({ userId: id }).toArray())
        .map((r) => r.exerciseId)
        .sort(),
    NO_IDS,
  );
}

/** Rows with `createdAt`, newest first, for UF-11.5. */
export function useExcludedRows(userId: string | null | undefined): CachedExcluded[] {
  return useLive(
    userId,
    async (id) =>
      (await offlineDb().excludedCache.where({ userId: id }).toArray()).sort(
        (a, b) =>
          b.createdAt.localeCompare(a.createdAt) || a.exerciseId.localeCompare(b.exerciseId),
      ),
    NO_ROWS,
  );
}

/** `navigator.onLine`, kept current from the `online`/`offline` events. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine !== false,
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}
