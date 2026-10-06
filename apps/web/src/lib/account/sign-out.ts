// D-0195 §3 (GitHub #35): sign out of this device only, then clear this user's caches and every
// `wl-` key. The queue (`sessions`, `sets`) stays whole: D-0045 §6, NFR-OFF-4.
import type { Table } from "dexie";
import { clientOf, dbOf, localStorageOf, sessionStorageOf, type AccountDeps } from "./deps.js";
import { invalidateCacheWrites } from "../offline/cache-generation.js";
import { deleteUserRows, removePrefixedKeys } from "./local-data.js";

const QUEUE_TABLES = new Set(["sessions", "sets"]);

/** Never rejects. `cleared: false` when the cache or storage clearing failed (the session is
 *  already gone by then). */
export async function signOutAndClearDevice(
  { userId }: { userId: string },
  deps: AccountDeps = {},
): Promise<{ cleared: boolean }> {
  // T-0530: a cache refresh already in flight must drop its rows instead of writing them after the
  // clear below. Bumped first, so nothing that settles from here on can write.
  invalidateCacheWrites();
  try {
    // An `{ error }` (offline) is ignored: supabase-js has removed the local session anyway.
    await clientOf(deps).auth.signOut({ scope: "local" });
  } catch {
    // Still clear the device.
  }
  let cleared = true;
  try {
    const db = dbOf(deps);
    const tables = (db.tables as unknown as Table<unknown, unknown>[]).filter(
      (t) => !QUEUE_TABLES.has(t.name),
    );
    await db.transaction("rw", tables, async () => {
      for (const table of tables) await deleteUserRows(table, userId);
    });
  } catch {
    cleared = false;
  }
  try {
    removePrefixedKeys(localStorageOf(deps));
  } catch {
    cleared = false;
  }
  try {
    removePrefixedKeys(sessionStorageOf(deps));
  } catch {
    cleared = false;
  }
  return { cleared };
}

/** True when this user has a queued set or a pending session. Read errors resolve false. */
export async function hasUnsyncedWork(userId: string, deps: AccountDeps = {}): Promise<boolean> {
  try {
    const db = dbOf(deps);
    const queued = await db.sets.where("[userId+status]").equals([userId, "queued"]).count();
    if (queued > 0) return true;
    const pending = await db.sessions
      .where("userId")
      .equals(userId)
      .filter((s) => s.pending === true)
      .count();
    return pending > 0;
  } catch {
    return false;
  }
}
