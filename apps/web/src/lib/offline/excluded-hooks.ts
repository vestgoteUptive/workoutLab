// T-0536 (D-0199 §6): live reads of the excluded-exercises cache, and the shared online flag.
// The reads are the shared list hooks (T-0567).
import { useEffect, useState } from "react";
import type { CachedExcluded } from "./db.js";
import { useListIds, useListRows } from "./exercise-list-hooks.js";

const table = (db: import("./db.js").OfflineDb) => db.excludedCache;

/** Sorted excluded exercise ids; `[]` until the first read (and offline reads the cache). */
export function useExcludedIds(userId: string | null | undefined): string[] {
  return useExcludedList(userId).ids;
}

/** Like `useExcludedIds`, plus `loaded`: false until the first cache read answers, so a caller
 *  can tell "still reading" from "the list is empty" (T-0538). With no user, `loaded` is true. */
export function useExcludedList(userId: string | null | undefined): {
  ids: string[];
  loaded: boolean;
} {
  return useListIds(table, userId);
}

/** Rows with `createdAt`, newest first, for UF-11.5. */
export function useExcludedRows(userId: string | null | undefined): CachedExcluded[] {
  return useListRows(table, userId);
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
