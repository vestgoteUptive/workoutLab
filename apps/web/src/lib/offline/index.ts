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
  refreshSessions,
  refreshCheckins,
  refreshRoutines,
  loadLibrary,
  loadTargets,
  loadProfile,
  lastSyncedAt,
  HISTORY_WINDOW_DAYS,
} from "./history.js";
// The v2 feature caches (T-0319, D-0067 §3): read-only. Writes to plans, check-ins and routines
// are online-only supabase-js calls in the features (D-0070 §2-§3), so nothing here writes them.
export {
  loadExerciseDetail,
  loadVariants,
  loadSessions,
  loadCheckins,
  loadRoutines,
} from "./feature-loaders.js";
export type { OfflineSession, OfflineRoutine } from "./feature-loaders.js";
export type { ExerciseDetail } from "./db.js";
export { loadEngineHistory } from "./engine-feed.js";
export { ensurePersistentStorage } from "./persist.js";
export { offlineDb, resetOfflineDbForTest, DB_NAME } from "./db.js";
export { currentUserId } from "./current-user.js";
// T-0536 (D-0199): the excluded-exercises cache, its two online-only writes and the union helper.
export {
  refreshExcluded,
  excludeExercise,
  includeExercise,
  excludeIdsFor,
  loadExcludedIds,
  ExcludedWriteError,
} from "./excluded.js";
export type { ExcludedWriteReason } from "./excluded.js";
export { useExcludedIds, useExcludedRows, useOnline } from "./excluded-hooks.js";
