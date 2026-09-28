// The offline set/session queue (AC-C1–C4, AC-C18, D-0015, D-0020, D-0045 §6).
//
// One entry per `(user_id, client_id)` for sets, one per `id` for sessions (D-0045 §6). An edit
// replaces the entry in place (Dexie `.put()` on the natural key) and only ever bumps `edited_at`
// (never `completed_at`, D-0015). A delete is a tombstone sent through the same upsert, never a
// hard delete (D-0015, D-0045 §6).
import type { Database as SupabaseDatabase } from "@workoutlab/shared";
import { monotonicEditedAt } from "./clock.js";
import { offlineDb, setKey, type QueuedSet, type QueuedSession } from "./db.js";
import { currentUserId, requireUserId } from "./current-user.js";
import { ensurePersistentStorage } from "./persist.js";

export interface RecordSetInput {
  sessionId: string;
  exerciseId: string;
  setIndex: number;
  kind: "reps" | "timed";
  reps?: number | null;
  weightKg?: number | null;
  durationS?: number | null;
  rir?: number | null;
  isWarmup: boolean;
  backoff: boolean;
}

function toQueuedSet(row: {
  userId: string;
  clientId: string;
  sessionId: string;
  exerciseId: string;
  setIndex: number;
  kind: "reps" | "timed";
  reps: number | null;
  weightKg: number | null;
  durationS: number | null;
  rir: number | null;
  isWarmup: boolean;
  backoff: boolean;
  completedAt: string;
  editedAt: string;
  deletedAt: string | null;
}): QueuedSet {
  return { key: setKey(row.userId, row.clientId), status: "queued", ...row };
}

/** "Done set" (AC-C1). Resolves a UUID v4 `client_id` only after the IDB write has committed. */
export async function recordSet(
  input: RecordSetInput,
  options: { now?: Date } = {},
): Promise<QueuedSet> {
  const userId = requireUserId();
  const now = (options.now ?? new Date()).toISOString();
  const clientId = crypto.randomUUID();
  const entry = toQueuedSet({
    userId,
    clientId,
    sessionId: input.sessionId,
    exerciseId: input.exerciseId,
    setIndex: input.setIndex,
    kind: input.kind,
    reps: input.reps ?? null,
    weightKg: input.weightKg ?? null,
    durationS: input.durationS ?? null,
    rir: input.rir ?? null,
    isWarmup: input.isWarmup,
    backoff: input.backoff,
    completedAt: now,
    editedAt: now,
    deletedAt: null,
  });
  await offlineDb().sets.put(entry);
  return entry;
}

/** Looks a set up in the queue, or — for a set that already synced and is no longer queued —
 *  in the history cache, so `editSet`/`deleteSet` can still build a full row (AC-C2). */
async function findExistingSet(
  userId: string,
  clientId: string,
): Promise<Pick<
  QueuedSet,
  | "sessionId"
  | "exerciseId"
  | "setIndex"
  | "kind"
  | "reps"
  | "weightKg"
  | "durationS"
  | "rir"
  | "isWarmup"
  | "backoff"
  | "completedAt"
  | "editedAt"
> | null> {
  const db = offlineDb();
  const key = setKey(userId, clientId);
  const queued = await db.sets.get(key);
  if (queued) return queued;

  const cached = await db.historyCache.get(key);
  if (cached) {
    return {
      sessionId: cached.sessionId,
      exerciseId: cached.exerciseId,
      setIndex: 0,
      kind: cached.durationS !== null ? "timed" : "reps",
      reps: cached.reps,
      weightKg: cached.weightKg,
      durationS: cached.durationS,
      rir: null,
      isWarmup: cached.isWarmup,
      backoff: false,
      completedAt: cached.completedAt,
      editedAt: cached.editedAt,
    };
  }
  return null;
}

export type SetEdit = Partial<
  Pick<
    RecordSetInput,
    | "exerciseId"
    | "setIndex"
    | "kind"
    | "reps"
    | "weightKg"
    | "durationS"
    | "rir"
    | "isWarmup"
    | "backoff"
  >
>;

