// Data access for the engine paths (D-0037 §4, D-0053 §4, §6). Every read uses the caller's JWT
// (RLS applies), so a session or profile the caller doesn't own is invisible. 422 `profile_missing`
// fires before the engine ever runs (no profile row, or fewer than 9 area_targets rows).
import { AREAS, deriveTargets, BASE_TARGETS } from "@workoutlab/engine";
import type {
  Area,
  AreaTarget,
  EngineProfile,
  HistorySet,
  Instant,
  LibraryExercise,
} from "@workoutlab/shared";
import {
  toAreaTargets,
  toEngineProfile,
  toHistorySet,
  toLibraryExercise,
} from "@workoutlab/shared";
import type { AuthContext } from "./auth.ts";
import { notFound, internalError, profileMissing } from "./errors.ts";

/** D-0053 §6: history window is completed_at >= now - 56 days (D-0034 §3). */
export const HISTORY_WINDOW_DAYS = 56;

/** PostgREST's own `max_rows` (`supabase/config.toml`) silently truncates any single response at
 * 1000 rows. A heavy user's 56-day `session_sets` history can exceed that, so it's paged in
 * chunks of this size via `.range()` until a page comes back short (the exhaustion signal),
 * rather than trusting one `select` to return everything. */
export const HISTORY_PAGE_SIZE = 1000;

/** A minimal shape for the query builder `pageAll` needs: `.range(from, to)` returning
 * `{data, error}`, matching the subset of the PostgREST query builder actually used here. This
 * keeps `pageAll` unit-testable with a plain fake, no live Supabase client required. */
export interface RangeQuery<Row> {
  range(
    from: number,
    to: number,
  ): PromiseLike<{ data: Row[] | null; error: { message: string } | null }>;
}

/** Pages `query` in chunks of `pageSize` rows via `.range()`, concatenating every page, until a
 * page comes back with fewer than `pageSize` rows (exhausted) or empty. Guards against
 * PostgREST's `max_rows` (config.toml) silently truncating a single large `select` — a page that
 * happens to land exactly on `pageSize` rows still triggers one more (empty or short) fetch to
 * confirm exhaustion, so a query with exactly N * pageSize rows isn't mistaken for truncation. */
