// POST /sessions/{id}/finish handler core (D-0037 §9, D-0053 §7–§8, AC24–AC33). Pure apart from
// the injected `deps`, so a unit test can fix `now` (only used as the fallback `updatedAt` when a
// fresh session has never had a target computed — the summary itself uses the *stored* `ended_at`,
// never the server clock, so a repeat finish is deep-equal, D-0053 §8) and spy on `balance`.
import { balance, isHardSet } from "@workoutlab/engine";
import type {
  Area,
  AreaSetCounts,
  BalanceResult,
  FinishRequest,
  HistorySet,
  Instant,
  LibraryExercise,
  SessionSummary,
  TimeZone,
} from "@workoutlab/shared";
import { AREAS } from "@workoutlab/shared";
import type { AuthContext } from "../_shared/auth.ts";
import { badRequest } from "../_shared/errors.ts";
import {
  loadFinishEngineInputs,
  loadOwnedSession,
  loadSessionSets,
  writeSessionFinish,
  type SessionRow,
} from "../_shared/repo.ts";
import { parseJsonBody, validateFinishRequest, validateSessionId } from "../_shared/validate.ts";

export interface FinishDeps {
  loadOwnedSession: typeof loadOwnedSession;
  writeSessionFinish: typeof writeSessionFinish;
  loadSessionSets: typeof loadSessionSets;
  loadFinishEngineInputs: typeof loadFinishEngineInputs;
  balance: typeof balance;
}

export const defaultFinishDeps: FinishDeps = {
  loadOwnedSession,
  writeSessionFinish,
  loadSessionSets,
  loadFinishEngineInputs,
  balance,
};

function instantMs(instant: Instant): number {
  return new Date(instant).getTime();
}

/** D-0053 §7 as amended by D-0058: the latest `endedAt` wins, and `effort_rating` is part of the
 * same max — the winning finish decides the *whole* row. Returns the patch to write (possibly
 * empty) and never mutates its inputs.
 *
 * With `stored` = `sessions.ended_at` and `req` = the request's `endedAt`:
 *   1. `stored` is null, or `req > stored` — this finish wins: write `ended_at = req` **and**
 *      `effort_rating = request.effortRating ?? null`, clearing the column when the winning finish
 *      carries no rating. Without that clear, a rating's survival would depend on arrival order
 *      (D-0058: `[rated 07:31, unrated 07:40]` kept the 4, `[unrated 07:40, rated 07:31]` did not).
 *   2. `req = stored` — a retry of the winning finish: write `effortRating` only when the request
 *      carries one. A retry may *add* a rating; it must never clear one.
 *   3. `req < stored` — write nothing.
 *
 * The row is therefore a function of the winning `endedAt` plus the ratings seen at that
 * `endedAt`, so any replay order of the same set of finishes converges on the same row. */
function resolveFinishPatch(
  stored: SessionRow,
  request: FinishRequest,
): { endedAt?: Instant; effortRating?: number | null } {
  const requestMs = instantMs(request.endedAt);
  const storedMs = stored.endedAt === null ? null : instantMs(stored.endedAt);

  if (storedMs !== null && requestMs < storedMs) {
    // Rule 3 — older than what's stored: write nothing.
    return {};
  }

  if (storedMs === null || requestMs > storedMs) {
    // Rule 1 — this finish wins, so it owns both columns. `?? null` clears a rating left behind
    // by a superseded, earlier finish.
    return { endedAt: request.endedAt, effortRating: request.effortRating ?? null };
  }

  // Rule 2 — `requestMs === storedMs`: a retry may add a rating, never clear one.
  return request.effortRating === undefined ? {} : { effortRating: request.effortRating };
}

/** Rule 2 hard sets among the session's live (non-tombstoned; already filtered by
 * `loadSessionSets`) sets, excluding warm-ups and any set whose exercise isn't a known library
 * `exercise` row (D-0053 §8). */
function hardSetsOf(sets: readonly HistorySet[], library: readonly LibraryExercise[]) {
  const byId = new Map(library.map((e) => [e.id, e]));
  return sets.filter((s) => isHardSet(s, byId.get(s.exerciseId)));
}

function weightedSetsByAreaOf(
  hardSets: readonly HistorySet[],
  library: readonly LibraryExercise[],
): AreaSetCounts {
  const byId = new Map(library.map((e) => [e.id, e]));
  const totals = Object.fromEntries(AREAS.map((a) => [a, 0])) as Record<Area, number>;
  for (const set of hardSets) {
    const exercise = byId.get(set.exerciseId);
    if (exercise === undefined) continue;
    for (const area of AREAS) {
      const weight = exercise.areas[area];
      if (weight !== undefined && weight > 0) totals[area] += weight;
    }
  }
  return totals;
}

/** Builds the `SessionSummary` for `stored` (the session row *as written*), a pure function of
 * the stored row and the caller's history/targets/library — D-0053 §8. `balance`'s `now` is the
 * stored `ended_at`, never the server clock, so finishing twice (or replaying out of order)
 * returns a deep-equal body. `hardSets`/`exerciseCount`/`weightedSetsByArea` are scoped to this
 * session's own sets; `balance` runs over the caller's full 56-day history, matching what
 * `GET /balance` would return at the same instant (D-0053 §8 doesn't scope it to one session). */
async function buildSummary(
  ctx: AuthContext,
  stored: SessionRow,
  tz: TimeZone,
  deps: FinishDeps,
): Promise<SessionSummary> {
  if (stored.endedAt === null) {
    // Unreachable via the handler (finish always ends in a non-null ended_at once this function
    // has run once), guarded here so a future caller can't silently divide by a null duration.
    throw badRequest("session has not been finished");
  }
  const endedAt = stored.endedAt;

  const [sessionSets, { targets, library, history }] = await Promise.all([
    deps.loadSessionSets(ctx, stored.id),
    deps.loadFinishEngineInputs(ctx, endedAt),
  ]);

  const hardSets = hardSetsOf(sessionSets, library);
  const exerciseCount = new Set(hardSets.map((s) => s.exerciseId)).size;
  const weightedSetsByArea = weightedSetsByAreaOf(hardSets, library);

  const durationS = Math.floor((instantMs(endedAt) - instantMs(stored.startedAt)) / 1000);
  const withinBudget = durationS <= stored.timeBudgetMin * 60 + 120;

  const balanceResult: BalanceResult = deps.balance(history, targets, library, endedAt, tz);

  return {
    sessionId: stored.id,
    startedAt: stored.startedAt,
    endedAt,
    durationS,
    timeBudgetMin: stored.timeBudgetMin,
    withinBudget,
    exerciseCount,
    hardSets: hardSets.length,
    weightedSetsByArea,
    balance: balanceResult,
  };
}

export async function finishSessionCore(
  ctx: AuthContext,
  pathId: unknown,
  body: unknown,
  deps: FinishDeps = defaultFinishDeps,
): Promise<SessionSummary> {
  const sessionId = validateSessionId(pathId);
  const request = validateFinishRequest(body);

  const stored = await deps.loadOwnedSession(ctx, sessionId);

  if (instantMs(request.endedAt) < instantMs(stored.startedAt)) {
    throw badRequest("endedAt must not be before the session's startedAt");
  }

  const patch = resolveFinishPatch(stored, request);
  const afterWrite =
    Object.keys(patch).length === 0 ? stored : await deps.writeSessionFinish(ctx, sessionId, patch);

  return buildSummary(ctx, afterWrite, request.tz, deps);
}

export function readFinishBody(req: Request): Promise<unknown> {
  return parseJsonBody(req);
}