/** Edits a queued (or already-synced) set (AC-C2, AC-C4). Bumps only `edited_at`; `completed_at`
 *  never changes. The edit clock is monotonic (D-0045 §6): a device clock behind the set's own
 *  `edited_at` still produces a strictly newer one. */
export async function editSet(
  clientId: string,
  patch: SetEdit,
  options: { now?: Date } = {},
): Promise<QueuedSet> {
  const userId = requireUserId();
  const existing = await findExistingSet(userId, clientId);
  if (!existing) throw new Error(`editSet: unknown set ${clientId}`);

  const editedAt = monotonicEditedAt(options.now ?? new Date(), existing.editedAt);
  const entry = toQueuedSet({
    userId,
    clientId,
    sessionId: existing.sessionId,
    exerciseId: patch.exerciseId ?? existing.exerciseId,
    setIndex: patch.setIndex ?? existing.setIndex,
    kind: patch.kind ?? existing.kind,
    reps: patch.reps !== undefined ? patch.reps : existing.reps,
    weightKg: patch.weightKg !== undefined ? patch.weightKg : existing.weightKg,
    durationS: patch.durationS !== undefined ? patch.durationS : existing.durationS,
    rir: patch.rir !== undefined ? patch.rir : existing.rir,
    isWarmup: patch.isWarmup ?? existing.isWarmup,
    backoff: patch.backoff ?? existing.backoff,
    completedAt: existing.completedAt,
    editedAt,
    deletedAt: null,
  });
  await offlineDb().sets.put(entry);
  return entry;
}

/** Deletes a set: a tombstone through the same upsert (AC-C3, D-0015). Never calls `.delete()`. */
export async function deleteSet(
  clientId: string,
  options: { now?: Date } = {},
): Promise<QueuedSet> {
  const userId = requireUserId();
  const existing = await findExistingSet(userId, clientId);
  if (!existing) throw new Error(`deleteSet: unknown set ${clientId}`);

  const editedAt = monotonicEditedAt(options.now ?? new Date(), existing.editedAt);
  const entry = toQueuedSet({
    userId,
    clientId,
    sessionId: existing.sessionId,
    exerciseId: existing.exerciseId,
    setIndex: existing.setIndex,
    kind: existing.kind,
    reps: existing.reps,
    weightKg: existing.weightKg,
    durationS: existing.durationS,
    rir: existing.rir,
    isWarmup: existing.isWarmup,
    backoff: existing.backoff,
    completedAt: existing.completedAt,
    editedAt,
    deletedAt: editedAt,
  });
  await offlineDb().sets.put(entry);
  return entry;
}

export type SessionInsert = SupabaseDatabase["public"]["Tables"]["sessions"]["Insert"];

/** Queues a `sessions` upsert (`onConflict: 'id'`, D-0045 §6). Never replays `ended_at: null`
 *  after the session has already been queued finished once (D-0053 consequence): a later
 *  metadata-only edit to a finished session keeps `ended_at` from the finish. */
export async function upsertSession(row: SessionInsert): Promise<QueuedSession> {
  const userId = requireUserId();
  const db = offlineDb();
  const existing = await db.sessions.get(row.id as string);

  const alreadyFinished = existing?.finished ?? false;
  const nextRow: SessionInsert = alreadyFinished
    ? ({ ...row, ended_at: existing!.row.ended_at ?? null } satisfies SessionInsert)
    : row;
  const finished = alreadyFinished || row.ended_at != null;

  const entry: QueuedSession = { id: row.id as string, userId, row: nextRow, finished };
  await db.sessions.put(entry);

  if (row.ended_at != null && !alreadyFinished) {
    await ensurePersistentStorage(userId);
  }

  return entry;
}

/** The current queue counts, split by status (AC-C8, AC-C11). */
export async function syncStatus(): Promise<{
  queued: number;
  rejected: number;
  sessions: number;
}> {
  const userId = currentUserId();
  if (!userId) return { queued: 0, rejected: 0, sessions: 0 };
  const db = offlineDb();
  const [queued, rejected, sessions] = await Promise.all([
    db.sets.where({ userId, status: "queued" }).count(),
    db.sets.where({ userId, status: "rejected" }).count(),
    db.sessions.where({ userId }).count(),
  ]);
  return { queued, rejected, sessions };
}
