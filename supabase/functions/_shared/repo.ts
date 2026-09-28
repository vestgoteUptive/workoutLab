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

  // `session_sets` history can exceed PostgREST's `max_rows` (config.toml) for a heavy user's
  // 56-day window, so it's paged (`pageAll`) rather than fetched in one `select`, which
  // `max_rows` would silently truncate. Ordered by `client_id` so pagination is stable and
  // exhaustive regardless of insertion order or concurrent writes during the read.
  const [historyRows, exercisesRes, exerciseAreasRes] = await Promise.all([
    pageAll(
      supabase
        .from("session_sets")
        .select(
          "client_id, session_id, exercise_id, is_warmup, completed_at, edited_at, deleted_at, reps, weight_kg, duration_s",
        )
        .eq("user_id", userId)
        .gte("completed_at", windowStart)
        .order("client_id", { ascending: true }),
    ),
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

  const library = (exercisesRes.data ?? []).map((row) =>
    toLibraryExercise(row, areasByExercise.get(row.id) ?? []),
  );
  const history = historyRows.map((row) => toHistorySet(row));
  const targets = toAreaTargets(targetsRes.data ?? []);
  const profile = toEngineProfile(profileRes.data);

  return { profile, targets, history, library };
}
