// T-0536 (D-0199 §5-§6, D-0197 §2): the device copy of `excluded_exercises`, its refresh and its
// two writes. Writes are online-only: the cache changes only after the server confirms.
import { supabase } from "../auth/client.js";
import { offlineDb, userScopedKey, type CachedExcluded } from "./db.js";
import { currentUserId } from "./current-user.js";
import { cacheGeneration, cacheWriteAllowed } from "./cache-generation.js";

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** Replaces this user's cached exclusions from the server. An authenticated empty read empties
 *  the cache. Any error (PGRST205, HTTP 404, network, RLS) means "unknown": the cache stays.
 *  Never throws, so a missing table cannot break the other refreshes in `refreshAll`. */
export async function refreshExcluded(): Promise<void> {
  const userId = currentUserId();
  if (!userId || isOffline()) return;
  const gen = cacheGeneration();
  const db = offlineDb();

  let rows: Array<{ exercise_id: string; created_at: string }>;
  try {
    const { data, error } = await supabase
      .from("excluded_exercises")
      .select("exercise_id, created_at");
    if (error || !Array.isArray(data)) return;
    rows = data as typeof rows;
  } catch {
    return;
  }

  const cached: CachedExcluded[] = rows.map((r) => ({
    key: userScopedKey(userId, r.exercise_id),
    userId,
    exerciseId: r.exercise_id,
    createdAt: r.created_at,
  }));
  await db.transaction("rw", db.excludedCache, async () => {
    if (!cacheWriteAllowed(gen)) return;
    await db.excludedCache.where({ userId }).delete();
    await db.excludedCache.bulkPut(cached);
  });
}

export type ExcludedWriteReason = "offline" | "warmup" | "server";

export class ExcludedWriteError extends Error {
  readonly reason: ExcludedWriteReason;
  constructor(reason: ExcludedWriteReason, cause?: unknown) {
    super(`excluded_write_${reason}`, { cause });
    this.name = "ExcludedWriteError";
    this.reason = reason;
  }
}

/** Sorted ids of this user's cached exclusions. */
export async function loadExcludedIds(userId: string): Promise<string[]> {
  const rows = await offlineDb().excludedCache.where({ userId }).toArray();
  return rows.map((r) => r.exerciseId).sort();
}

/** Excludes an exercise (idempotent upsert; zero rows back is success). */
export async function excludeExercise(userId: string, exerciseId: string): Promise<void> {
  if (isOffline()) throw new ExcludedWriteError("offline");
  const db = offlineDb();
  const lib = await db.libraryCache.get(userScopedKey(userId, exerciseId));
  if (lib?.exercise.kind === "warmup") throw new ExcludedWriteError("warmup");
  const gen = cacheGeneration();
  let createdAt = new Date().toISOString();
  try {
    const { data, error } = await supabase
      .from("excluded_exercises")
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
    throw new ExcludedWriteError("server", error);
  }
  if (!cacheWriteAllowed(gen)) return;
  const key = userScopedKey(userId, exerciseId);
  await db.transaction("rw", db.excludedCache, async () => {
    if (!cacheWriteAllowed(gen)) return;
    // A duplicate keeps the row (and its createdAt) the device already has.
    if (!(await db.excludedCache.get(key))) {
      await db.excludedCache.put({ key, userId, exerciseId, createdAt });
    }
  });
}

/** Includes an exercise again (delete; a missing row is success). */
export async function includeExercise(userId: string, exerciseId: string): Promise<void> {
  if (isOffline()) throw new ExcludedWriteError("offline");
  const gen = cacheGeneration();
  try {
    const { error } = await supabase
      .from("excluded_exercises")
      .delete()
      .eq("exercise_id", exerciseId);
    if (error) throw error;
  } catch (error) {
    throw new ExcludedWriteError("server", error);
  }
  if (!cacheWriteAllowed(gen)) return;
  await offlineDb().excludedCache.delete(userScopedKey(userId, exerciseId));
}

/** `sorted(dedupe(stored ∪ visit))`: the engine's `excludeIds` (D-0199 §6). */
export function excludeIdsFor(stored: readonly string[], visit: readonly string[]): string[] {
  return [...new Set([...stored, ...visit])].sort();
}
