// 56-local-day history fetch + library/targets/profile cache (AC-C13, AC-C16, D-0034 §3), plus
// the v2 feature caches of T-0319: exercise details + variants, sessions (the same 56-day
// window), plan check-ins and routines (D-0067 §3, §5).
//
// Every refresh here REPLACES this user's rows in its table: a delete of the user's rows plus one
// `bulkPut`, inside one transaction. The select happens BEFORE the transaction is entered, so a
// failed select throws with the previous cache untouched (AC-6) instead of leaving it empty.
import { windowStartInstant } from "../format/intl.js";
import { supabase } from "../auth/client.js";
import {
  toAreaTarget,
  toEngineProfile,
  toHistorySet,
  toLibraryExercise,
  toPlanCheckin,
  type AreaTarget,
  type EngineProfile,
  type LibraryExercise,
  type Tables,
} from "@workoutlab/shared";
import {
  offlineDb,
  setKey,
  type CachedRoutineItem,
  type CachedSession,
  type ExerciseDetail,
} from "./db.js";
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

/** Refetches the exercise library and replaces the cache (AC-C16), and with it the UF-04 how-to
 *  text and variants (T-0319 AC-2).
 *
 *  `exercises` is selected ONCE per refresh (`select("*")` already returns `instructions`,
 *  `mistakes`, `cue`, `source`, `license`, `attribution` and `source_url`), so the detail cache
 *  costs one extra request for `exercise_variants` and no second read of `exercises`. Both tables
 *  are written in one transaction, so a reader never sees a library without its details.
 *
 *  That single transaction also means an `exercise_variants` failure blocks the library refresh
 *  (AC-6: "the transaction isn't entered"). Deliberate, and the reason the T-0300c e2e fixture
 *  has to stub `exercise_variants` — see D-0072. */
export async function refreshLibrary(): Promise<void> {
  const userId = currentUserId();
  if (!userId) return;
  const db = offlineDb();

  const [
    { data: exercises, error: exercisesError },
    { data: areaRows, error: areaError },
    { data: variantRows, error: variantError },
  ] = await Promise.all([
    supabase.from("exercises").select("*"),
    supabase.from("exercise_areas").select("exercise_id, area_id, weight"),
    supabase.from("exercise_variants").select("exercise_id, variant_id"),
  ]);
  if (exercisesError) throw exercisesError;
  if (areaError) throw areaError;
  if (variantError) throw variantError;

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

  const variantsByExercise = new Map<string, string[]>();
  for (const row of (variantRows ?? []) as Array<{ exercise_id: string; variant_id: string }>) {
    const list = variantsByExercise.get(row.exercise_id) ?? [];
    list.push(row.variant_id);
    variantsByExercise.set(row.exercise_id, list);
  }

  const rows = (exercises ?? []) as Tables<"exercises">[];
  const cached = rows.map((row) => {
    const mapped = toLibraryExercise(row, byExercise.get(row.id) ?? []);
    return { key: `${userId}:${mapped.id}`, userId, exercise: mapped };
  });
  const details = rows.map((row) => {
    const detail: ExerciseDetail = {
      id: row.id,
      instructions: row.instructions,
      mistakes: row.mistakes,
      cue: row.cue,
      source: row.source,
      license: row.license,
      attribution: row.attribution,
      sourceUrl: row.source_url,
      variants: [...(variantsByExercise.get(row.id) ?? [])].sort((a, b) => (a < b ? -1 : 1)),
    };
    return { key: `${userId}:${row.id}`, userId, detail };
  });

  await db.transaction("rw", db.libraryCache, db.exerciseDetails, async () => {
    await db.libraryCache.where({ userId }).delete();
    await db.libraryCache.bulkPut(cached);
    await db.exerciseDetails.where({ userId }).delete();
    await db.exerciseDetails.bulkPut(details);
  });
}

