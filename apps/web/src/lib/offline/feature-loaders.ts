// The read-only loaders for the v2 feature caches (T-0319, D-0067 §3, §5): exercise details and
// variants (UF-04.1/.2/.3), sessions (UF-03.3, UF-06.1/.2, UF-11.1/.2), plan check-ins (UF-11)
// and routines (UF-07.1, UF-11.2).
//
// Read-only on purpose. Plan, check-in and routine WRITES are online-only supabase-js calls made
// by the features (D-0070 §2–§3), so there is no write helper here for `routines`,
// `routine_items`, `plan_checkins`, `profiles` or `area_targets` (AC-9).
//
// Every loader reads IndexedDB only: no `fetch`, no supabase-js, nothing awaited on the network
// (AC-5). Sorting happens here, not in the query, so the order holds whatever IndexedDB's index
// traversal returns.
import type { PlanCheckin } from "@workoutlab/shared";
import { offlineDb, userScopedKey, type CachedRoutineItem, type ExerciseDetail } from "./db.js";
import { currentUserId } from "./current-user.js";

/** One cached session as UF-03.3/UF-06/UF-11 read it. */
export interface OfflineSession {
  id: string;
  startedAt: string;
  endedAt: string | null;
  timeBudgetMin: number;
  effortRating: number | null;
  energy: string;
}

export interface OfflineRoutine {
  id: string;
  name: string;
  updatedAt: string;
  items: CachedRoutineItem[];
}

/** The UF-04 how-to text and variants of one exercise, or `null` for an id that isn't cached. */
export async function loadExerciseDetail(id: string): Promise<ExerciseDetail | null> {
  const userId = currentUserId();
  if (!userId) return null;
  const row = await offlineDb().exerciseDetails.get(userScopedKey(userId, id));
  return row?.detail ?? null;
}

/** The variant ids of one exercise, sorted by id; `[]` for an unknown or variant-less id. */
export async function loadVariants(id: string): Promise<string[]> {
  const detail = await loadExerciseDetail(id);
  return detail?.variants ?? [];
}

/** Cached server sessions ∪ this user's queued `sessions` rows, with the QUEUED row winning by
 *  `id` (T-0319 AC-3).
 *
 *  The queued row wins because it is, by definition, the newer local truth: it either hasn't been
 *  sent yet, or it was sent after the cache was filled (D-0151 below narrows this for a flushed
 *  entry that a later refresh has caught up with). Every `QueuedSession` counts, `pending`
 *  or not — a flushed row keeps its entry (it carries the D-0053 §7 `finished` marker), and
 *  dropping the non-pending ones would hide a just-finished session until the next refresh.
 *
 *  When a session has both a cached and a queued row, the fields merge per D-0148 (T-0324):
 *  - `endedAt` is the later INSTANT of the two (`Date.parse`, never a string compare); an equal
 *    instant keeps the queued string, an unparsable side lets the queued non-null value win, and
 *    it is `null` only when both are null (§1). A finish therefore never disappears (D-0053 §7).
 *  - When the cached `endedAt` is strictly later (or the queued one is null), the cached finish
 *    wins whole: `effortRating` is the cached value (§2, the D-0058 §1 rule on the device).
 *  - Otherwise a PRESENT queued `effort_rating` key wins, explicit `null` included, so a cleared
 *    rating (UF-03.3 Save with no chip) stays cleared; an absent key keeps the cached value (§3).
 *  - `energy` keeps its coalesce (§4); with no cached row the queued row is used as is (§5).
 *
 *  D-0151 amends this for two cases:
 *  - A flushed entry marked `cacheCurrent` (a refresh issued after its flush filled the cache)
 *    defers to the cached row: `effortRating`, `energy`, `startedAt` and `timeBudgetMin` come
 *    from the cache, and `endedAt` is still the later instant (§4). Every other entry (pending,
 *    flushed but unmarked, or from an older build) keeps D-0148, so a T-0420 Save (UF-03.3)
 *    wins at an equal `ended_at` until a refresh brings its row back (§5).
 *  - A queued row with no `ended_at` KEY has no say in the finish: `endedAt` is the cached one
 *    (or `null`), and a present `effort_rating` key still wins (§6). An explicit `ended_at: null`
 *    keeps D-0148 §2.
 *
 *  Sorted by `startedAt`, then `id`, so the order is total and stable. */
