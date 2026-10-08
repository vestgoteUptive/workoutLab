// D-0136 §5 wipe scope (NFR-PRIV-5): only after a 204 from DELETE /account.
//
// One Dexie `rw` transaction over **every** table of `offlineDb()` deletes this user's rows:
// the queue (`sessions`, `sets`, rejected sets included) and every cache. Other users' rows on
// the device stay (D-0045 §6, NFR-OFF-4): the DB holds every user's rows, keyed by `userId`.
// Then every `wl-` key in localStorage and sessionStorage goes. Keys of other apps stay. The
// Workbox precache is kept: it holds no user data.
import type { Table } from "dexie";
import { deleteUserRows, removePrefixedKeys } from "./local-data.js";
import { invalidateCacheWrites } from "../offline/cache-generation.js";
import { dbOf, localStorageOf, sessionStorageOf, type AccountDeps } from "./deps.js";

/** Deletes this user's local data. Rejects if any part failed; the storage keys are still
 *  attempted when the Dexie transaction fails, so as little as possible stays behind. */
export async function wipeLocalUserData(userId: string, deps: AccountDeps = {}): Promise<void> {
  // T-0531: refreshes in flight must not write back what this wipe removes.
  invalidateCacheWrites();
  const db = dbOf(deps);
  let failure: unknown = null;
  try {
    const tables = db.tables as unknown as Table<unknown, unknown>[];
    await db.transaction("rw", tables, async () => {
      for (const table of tables) await deleteUserRows(table, userId);
    });
  } catch (error) {
    failure = error ?? new Error("wipe_failed");
  }
  try {
    removePrefixedKeys(localStorageOf(deps));
    removePrefixedKeys(sessionStorageOf(deps));
  } catch (error) {
    failure ??= error ?? new Error("wipe_failed");
  }
  invalidateCacheWrites();
  if (failure !== null) throw failure;
}
