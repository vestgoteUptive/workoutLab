// Data access for the engine paths (D-0037 §4, D-0053 §4, §6). Every read uses the caller's JWT
// (RLS applies), so a session or profile the caller doesn't own is invisible. 422 `profile_missing`
// fires before the engine ever runs (no profile row, or fewer than 9 area_targets rows).
import type {
  AreaTarget,
  EngineProfile,
  HistorySet,
  LibraryExercise,
  Instant,
} from "@workoutlab/shared";
import {
  toAreaTargets,
  toEngineProfile,
  toHistorySet,
  toLibraryExercise,
} from "@workoutlab/shared";
import type { AuthContext } from "./auth.ts";
import { profileMissing, internalError } from "./errors.ts";

/** D-0053 §6: history window is completed_at >= now - 56 days (D-0034 §3). */
export const HISTORY_WINDOW_DAYS = 56;

export interface EngineInputs {
  profile: EngineProfile;
  targets: AreaTarget[];
  history: HistorySet[];
  library: LibraryExercise[];
}

/** Loads everything the engine needs for the caller: profile, 9 area targets, 56-day history and
 * the full exercise library. Throws `profileMissing()` (422) before any engine call when the
 * caller has no `profiles` row or fewer than 9 `area_targets` rows (D-0037 §4). Any other DB
 * failure throws `internalError()` (500), never leaking the underlying message. */
export async function loadEngineInputs(ctx: AuthContext, now: Instant): Promise<EngineInputs> {
  const { supabase, userId } = ctx;

  const [profileRes, targetsRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("area_targets").select("*").eq("user_id", userId),
  ]);
  if (profileRes.error) throw internalError();
  if (targetsRes.error) throw internalError();
  if (profileRes.data === null || (targetsRes.data ?? []).length < 9) {
    throw profileMissing();
  }

  const windowStart = new Date(
    new Date(now).getTime() - HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [historyRes, exercisesRes, exerciseAreasRes] = await Promise.all([
    supabase
      .from("session_sets")
      .select(
        "client_id, session_id, exercise_id, is_warmup, completed_at, edited_at, deleted_at, reps, weight_kg, duration_s",
      )
      .eq("user_id", userId)
      .gte("completed_at", windowStart),
    supabase.from("exercises").select("*"),
    supabase.from("exercise_areas").select("exercise_id, area_id, weight"),
  ]);
  if (historyRes.error) throw internalError();
  if (exercisesRes.error) throw internalError();
  if (exerciseAreasRes.error) throw internalError();

  const areasByExercise = new Map<string, { area_id: string; weight: number }[]>();
  for (const row of exerciseAreasRes.data ?? []) {
    const list = areasByExercise.get(row.exercise_id) ?? [];
    list.push(row);
    areasByExercise.set(row.exercise_id, list);
  }

  const library = (exercisesRes.data ?? []).map((row) =>
    toLibraryExercise(row, areasByExercise.get(row.id) ?? []),
  );
  const history = (historyRes.data ?? []).map((row) => toHistorySet(row));
  const targets = toAreaTargets(targetsRes.data ?? []);
  const profile = toEngineProfile(profileRes.data);

  return { profile, targets, history, library };
}