export async function loadSessions(): Promise<OfflineSession[]> {
  const userId = currentUserId();
  if (!userId) return [];
  const db = offlineDb();

  const [cached, queued] = await Promise.all([
    db.sessionCache.where({ userId }).toArray(),
    db.sessions.where({ userId }).toArray(),
  ]);

  const byId = new Map<string, OfflineSession>();
  for (const row of cached) {
    byId.set(row.id, {
      id: row.id,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      timeBudgetMin: row.timeBudgetMin,
      effortRating: row.effortRating,
      energy: row.energy,
    });
  }
  for (const entry of queued) {
    const row = entry.row;
    const previous = byId.get(entry.id);
    // D-0151 §6: an absent `ended_at` key has no say in the finish (the upsert leaves the column
    // untouched, D-0045 §6). An explicit `null` keeps D-0148 §2.
    const hasEnd = Object.hasOwn(row, "ended_at");
    const queuedEnd = row.ended_at ?? null;

    if (previous !== undefined && entry.pending === false && entry.cacheCurrent === true) {
      // D-0151 §4: a refresh issued after this entry's flush filled the cache, so the cached row
      // is the newer server truth. `endedAt` still takes the later instant (D-0148 §1), so a
      // finish never disappears (D-0053 §7).
      // An absent queued key reads as `null` here, which gives the cached `endedAt` (§6).
      const endedAt = cachedFinishIsLater(previous.endedAt, queuedEnd)
        ? previous.endedAt
        : queuedEnd;
      byId.set(entry.id, { ...previous, endedAt });
      continue;
    }

    const cachedWins =
      previous !== undefined && hasEnd && cachedFinishIsLater(previous.endedAt, queuedEnd);
    const effortRating = cachedWins
      ? previous.effortRating
      : Object.hasOwn(row, "effort_rating")
        ? (row.effort_rating ?? null)
        : (previous?.effortRating ?? null);
    byId.set(entry.id, {
      id: entry.id,
      startedAt: row.started_at,
      // D-0148 §1: the later instant of the two, so a finish never disappears (D-0053 §7).
      // D-0151 §6: with no `ended_at` key, the cached finish (or `null` with no cached row).
      endedAt: !hasEnd ? (previous?.endedAt ?? null) : cachedWins ? previous.endedAt : queuedEnd,
      timeBudgetMin: row.time_budget_min,
      effortRating,
      energy: row.energy ?? previous?.energy ?? "normal",
    });
  }

  return [...byId.values()].sort(
    (a, b) => compare(a.startedAt, b.startedAt) || compare(a.id, b.id),
  );
}

/** Every cached `plan_checkins` row, newest `proposedAt` first, then by `id` (T-0319 AC-4). */
export async function loadCheckins(): Promise<PlanCheckin[]> {
  const userId = currentUserId();
  if (!userId) return [];
  const rows = await offlineDb().checkinCache.where({ userId }).toArray();
  return rows
    .map((r) => r.checkin)
    .sort((a, b) => compare(b.proposedAt, a.proposedAt) || compare(a.id, b.id));
}

/** Every cached routine, sorted by name (`localeCompare`) then `id`, each with its items sorted
 *  by `position` (T-0319 AC-4). */
export async function loadRoutines(): Promise<OfflineRoutine[]> {
  const userId = currentUserId();
  if (!userId) return [];
  const rows = await offlineDb().routineCache.where({ userId }).toArray();
  return rows
    .map((r) => ({
      id: r.id,
      name: r.name,
      updatedAt: r.updatedAt,
      // Re-sorted on read as well as on write, so a row cached by an older build still comes
      // out in position order.
      items: [...r.items].sort((a, b) => a.position - b.position),
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || compare(a.id, b.id));
}

/** D-0148 §1 §2: true when the cached `endedAt` must win over the queued one — the cached value
 *  is non-null and either the queued value is null, or both parse and the cached instant is
 *  STRICTLY later. An equal instant or an unparsable side keeps the queued value. */
function cachedFinishIsLater(cachedEnd: string | null, queuedEnd: string | null): boolean {
  if (cachedEnd === null) return false;
  if (queuedEnd === null) return true;
  const cached = Date.parse(cachedEnd);
  const queued = Date.parse(queuedEnd);
  if (Number.isNaN(cached) || Number.isNaN(queued)) return false;
  return cached > queued;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
