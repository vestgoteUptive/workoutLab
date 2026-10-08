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
  PlanCheckin,
} from "@workoutlab/shared";

/** A queued `sessions` row (D-0045 §6: one entry per `id`). */
export interface QueuedSession {
  id: string;
  userId: string;
  row: SupabaseDatabase["public"]["Tables"]["sessions"]["Insert"];
  /** Set once, the first time this session is queued with a non-null `ended_at` (D-0053 §7,
   *  D-0053 consequence): a later edit to the same session must never re-send `ended_at: null`.
   *
   *  This marker has to OUTLIVE the queue entry, which is why a successful flush sets
   *  `pending: false` and keeps the row instead of deleting it. Deleting it would destroy the
   *  only record that the session was ever finished, so a later
   *  `upsertSession({id, ended_at: null})` would re-queue with `finished: false` and clear the
   *  finish server-side — silent data loss (D-0053 §7). */
  finished: boolean;
  /** `true` while this row still has to be sent. A successful flush sets it to `false` and keeps
   *  the row (for `finished`); only `pending: true` rows are ever sent. */
  pending: boolean;
  /** D-0151 §1: set (only ever to `true`) by a `refreshSessions` that replaced the session cache
   *  from a request issued after this entry became `pending: false`, and while the entry stayed
   *  structurally the same (`row`, `finished`). A marked entry defers to the cached row in
   *  `loadSessions` (D-0151 §4). Every new queue write (`upsertSession`) and the flush's
   *  `pending: false` write leave it absent (§3). Optional and non-indexed, so no Dexie version
   *  bump: an entry written by an older build has no field and reads as unmarked. */
  cacheCurrent?: true;
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

/** The UF-04 how-to text of one exercise, plus its variant ids (D-0067 §3, NFR-OFF-1).
 *
 *  These fields are the ones `LibraryExercise` deliberately drops, so `libraryCache` (engine
 *  shaped) and this table together cover the whole `exercises` row without a second request:
 *  `refreshLibrary` writes both from the one `select("*")` it already runs. */
export interface ExerciseDetail {
  id: string;
  instructions: string[];
  mistakes: string[];
  cue: string | null;
  source: string;
  license: string;
  attribution: string | null;
  sourceUrl: string | null;
  /** The `variant_id`s paired with this exercise, sorted by id (UF-04.3, UF-05). */
  variants: string[];
}

export interface CachedExerciseDetail {
  key: string;
  userId: string;
  detail: ExerciseDetail;
}

/** One cached `sessions` row from the last `refreshSessions()` (56 local days, the history
 *  window of D-0034 §3). UF-06 and UF-11 read `{id, startedAt}`; UF-03.3 reads the rest. */
export interface CachedSession {
  key: string;
  userId: string;
  id: string;
  startedAt: string;
  endedAt: string | null;
  timeBudgetMin: number;
  effortRating: number | null;
  energy: string;
}

export interface CachedCheckin {
  key: string;
  userId: string;
  checkin: PlanCheckin;
}

/** One routine item, trimmed to what UF-07.1 and UF-11.2 read offline (D-0067 §3). */
export interface CachedRoutineItem {
  position: number;
  exerciseId: string;
}

export interface CachedRoutine {
  key: string;
  userId: string;
  id: string;
  name: string;
  updatedAt: string;
  items: CachedRoutineItem[];
}

/** Per-user sync bookkeeping: last successful `refreshHistory()`, and whether
 *  `navigator.storage.persist()` has already been requested (AC-C18, survives a reload). */
export interface SyncMeta {
  userId: string;
  lastSyncedAt: string | null;
  persistRequested: boolean;
}

/** One cached `excluded_exercises` row (T-0536, D-0199 §5). `key` is `userScopedKey(userId, exerciseId)`. */
export interface CachedExerciseListRow {
  key: string;
  userId: string;
  exerciseId: string;
  createdAt: string;
}
export type CachedExcluded = CachedExerciseListRow;
/** One cached `favorite_exercises` row (T-0567, D-0202 §6). Same shape as `CachedExcluded`. */
export type CachedFavorite = CachedExerciseListRow;

export const DB_NAME = "wl-offline";

export class OfflineDb extends Dexie {
  sessions!: Table<QueuedSession, string>;
  sets!: Table<QueuedSet, string>;
  historyCache!: Table<CachedHistorySet, string>;
  libraryCache!: Table<CachedLibraryExercise, string>;
  targetCache!: Table<CachedAreaTarget, string>;
  profileCache!: Table<CachedProfile, string>;
  syncMeta!: Table<SyncMeta, string>;
  // Version 2 (T-0319, D-0067 §3, §5): the four read-only feature caches. One bump adds all of
  // them, so no feature ticket has to touch IndexedDB afterwards.
  exerciseDetails!: Table<CachedExerciseDetail, string>;
  sessionCache!: Table<CachedSession, string>;
  checkinCache!: Table<CachedCheckin, string>;
  routineCache!: Table<CachedRoutine, string>;
  // Version 3 (T-0536, D-0199 §5): the excluded-exercises cache.
  excludedCache!: Table<CachedExcluded, string>;
  // Version 4 (T-0567, D-0202 §6): the favorite-exercises cache.
  favoriteCache!: Table<CachedFavorite, string>;

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
    // Version 2 adds four tables and changes nothing about v1. Dexie carries every existing
    // store and row across unchanged when a version only *adds* stores, so there is no
    // `.upgrade()` here on purpose: an upgrade callback is the only thing that could rewrite a
    // queued row, and NFR-OFF-2 says none may be lost. The new tables start empty and are
    // filled by the next `refreshAll()`.
    this.version(2).stores({
      exerciseDetails: "key, userId",
      sessionCache: "key, userId, startedAt",
      checkinCache: "key, userId",
      routineCache: "key, userId, name",
    });
    // Version 3 only adds a store: no `.upgrade()`, so no queued row can change (NFR-OFF-2).
    this.version(3).stores({
      excludedCache: "key, userId",
    });
    // Version 4 only adds a store: no `.upgrade()`, so no queued row can change (NFR-OFF-2).
    this.version(4).stores({
      favoriteCache: "key, userId",
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

/** The one place the user-scoped IndexedDB key format lives (T-0370): `userId:id`. Every
 *  per-user cache row and queued set is keyed through this, so a test seed and production can't
 *  drift apart. The format is on disk; changing it means a Dexie version bump and a migration. */
export function userScopedKey(userId: string, id: string): string {
  return `${userId}:${id}`;
}

export function setKey(userId: string, clientId: string): string {
  return userScopedKey(userId, clientId);
}