export async function pageAll<Row>(
  query: RangeQuery<Row>,
  pageSize: number = HISTORY_PAGE_SIZE,
): Promise<Row[]> {
  const rows: Row[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw internalError();
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

export interface EngineInputs {
  profile: EngineProfile;
  targets: AreaTarget[];
  history: HistorySet[];
  library: LibraryExercise[];
}

/** The full exercise library (both kinds) with its `exercise_areas`, mapped with
 * `toLibraryExercise` (D-0053 §6). Shared by every engine path: `loadEngineInputs` (suggest,
 * balance) and the finish summary. */
async function loadLibrary(supabase: AuthContext["supabase"]): Promise<LibraryExercise[]> {
  const [exercisesRes, exerciseAreasRes] = await Promise.all([
    supabase.from("exercises").select("*"),
    supabase.from("exercise_areas").select("exercise_id, area_id, weight"),
  ]);
  if (exercisesRes.error) throw internalError();
  if (exerciseAreasRes.error) throw internalError();

  const areasByExercise = new Map<string, { area_id: string; weight: number }[]>();
  for (const row of exerciseAreasRes.data ?? []) {
    const list = areasByExercise.get(row.exercise_id) ?? [];
    list.push(row);
    areasByExercise.set(row.exercise_id, list);
  }

  return (exercisesRes.data ?? []).map((row) =>
    toLibraryExercise(row, areasByExercise.get(row.id) ?? []),
  );
}

/** The caller's `session_sets` with `completed_at >= now - 56 days` (D-0053 §6), paged
 * (`pageAll`) against PostgREST's `max_rows` (config.toml) for a heavy user's window. Ordered by
 * `client_id` so pagination is stable and exhaustive regardless of insertion order or concurrent
 * writes during the read. Shared by `loadEngineInputs` (suggest, balance) and the finish
 * summary's `balance` component (D-0053 §8), which both need the same window as of `now`. */
async function loadHistoryWindow(ctx: AuthContext, now: Instant): Promise<HistorySet[]> {
  const { supabase, userId } = ctx;
  const windowStart = new Date(
    new Date(now).getTime() - HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const historyRows = await pageAll(
    supabase
      .from("session_sets")
      .select(
        "client_id, session_id, exercise_id, is_warmup, completed_at, edited_at, deleted_at, reps, weight_kg, duration_s",
      )
      .eq("user_id", userId)
      .gte("completed_at", windowStart)
      .order("client_id", { ascending: true }),
  );
  return historyRows.map((row) => toHistorySet(row));
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

  const [history, library] = await Promise.all([
    loadHistoryWindow(ctx, now),
    loadLibrary(supabase),
  ]);

  const targets = toAreaTargets(targetsRes.data ?? []);
  const profile = toEngineProfile(profileRes.data);

  return { profile, targets, history, library };
}

// ---- Finish (POST /sessions/{id}/finish, D-0053 §7–§8) ----------------------------------------

export interface SessionRow {
  id: string;
  startedAt: Instant;
  endedAt: Instant | null;
  timeBudgetMin: number;
  effortRating: number | null;
}

/** Loads the caller's session by id. RLS makes another user's session (or a non-existent id)
 * invisible, so a missing row is 404 `not_found` (D-0037 §4), never a leak of "not yours" vs
 * "doesn't exist". Any other DB failure is 500. */
export async function loadOwnedSession(ctx: AuthContext, sessionId: string): Promise<SessionRow> {
  const { data, error } = await ctx.supabase
    .from("sessions")
    .select("id, started_at, ended_at, time_budget_min, effort_rating")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw internalError();
  if (data === null) throw notFound("Session not found");
  return {
    id: data.id,
    startedAt: data.started_at,
    endedAt: data.ended_at,
    timeBudgetMin: data.time_budget_min,
    effortRating: data.effort_rating,
  };
}

/** Writes `ended_at` (and `effort_rating`, when present) on the caller's session. Returns the row
 * as stored after the write. RLS scopes the update to the caller, so this never touches another
 * user's row (defence in depth on top of the 404 from `loadOwnedSession`).
 *
 * `effortRating` distinguishes absent from null (D-0058): `undefined` leaves the column alone,
 * while an explicit `null` clears it — that is how a winning, unrated finish drops the rating of
 * the earlier finish it supersedes. Both keys are therefore gated on `!== undefined`, never on
 * truthiness or `!= null`. */
export async function writeSessionFinish(
  ctx: AuthContext,
  sessionId: string,
  patch: { endedAt?: Instant; effortRating?: number | null },
): Promise<SessionRow> {
  const update: Record<string, unknown> = {};
  if (patch.endedAt !== undefined) update.ended_at = patch.endedAt;
  if (patch.effortRating !== undefined) update.effort_rating = patch.effortRating;

  const { data, error } = await ctx.supabase
    .from("sessions")
    .update(update)
    .eq("id", sessionId)
    .select("id, started_at, ended_at, time_budget_min, effort_rating")
    .maybeSingle();
  if (error) throw internalError();
  if (data === null) throw notFound("Session not found");
  return {
    id: data.id,
    startedAt: data.started_at,
    endedAt: data.ended_at,
    timeBudgetMin: data.time_budget_min,
    effortRating: data.effort_rating,
  };
}

/** All of the caller's *live* (not tombstoned) sets on this session, paged (D-0053's `pageAll`
 * guard against `max_rows`, applied here too — a very long session's set count is unbounded).
 * Kept ordered by `client_id` for a stable, exhaustive page walk. Tombstoned sets are excluded at
 * the query level: `isHardSet` would drop them anyway (rule 2), but the summary's `hardSets` and
 * `exerciseCount` only need live rows, so filtering here keeps the payload smaller. */
export async function loadSessionSets(ctx: AuthContext, sessionId: string): Promise<HistorySet[]> {
  const rows = await pageAll(
    ctx.supabase
      .from("session_sets")
      .select(
        "client_id, session_id, exercise_id, is_warmup, completed_at, edited_at, deleted_at, reps, weight_kg, duration_s",
      )
      .eq("session_id", sessionId)
      .is("deleted_at", null)
      .order("client_id", { ascending: true }),
  );
  return rows.map((row) => toHistorySet(row));
}

export interface FinishEngineInputs {
  targets: AreaTarget[];
  library: LibraryExercise[];
  /** The caller's 56-day history as of `endedAt` (D-0053 §6, §8) — the same window shape
   * `loadEngineInputs` computes for suggest/balance, so `SessionSummary.balance` matches what
   * `GET /balance` would return at that same instant. */
  history: HistorySet[];
}

/** D-0053 §8: the finish summary never 422s. When the caller has fewer than 9 `area_targets`, it
 * falls back to `deriveTargets(profile)` when a profile exists, else `BASE_TARGETS`, each with
 * `source: "default"` and `updatedAt = ended_at` (the caller's own row, not the server clock). */
export async function loadFinishEngineInputs(
  ctx: AuthContext,
  endedAt: Instant,
): Promise<FinishEngineInputs> {
  const { supabase, userId } = ctx;
  const [profileRes, targetsRes, library, history] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("area_targets").select("*").eq("user_id", userId),
    loadLibrary(supabase),
    loadHistoryWindow(ctx, endedAt),
  ]);
  if (profileRes.error) throw internalError();
  if (targetsRes.error) throw internalError();

  const targetRows = targetsRes.data ?? [];
  if (targetRows.length >= 9) {
    return { targets: toAreaTargets(targetRows), library, history };
  }

  const numbers =
    profileRes.data === null
      ? BASE_TARGETS
      : deriveTargets({
          rhythmMin: profileRes.data.rhythm_min,
          rhythmMax: profileRes.data.rhythm_max,
          priorityAreas: profileRes.data.priority_areas as Area[],
        });
  const targets: AreaTarget[] = AREAS.map((area) => ({
    area,
    setsPer14d: numbers[area],
    source: "default",
    updatedAt: endedAt,
  }));
  return { targets, library, history };
}
