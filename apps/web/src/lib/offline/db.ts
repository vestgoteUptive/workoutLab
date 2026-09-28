// The Dexie database (D-0001, D-0045 §13/TR-0022: Dexie, not `idb`). One IndexedDB database,
// `wl-offline`, holding every user's queued rows (never cleared on sign-out, D-0045 §6). Rows
// are isolated per user in application code (`userId` column + query filters), not per-database,
// so switching users on one device never mixes queues (AC-C12).
//
// This module is never imported from the first render of `/welcome` (principle 5, D-0045 §13):
// only `lib/offline/*` modules import it, and those are only reached from signed-in routes.
import Dexie, { type Table } from "dexie";
import type {
  AreaTarget,
  Database as SupabaseDatabase,
  EngineProfile,
  LibraryExercise,
} from "@workoutlab/shared";

/** A queued `sessions` row (D-0045 §6: one entry per `id`). */
export interface QueuedSession {
  id: string;
  userId: string;
  row: SupabaseDatabase["public"]["Tables"]["sessions"]["Insert"];
  /** Set once, the first time this session is queued with a non-null `ended_at` (D-0053 §7,
   *  D-0053 consequence): a later edit to the same session must never re-send `ended_at: null`. */
  finished: boolean;
}

export type QueuedSetStatus = "queued" | "rejected";

/** A queued `session_sets` row (D-0015 §identity, D-0045 §6: one entry per `(userId, clientId)`). */
export interface QueuedSet {
  /** Dexie primary key: `${userId}:${clientId}`, so the (userId, client_id) uniqueness is a
   *  natural key and `.put()` naturally replaces the previous entry for the same set (AC-C2). */
  key: string;
  userId: string;
  clientId: string;
  sessionId: string;
  exerciseId: string;
  setIndex: number;
  kind: "reps" | "timed";
  reps: number | null;
  weightKg: number | null;
  durationS: number | null;
  rir: number | null;
  isWarmup: boolean;
  backoff: boolean;
  completedAt: string;
  editedAt: string;
  deletedAt: string | null;
  status: QueuedSetStatus;
}

/** One cached `session_sets_live` row from the last `refreshHistory()` (56 local days, AC-C13). */
export interface CachedHistorySet {
  key: string;
  userId: string;
  clientId: string;
  sessionId: string;
  exerciseId: string;
  isWarmup: boolean;
  completedAt: string;
  editedAt: string;
  deletedAt: string | null;
  reps: number | null;
  weightKg: number | null;
  durationS: number | null;
}

export interface CachedLibraryExercise {
  key: string;
  userId: string;
  exercise: LibraryExercise;
}

export interface CachedAreaTarget {
  key: string;
  userId: string;
  target: AreaTarget;
}

export interface CachedProfile {
  userId: string;
  profile: EngineProfile;
}

/** Per-user sync bookkeeping: last successful `refreshHistory()`, and whether
 *  `navigator.storage.persist()` has already been requested (AC-C18, survives a reload). */
export interface SyncMeta {
  userId: string;
  lastSyncedAt: string | null;
  persistRequested: boolean;
}

export const DB_NAME = "wl-offline";

export class OfflineDb extends Dexie {
  sessions!: Table<QueuedSession, string>;
  sets!: Table<QueuedSet, string>;
  historyCache!: Table<CachedHistorySet, string>;
  libraryCache!: Table<CachedLibraryExercise, string>;
  targetCache!: Table<CachedAreaTarget, string>;
  profileCache!: Table<CachedProfile, string>;
  syncMeta!: Table<SyncMeta, string>;

  constructor(name: string = DB_NAME) {
    super(name);
    this.version(1).stores({
      sessions: "id, userId",
      sets: "key, userId, sessionId, editedAt, status, [userId+status]",
      historyCache: "key, userId, completedAt",
      libraryCache: "key, userId",
      targetCache: "key, userId",
      profileCache: "userId",
      syncMeta: "userId",
    });
  }
}

let db: OfflineDb | undefined;

/** The shared Dexie instance, opened lazily on first use (never at `/welcome`'s first render). */
export function offlineDb(): OfflineDb {
  if (!db) db = new OfflineDb();
  return db;
}

/** Test-only: swap in a fresh instance (e.g. after `fake-indexeddb`'s store is cleared). */
export function resetOfflineDbForTest(name: string = DB_NAME): OfflineDb {
  db = new OfflineDb(name);
  return db;
}

export function setKey(userId: string, clientId: string): string {
  return `${userId}:${clientId}`;
}
