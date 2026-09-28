// NFR-OFF-5 (AC-C18): ask the browser to persist storage the first time a session finishes, so
// the offline queue survives storage pressure. Requested once per user, tracked in IDB (`syncMeta`)
// so it also holds across a reload, and never throws when `navigator.storage` doesn't exist.
import { offlineDb } from "./db.js";

export async function ensurePersistentStorage(userId: string): Promise<void> {
  const db = offlineDb();
  const meta = await db.syncMeta.get(userId);
  if (meta?.persistRequested) return;

  await db.syncMeta.put({
    userId,
    lastSyncedAt: meta?.lastSyncedAt ?? null,
    persistRequested: true,
  });

  const storage = (navigator as Navigator & { storage?: StorageManager }).storage;
  if (!storage?.persist) return;
  try {
    await storage.persist();
  } catch {
    // Best-effort: a rejected persist() request must never throw into the caller.
  }
}
