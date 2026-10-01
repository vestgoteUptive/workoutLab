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
 *  sent yet, or it was sent after the cache was filled. Every `QueuedSession` counts, `pending`
 *  or not — a flushed row keeps its entry (it carries the D-0053 §7 `finished` marker), and
 *  dropping the non-pending ones would hide a just-finished session until the next refresh.
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
    byId.set(entry.id, {
      id: entry.id,
      startedAt: row.started_at,
      // A finished session must never appear unfinished again (D-0053 §7): the queue's
      // `ended_at` is already guarded by `upsertSession`, and the cached row is the fallback.
      endedAt: row.ended_at ?? previous?.endedAt ?? null,
      timeBudgetMin: row.time_budget_min,
      effortRating: row.effort_rating ?? previous?.effortRating ?? null,
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

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
