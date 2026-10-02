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
import { roundWeightKg } from "./weight.js";

// D-0116 §1: each of the four queue writes tells the running sync handle that a row has been
// committed, so `startSync` can flush soon after an online enqueue. Module-internal on purpose:
// it is not in `index.ts`'s export list. Only `sync.ts` subscribes.
type QueueWriteListener = () => void;
const queueWriteListeners = new Set<QueueWriteListener>();

/** Subscribes to "a queue write has committed". Returns the unsubscribe. `sync.ts` only. */
export function onQueueWrite(listener: QueueWriteListener): () => void {
  queueWriteListeners.add(listener);
  return () => {
    queueWriteListeners.delete(listener);
  };
}

/** Called after the IndexedDB `put` has resolved (committed), never before and never on a
 *  failed write. A listener never throws into the write: the write's own promise resolves on the
 *  IDB commit alone and never waits for, or fails because of, a flush (NFR-OFF, D-0116 §1). */
function notifyQueueWrite(): void {
  for (const listener of queueWriteListeners) {
    try {
      listener();
    } catch {
      // A listener's failure is not the write's failure.
    }
  }
}

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
  // D-0129 §1: every entry `recordSet`/`editSet`/`deleteSet` writes (and returns) carries the
  // weight the `numeric(6,2)` column will store, whatever its source (pre-fill, stepper, carry,
  // or a legacy entry stored before T-0233).
  return {
    key: setKey(row.userId, row.clientId),
    status: "queued",
    ...row,
    weightKg: roundWeightKg(row.weightKg),
  };
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
  notifyQueueWrite();
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
  | "deletedAt"
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
      deletedAt: cached.deletedAt,
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
 *  `edited_at` still produces a strictly newer one.
 *
 *  A tombstoned set is rejected (D-0015): a delete is terminal. Writing `deletedAt: null` here
 *  would resurrect the set with a newer `edited_at`, which beats the tombstone at the engine's
 *  rule-0 tie-break, so the deleted set would silently count toward load again. */
export async function editSet(
  clientId: string,
  patch: SetEdit,
  options: { now?: Date } = {},
): Promise<QueuedSet> {
  const userId = requireUserId();
  const existing = await findExistingSet(userId, clientId);
  if (!existing) throw new Error(`editSet: unknown set ${clientId}`);
  if (existing.deletedAt !== null) {
    throw new Error(`editSet: set ${clientId} is deleted`);
  }

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
  notifyQueueWrite();
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
  notifyQueueWrite();
  return entry;
}

export type SessionInsert = SupabaseDatabase["public"]["Tables"]["sessions"]["Insert"];

/** Queues a `sessions` upsert (`onConflict: 'id'`, D-0045 §6). Never replays `ended_at: null`
 *  after the session has already been queued finished once (D-0053 §7): a later
 *  metadata-only edit to a finished session keeps `ended_at` from the finish.
 *
 *  The `finished` marker survives a successful flush, because `flushSessions` keeps the row and
 *  only clears `pending` (D-0053 §7). If the row were deleted on flush, this lookup would miss
 *  and the re-queued row would send `ended_at: null`, clearing the finish server-side. */
export async function upsertSession(row: SessionInsert): Promise<QueuedSession> {
  const userId = requireUserId();
  const db = offlineDb();
  const existing = await db.sessions.get(row.id as string);

  const alreadyFinished = existing?.finished ?? false;
  const nextRow: SessionInsert = alreadyFinished
    ? ({ ...row, ended_at: existing!.row.ended_at ?? null } satisfies SessionInsert)
    : row;
  const finished = alreadyFinished || row.ended_at != null;

  const entry: QueuedSession = {
    id: row.id as string,
    userId,
    row: nextRow,
    finished,
    pending: true,
  };
  await db.sessions.put(entry);
  notifyQueueWrite();

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
  const [queued, rejected, sessionRows] = await Promise.all([
    db.sets.where({ userId, status: "queued" }).count(),
    db.sets.where({ userId, status: "rejected" }).count(),
    // Only rows still waiting to be sent: a flushed session keeps its row (for `finished`,
    // D-0053 §7) with `pending: false` and must not be reported as queued.
    db.sessions.where({ userId }).toArray(),
  ]);
  return { queued, rejected, sessions: sessionRows.filter((s) => s.pending).length };
}