/** Refetches this user's `sessions` rows for the last 56 local days and replaces the cache
 *  (T-0319 AC-3). The window is the history window of D-0034 §3, so UF-06 and UF-11 read the
 *  same span of time as the engine. */
export async function refreshSessions(now: Date, tz: string): Promise<void> {
  const userId = currentUserId();
  if (!userId) return;
  const db = offlineDb();
  const windowStart = windowStartInstant(now.toISOString(), tz, HISTORY_WINDOW_DAYS);

  const { data, error } = await supabase
    .from("sessions")
    .select("id, started_at, ended_at, time_budget_min, effort_rating, energy")
    .gte("started_at", windowStart);
  if (error) throw error;

  const rows = (data ?? []) as Array<
    Pick<
      Tables<"sessions">,
      "id" | "started_at" | "ended_at" | "time_budget_min" | "effort_rating" | "energy"
    >
  >;
  const cached: CachedSession[] = rows.map((row) => ({
    key: `${userId}:${row.id}`,
    userId,
    id: row.id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    timeBudgetMin: row.time_budget_min,
    effortRating: row.effort_rating,
    energy: row.energy,
  }));

  await db.transaction("rw", db.sessionCache, async () => {
    await db.sessionCache.where({ userId }).delete();
    await db.sessionCache.bulkPut(cached);
  });
}

/** Refetches every `plan_checkins` row of this user and replaces the cache (T-0319 AC-4). There
 *  is no window: a check-in history is a handful of rows (one per 14-day period, D-0018). */
export async function refreshCheckins(): Promise<void> {
  const userId = currentUserId();
  if (!userId) return;
  const db = offlineDb();

  const { data, error } = await supabase.from("plan_checkins").select("*");
  if (error) throw error;

  const cached = (data ?? []).map((row: Tables<"plan_checkins">) => {
    const checkin = toPlanCheckin(row);
    return { key: `${userId}:${checkin.id}`, userId, checkin };
  });

  await db.transaction("rw", db.checkinCache, async () => {
    await db.checkinCache.where({ userId }).delete();
    await db.checkinCache.bulkPut(cached);
  });
}

/** Refetches `routines` + `routine_items` and replaces the cache (T-0319 AC-4). */
export async function refreshRoutines(): Promise<void> {
  const userId = currentUserId();
  if (!userId) return;
  const db = offlineDb();

  const [{ data: routines, error: routinesError }, { data: itemRows, error: itemsError }] =
    await Promise.all([
      supabase.from("routines").select("id, name, updated_at"),
      supabase.from("routine_items").select("routine_id, position, exercise_id"),
    ]);
  if (routinesError) throw routinesError;
  if (itemsError) throw itemsError;

  const itemsByRoutine = new Map<string, CachedRoutineItem[]>();
  for (const row of (itemRows ?? []) as Array<{
    routine_id: string;
    position: number;
    exercise_id: string;
  }>) {
    const list = itemsByRoutine.get(row.routine_id) ?? [];
    list.push({ position: row.position, exerciseId: row.exercise_id });
    itemsByRoutine.set(row.routine_id, list);
  }

  const cached = (
    (routines ?? []) as Array<Pick<Tables<"routines">, "id" | "name" | "updated_at">>
  ).map((row) => ({
    key: `${userId}:${row.id}`,
    userId,
    id: row.id,
    name: row.name,
    updatedAt: row.updated_at,
    items: [...(itemsByRoutine.get(row.id) ?? [])].sort((a, b) => a.position - b.position),
  }));

  await db.transaction("rw", db.routineCache, async () => {
    await db.routineCache.where({ userId }).delete();
    await db.routineCache.bulkPut(cached);
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

/** Runs every read-side refresh together (an online start, AC-C16 + T-0319 AC-8). */
export async function refreshAll(now: Date, tz: string): Promise<void> {
  await Promise.all([
    refreshHistory(now, tz),
    refreshLibrary(),
    refreshTargets(),
    refreshProfile(),
    refreshSessions(now, tz),
    refreshCheckins(),
    refreshRoutines(),
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
