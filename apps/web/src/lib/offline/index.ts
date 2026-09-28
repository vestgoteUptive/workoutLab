// Public surface of the offline queue/sync/engine-feed module (T-0300c). Never imported from
// `/welcome`'s first render (principle 5, D-0045 §13): only signed-in routes reach this.
export { recordSet, editSet, deleteSet, upsertSession, syncStatus } from "./queue.js";
export type { RecordSetInput, SetEdit, SessionInsert } from "./queue.js";
export { flush } from "./flush.js";
export type { FlushOutcome } from "./flush.js";
export { startSync } from "./sync.js";
export type { SyncHandle } from "./sync.js";
export {
  refreshAll,
  refreshHistory,
  refreshLibrary,
  refreshTargets,
  refreshProfile,
  loadLibrary,
  loadTargets,
  loadProfile,
  lastSyncedAt,
  HISTORY_WINDOW_DAYS,
} from "./history.js";
export { loadEngineHistory } from "./engine-feed.js";
export { ensurePersistentStorage } from "./persist.js";
export { offlineDb, resetOfflineDbForTest, DB_NAME } from "./db.js";
export { currentUserId } from "./current-user.js";
