// T-0567 (D-0202 §6, generalising T-0536/D-0199 §5-§6): the device copy of a per-user exercise
// list table (`excluded_exercises`, `favorite_exercises`), its refresh and its two writes. One
// implementation, parameterised per list. Writes are online-only: the cache changes only after
// the server confirms.
import type { Table } from "dexie";
import { supabase } from "../auth/client.js";
import { offlineDb, userScopedKey, type CachedExerciseListRow, type OfflineDb } from "./db.js";
import { currentUserId } from "./current-user.js";
import { cacheGeneration, cacheWriteAllowed } from "./cache-generation.js";

export type ListQuery = ReturnType<typeof supabase.from>;

export type ListWriteReason = "offline" | "warmup" | "server";

// A refresh that started before a confirmed write holds data older than that write; it must not
// replace the cache. Each confirmed write (and each drop from the other list) bumps the counter of
// the list it changed, per user; a refresh compares it on commit. Shared by both lists.
const writeSeq = new Map<string, number>();
const seqKey = (list: string, userId: string): string => [list, userId].join("/");
const seqOf = (list: string, userId: string): number => writeSeq.get(seqKey(list, userId)) ?? 0;
const bumpSeq = (list: string, userId: string): void =>
  void writeSeq.set(seqKey(list, userId), seqOf(list, userId) + 1);

export interface ExerciseListConfig {
  /** This list's name, and the other list's, for the write counters. */
  name: string;
  oppositeName: string;
  /** The Postgres table (same column shape: `exercise_id`, `created_at`). Each list
   *  passes a literal table name at its own call site, so the RLS-coverage scan (T-0402c) sees it. */
  table: () => ListQuery;
  cache: (db: OfflineDb) => Table<CachedExerciseListRow, string>;
  /** The opposite list: a confirmed add drops the id there (mirrors the server triggers). */
  opposite: (db: OfflineDb) => Table<CachedExerciseListRow, string>;
  makeError: (reason: ListWriteReason, cause?: unknown) => Error;
}

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export interface ExerciseList {
  refresh(): Promise<void>;
  loadIds(userId: string): Promise<string[]>;
  add(userId: string, exerciseId: string): Promise<void>;
  remove(userId: string, exerciseId: string): Promise<void>;
}

export function createExerciseList(config: ExerciseListConfig): ExerciseList {
  /** Replaces this user's cached rows from the server. An authenticated empty read empties the
   *  cache. Any error (PGRST205, HTTP 404, network, RLS) means "unknown": the cache stays.
   *  Never throws, so a missing table cannot break the other refreshes in `refreshAll`. */
  async function refresh(): Promise<void> {
    const userId = currentUserId();
    if (!userId || isOffline()) return;
    const gen = cacheGeneration();
    const seq = seqOf(config.name, userId);
    const db = offlineDb();
    const table = config.cache(db);

    let rows: Array<{ exercise_id: string; created_at: string }>;
    try {
      const { data, error } = await config.table().select("exercise_id, created_at");
      if (error || !Array.isArray(data)) return;
      rows = data as typeof rows;
    } catch {
      return;
    }

    const cached: CachedExerciseListRow[] = rows.map((r) => ({
      key: userScopedKey(userId, r.exercise_id),
      userId,
      exerciseId: r.exercise_id,
      createdAt: r.created_at,
    }));
    await db.transaction("rw", table, async () => {
      if (!cacheWriteAllowed(gen) || seqOf(config.name, userId) !== seq) return;
      await table.where({ userId }).delete();
      await table.bulkPut(cached);
    });
  }

  /** Sorted ids of this user's cached rows. */
  async function loadIds(userId: string): Promise<string[]> {
    const rows = await config.cache(offlineDb()).where({ userId }).toArray();
    return rows.map((r) => r.exerciseId).sort();
  }

  /** Idempotent upsert; zero rows back is success. */
  async function add(userId: string, exerciseId: string): Promise<void> {
    if (isOffline()) throw config.makeError("offline");
    const db = offlineDb();
    const lib = await db.libraryCache.get(userScopedKey(userId, exerciseId));
    if (lib?.exercise.kind === "warmup") throw config.makeError("warmup");
    const gen = cacheGeneration();
    let createdAt = new Date().toISOString();
    try {
      const { data, error } = await config
        .table()
        .upsert(
          { exercise_id: exerciseId },
          { onConflict: "user_id,exercise_id", ignoreDuplicates: true },
        )
        .select("exercise_id, created_at");
      if (error) throw error;
      const first = Array.isArray(data)
        ? (data[0] as { created_at?: string } | undefined)
        : undefined;
      if (first?.created_at) createdAt = first.created_at;
    } catch (error) {
      throw config.makeError("server", error);
    }
    bumpSeq(config.name, userId);
    if (!cacheWriteAllowed(gen)) return;
    const key = userScopedKey(userId, exerciseId);
    const table = config.cache(db);
    const opposite = config.opposite(db);
    await db.transaction("rw", table, opposite, async () => {
      if (!cacheWriteAllowed(gen)) return;
      // A duplicate keeps the row (and its createdAt) the device already has.
      if (!(await table.get(key))) {
        await table.put({ key, userId, exerciseId, createdAt });
      }
      // The server trigger removed the opposite row; mirror it after the confirm only.
      await opposite.delete(key);
      bumpSeq(config.oppositeName, userId);
    });
  }

  /** Delete; a missing row is success. */
  async function remove(userId: string, exerciseId: string): Promise<void> {
    if (isOffline()) throw config.makeError("offline");
    const gen = cacheGeneration();
    try {
      const { error } = await config.table().delete().eq("exercise_id", exerciseId);
      if (error) throw error;
    } catch (error) {
      throw config.makeError("server", error);
    }
    bumpSeq(config.name, userId);
    if (!cacheWriteAllowed(gen)) return;
    await config.cache(offlineDb()).delete(userScopedKey(userId, exerciseId));
  }

  return { refresh, loadIds, add, remove };
}
