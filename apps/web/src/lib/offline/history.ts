// 56-local-day history fetch + library/targets/profile cache (AC-C13, AC-C16, D-0034 §3).
import { windowStartInstant } from "../format/intl.js";
import { supabase } from "../auth/client.js";
import {
  toAreaTarget,
  toEngineProfile,
  toHistorySet,
  toLibraryExercise,
  type AreaTarget,
  type EngineProfile,
  type LibraryExercise,
  type Tables,
} from "@workoutlab/shared";
import { offlineDb, setKey } from "./db.js";
import { currentUserId } from "./current-user.js";

export const HISTORY_WINDOW_DAYS = 56;

/** Fetches `session_sets_live` for the last 56 local days and replaces the cache (AC-C13). */
export async function refreshHistory(now: Date, tz: string): Promise<void> {
  const userId = currentUserId();
  if (!userId) return;
  const db = offlineDb();
  const nowIso = now.toISOString();
  const windowStart = windowStartInstant(nowIso, tz, HISTORY_WINDOW_DAYS);

  const { data, error } = await supabase
    .from("session_sets_live")
    .select(
      "client_id, session_id, exercise_id, is_warmup, completed_at, edited_at, deleted_at, reps, weight_kg, duration_s",
    )
    .gte("completed_at", windowStart);
  if (error) throw error;

  const rows = (data ?? []) as Array<
    Pick<
      Tables<"session_sets">,
      | "client_id"
      | "session_id"
      | "exercise_id"
      | "is_warmup"
      | "completed_at"
      | "edited_at"
      | "deleted_at"
      | "reps"
      | "weight_kg"
      | "duration_s"
    >
  >;
  const cached = rows.map((row) => {
    const mapped = toHistorySet(row);
    return {
      key: setKey(userId, mapped.clientId),
      userId,
      clientId: mapped.clientId,
      sessionId: mapped.sessionId,
      exerciseId: mapped.exerciseId,
      isWarmup: mapped.isWarmup,
      completedAt: mapped.completedAt,
      editedAt: mapped.editedAt,
      deletedAt: mapped.deletedAt,
      reps: mapped.reps,
      weightKg: mapped.weightKg,
      durationS: mapped.durationS,
    };
  });

  await db.transaction("rw", db.historyCache, db.syncMeta, async () => {
    await db.historyCache.where({ userId }).delete();
    await db.historyCache.bulkPut(cached);
    const meta = await db.syncMeta.get(userId);
    await db.syncMeta.put({
      userId,
      lastSyncedAt: nowIso,
      persistRequested: meta?.persistRequested ?? false,
    });
  });
}

/** Refetches the exercise library and replaces the cache (AC-C16). */
export async function refreshLibrary(): Promise<void> {
  const userId = currentUserId();
  if (!userId) return;
  const db = offlineDb();

  const [{ data: exercises, error: exercisesError }, { data: areaRows, error: areaError }] =
    await Promise.all([
      supabase.from("exercises").select("*"),
      supabase.from("exercise_areas").select("exercise_id, area_id, weight"),
    ]);
  if (exercisesError) throw exercisesError;
  if (areaError) throw areaError;

  const byExercise = new Map<string, { area_id: string; weight: number }[]>();
  for (const row of (areaRows ?? []) as Array<{
    exercise_id: string;
    area_id: string;
    weight: number;
  }>) {
    const list = byExercise.get(row.exercise_id) ?? [];
    list.push({ area_id: row.area_id, weight: row.weight });
    byExercise.set(row.exercise_id, list);
  }

  const cached = (exercises ?? []).map((row: Tables<"exercises">) => {
    const mapped = toLibraryExercise(row, byExercise.get(row.id) ?? []);
    return { key: `${userId}:${mapped.id}`, userId, exercise: mapped };
  });

  await db.transaction("rw", db.libraryCache, async () => {
    await db.libraryCache.where({ userId }).delete();
    await db.libraryCache.bulkPut(cached);
  });
}

/** Refetches the 9 `area_targets` rows and replaces the cache (AC-C16). */
export async function refreshTargets(): Promise<void> {
  const userId = currentUserId();
  if (!userId) return;
  const db = offlineDb();

  const { data, error } = await supabase.from("area_targets").select("*");
  if (error) throw error;

  const cached = (data ?? []).map((row: Tables<"area_targets">) => {
    const mapped = toAreaTarget(row);
    return { key: `${userId}:${mapped.area}`, userId, target: mapped };
  });

  await db.transaction("rw", db.targetCache, async () => {
    await db.targetCache.where({ userId }).delete();
    await db.targetCache.bulkPut(cached);
  });
}

/** Refetches the profile row and replaces the cache (AC-C16). */
export async function refreshProfile(): Promise<void> {
  const userId = currentUserId();
  if (!userId) return;
  const db = offlineDb();

  const { data, error } = await supabase.from("profiles").select("*").maybeSingle();
  if (error) throw error;
  if (!data) return;

  const mapped = toEngineProfile(data as Tables<"profiles">);
  await db.profileCache.put({ userId, profile: mapped });
}

/** Runs history, library, targets and profile refreshes together (an online start, AC-C16). */
export async function refreshAll(now: Date, tz: string): Promise<void> {
  await Promise.all([
    refreshHistory(now, tz),
    refreshLibrary(),
    refreshTargets(),
    refreshProfile(),
  ]);
}

export async function loadLibrary(): Promise<LibraryExercise[]> {
  const userId = currentUserId();
  if (!userId) return [];
  const rows = await offlineDb().libraryCache.where({ userId }).toArray();
  return rows.map((r) => r.exercise);
}

export async function loadTargets(): Promise<AreaTarget[]> {
  const userId = currentUserId();
  if (!userId) return [];
  const rows = await offlineDb().targetCache.where({ userId }).toArray();
  return rows.map((r) => r.target);
}

export async function loadProfile(): Promise<EngineProfile | null> {
  const userId = currentUserId();
  if (!userId) return null;
  const row = await offlineDb().profileCache.get(userId);
  return row?.profile ?? null;
}

export async function lastSyncedAt(): Promise<string | null> {
  const userId = currentUserId();
  if (!userId) return null;
  const meta = await offlineDb().syncMeta.get(userId);
  return meta?.lastSyncedAt ?? null;
}
