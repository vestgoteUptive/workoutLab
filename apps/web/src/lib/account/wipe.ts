// D-0136 §5 wipe scope (NFR-PRIV-5): only after a 204 from DELETE /account.
//
// One Dexie `rw` transaction over **every** table of `offlineDb()` deletes this user's rows:
// the queue (`sessions`, `sets`, rejected sets included) and every cache. Other users' rows on
// the device stay (D-0045 §6, NFR-OFF-4): the DB holds every user's rows, keyed by `userId`.
// Then every `wl-` key in localStorage and sessionStorage goes. Keys of other apps stay. The
// Workbox precache is kept: it holds no user data.
import type { Table } from "dexie";
import { dbOf, localStorageOf, sessionStorageOf, type AccountDeps } from "./deps.js";

const KEY_PREFIX = "wl-";

async function deleteUserRows(table: Table<unknown, unknown>, userId: string): Promise<void> {
  const { primKey, indexes } = table.schema;
  if (primKey.keyPath === "userId") {
    await table.delete(userId);
  } else if (indexes.some((i) => i.name === "userId")) {
    await table.where("userId").equals(userId).delete();
  } else {
    // No table has this shape today; a future one without a `userId` index is still wiped.
    await table.filter((row) => (row as { userId?: unknown }).userId === userId).delete();
  }
}

function removePrefixedKeys(storage: Storage | undefined): void {
  if (!storage) return;
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key !== null && key.startsWith(KEY_PREFIX)) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
}

/** Deletes this user's local data. Rejects if any part failed; the storage keys are still
 *  attempted when the Dexie transaction fails, so as little as possible stays behind. */
export async function wipeLocalUserData(userId: string, deps: AccountDeps = {}): Promise<void> {
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
  if (failure !== null) throw failure;
}
