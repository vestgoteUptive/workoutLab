// Sync: sends queued sessions, then queued sets, to Supabase (D-0045 §6, AC-C5–C12, AC-C17).
//
// Order: sessions (`onConflict: 'id'`) resolve before the first `session_sets` upsert. Sets are
// sent sorted by `edited_at` ascending, in batches of at most 100. A `23503` (FK, the session
// hasn't landed yet) or a `401`/JWT-expired response keeps every row in that batch queued; after
// a 401 the next flush waits for `SIGNED_IN`/`TOKEN_REFRESHED` (AC-C8). A `23514`/`23502`/`22P02`
// retries the batch row by row and marks each failing row `rejected` (AC-C11): rejected rows stay
// in IDB, are never retried automatically, and still reach the engine as `pending`. A network
// `TypeError` schedules a backoff retry (AC-C10); it never touches rejected-vs-queued state.
import { supabase } from "../auth/client.js";
import { offlineDb, type QueuedSession, type QueuedSet } from "./db.js";

const BATCH_SIZE = 100;

export type FlushOutcome = "flushed" | "empty" | "blocked-auth" | "network-error";

interface PostgrestErrorLike {
  code?: string;
  status?: number;
  message?: string;
}

function isAuthError(error: PostgrestErrorLike | null | undefined, status?: number): boolean {
  if (status === 401) return true;
  if (!error) return false;
  return error.code === "PGRST301" || error.message?.toLowerCase().includes("jwt") === true;
}

function isForeignKeyError(error: PostgrestErrorLike | null | undefined): boolean {
  return error?.code === "23503";
}

/** Codes that mean "this row's data is invalid, not merely delayed" (AC-C11). */
function isRejectable(error: PostgrestErrorLike | null | undefined): boolean {
  return error?.code === "23514" || error?.code === "23502" || error?.code === "22P02";
}

function toSetRow(set: QueuedSet) {
  return {
    user_id: set.userId,
    client_id: set.clientId,
    session_id: set.sessionId,
    exercise_id: set.exerciseId,
    set_index: set.setIndex,
    kind: set.kind,
    reps: set.reps,
    weight_kg: set.weightKg,
    duration_s: set.durationS,
    rir: set.rir,
    is_warmup: set.isWarmup,
    backoff: set.backoff,
    completed_at: set.completedAt,
    edited_at: set.editedAt,
    deleted_at: set.deletedAt,
  };
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Blocked by a prior 401 until `SIGNED_IN`/`TOKEN_REFRESHED` fires (AC-C8), per user. */
const authBlocked = new Set<string>();

export function markAuthBlocked(userId: string): void {
  authBlocked.add(userId);
}

export function clearAuthBlocked(userId: string): void {
  authBlocked.delete(userId);
}

async function flushSessions(userId: string): Promise<{ ok: boolean; sentAny: boolean }> {
  const db = offlineDb();
  // Only rows still waiting to be sent. Rows already sent stay in IDB with `pending: false`
  // so their `finished` marker outlives the send (D-0053 §7, see `QueuedSession.finished`).
  const all = await db.sessions.where({ userId }).toArray();
  const queued = all.filter((q) => q.pending);
  if (queued.length === 0) return { ok: true, sentAny: false };

  const rows = queued.map((q) => q.row);
  const { error, status } = await supabase.from("sessions").upsert(rows, { onConflict: "id" });
  if (error) {
    if (isAuthError(error, status)) markAuthBlocked(userId);
    return { ok: false, sentAny: false };
  }
  // Never `bulkDelete` here: deleting the row would destroy the only record that the session was
  // ever finished, and a later `upsertSession({id, ended_at: null})` would then clear the finish
  // server-side (D-0053 §7, silent data loss).
  //
  // Only clear `pending` on an entry that is still the one that was sent (T-0385, the session
  // counterpart of the sets' AC-C6 guard). `upsertSession` can re-queue the same id while this
  // request is in flight (a Finish during a D-0116 enqueue flush). Writing the pre-request
  // snapshot back would overwrite that newer row with the old one and `pending: false`, so the
  // newer row (and its `finished` marker, D-0053 §7) would never be sent. Read-compare-write in
  // one rw transaction, so no `upsertSession` can land between the check and the put; a changed
  // entry stays `pending` and the next flush sends it.
  await db.transaction("rw", db.sessions, async () => {
    for (const sent of queued) {
      const current = await db.sessions.get(sent.id);
      if (!current || !sameQueuedSession(current, sent)) continue;
      await db.sessions.put({ ...current, pending: false });
    }
  });
  return { ok: true, sentAny: true };
}

const objectToString = Object.prototype.toString;

function tagOf(value: object): string {
  return objectToString.call(value);
}

/** A plain object: `{}`-like, prototype `Object.prototype` or `null`. Checked by shape rather
 *  than identity, so an object cloned in another realm (IndexedDB's structured clone) still
 *  counts. */
function isPlainObject(value: object): boolean {
  if (tagOf(value) !== "[object Object]") return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === null || Object.getPrototypeOf(proto) === null;
}

function definedKeys(record: Record<string, unknown>): string[] {
  return Object.keys(record).filter((k) => record[k] !== undefined);
}

function sameValueUnsafe(a: unknown, b: unknown): boolean {
  if (a === b) return typeof a !== "function";
  if (typeof a === "number" && typeof b === "number") return Number.isNaN(a) && Number.isNaN(b);
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) if (!sameValueUnsafe(a[i], b[i])) return false;
    return true;
  }

  const tag = tagOf(a);
  if (tag !== tagOf(b)) return false;

  if (tag === "[object Date]") {
    const ta = Date.prototype.getTime.call(a);
    const tb = Date.prototype.getTime.call(b);
    return ta === tb || (Number.isNaN(ta) && Number.isNaN(tb));
  }
  if (tag === "[object Map]") {
    const ma = a as Map<unknown, unknown>;
    const mb = b as Map<unknown, unknown>;
    const sizeA = Reflect.get(Map.prototype, "size", ma) as number;
    if (sizeA !== (Reflect.get(Map.prototype, "size", mb) as number)) return false;
    const ea = [...Map.prototype.entries.call(ma)];
    const eb = [...Map.prototype.entries.call(mb)];
    return ea.every(([k, v], i) => sameValueUnsafe(k, eb[i]![0]) && sameValueUnsafe(v, eb[i]![1]));
  }
  if (tag === "[object Set]") {
    const sa = a as Set<unknown>;
    const sb = b as Set<unknown>;
    const sizeA = Reflect.get(Set.prototype, "size", sa) as number;
    if (sizeA !== (Reflect.get(Set.prototype, "size", sb) as number)) return false;
    const va = [...Set.prototype.values.call(sa)];
    const vb = [...Set.prototype.values.call(sb)];
    return va.every((v, i) => sameValueUnsafe(v, vb[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ra = a as Record<string, unknown>;
    const rb = b as Record<string, unknown>;
    const ka = definedKeys(ra);
    const kb = definedKeys(rb);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => rb[k] !== undefined && sameValueUnsafe(ra[k], rb[k]));
  }
  // Class instances, typed arrays, anything else: not provably equal, so not equal. The entry
  // stays `pending` and the next flush sends it again (the upsert is idempotent, T-0411).
  return false;
}

/** Structural equality for queued rows (T-0411). Unlike a JSON compare it tells apart values
 *  JSON flattens (`Date`, `Map`, `Set`, `NaN`, `±Infinity`). Primitives compare with `===`
 *  plus `NaN` equals `NaN` (so `0` equals `-0`); plain objects ignore key order and treat a
 *  missing key as `undefined`. Anything it can't prove equal is different. Never throws (a cycle
 *  or a spoofed tag compares as different). */
export function sameValue(a: unknown, b: unknown): boolean {
  try {
    return sameValueUnsafe(a, b);
  } catch {
    return false;
  }
}

/** True when the stored entry is still exactly what this flush sent: same row, same `finished`,
 *  still pending. */
function sameQueuedSession(current: QueuedSession, sent: QueuedSession): boolean {
  return (
    current.pending &&
    current.userId === sent.userId &&
    current.finished === sent.finished &&
    sameValue(current.row, sent.row)
  );
}

/** Sends one batch; on a rejectable error, retries row by row and marks failures `rejected`
 *  (AC-C11). Returns the set of keys that were successfully synced (safe to remove from IDB). */
interface SyncedEntry {
  key: string;
  /** The `edited_at` that was actually sent for this key, so the caller only removes it when
   *  the row hasn't been edited again since (D-0045 §6: "removes only the entries whose stored
   *  `edited_at` is ≤ the `edited_at` it sent", AC-C6). */
  sentEditedAt: string;
}

async function sendSetBatch(batch: QueuedSet[]): Promise<{
  synced: SyncedEntry[];
  authBlockedUser: string | null;
  fkFailed: boolean;
}> {
  const db = offlineDb();
  const { error, status } = await supabase
    .from("session_sets")
    .upsert(batch.map(toSetRow), { onConflict: "user_id,client_id" });

  if (!error) {
    return {
      synced: batch.map((s) => ({ key: s.key, sentEditedAt: s.editedAt })),
      authBlockedUser: null,
      fkFailed: false,
    };
  }
  if (isAuthError(error, status)) {
    return { synced: [], authBlockedUser: batch[0]!.userId, fkFailed: false };
  }
  if (isForeignKeyError(error)) {
    return { synced: [], authBlockedUser: null, fkFailed: true };
  }
  if (!isRejectable(error)) {
    // An error this module doesn't recognise: keep every row queued (never lose a set).
    return { synced: [], authBlockedUser: null, fkFailed: false };
  }

  // Row by row (AC-C11).
  const synced: SyncedEntry[] = [];
  for (const row of batch) {
    const { error: rowError, status: rowStatus } = await supabase
      .from("session_sets")
      .upsert([toSetRow(row)], { onConflict: "user_id,client_id" });
    if (!rowError) {
      synced.push({ key: row.key, sentEditedAt: row.editedAt });
      continue;
    }
    if (isAuthError(rowError, rowStatus)) {
      return { synced, authBlockedUser: row.userId, fkFailed: false };
    }
    if (isForeignKeyError(rowError)) {
      continue; // stays queued, retried on the next flush
    }
    if (isRejectable(rowError)) {
      await db.sets.update(row.key, { status: "rejected" });
    }
    // else: keep queued, unrecognised error.
  }
  return { synced, authBlockedUser: null, fkFailed: false };
}

/** Removes only entries whose *current* stored `edited_at` is still ≤ what was sent (D-0045 §6,
 *  AC-C6): an edit that landed while the request was in flight must survive. */
async function removeSyncedIfNotReedited(synced: SyncedEntry[]): Promise<boolean> {
  if (synced.length === 0) return false;
  const db = offlineDb();
  let removedAny = false;
  await db.transaction("rw", db.sets, async () => {
    for (const { key, sentEditedAt } of synced) {
      const current = await db.sets.get(key);
      if (!current) continue;
      if (current.editedAt <= sentEditedAt) {
        await db.sets.delete(key);
        removedAny = true;
      }
    }
  });
  return removedAny;
}

async function flushSets(userId: string): Promise<{ sentAny: boolean }> {
  const db = offlineDb();
  const queued = await db.sets.where({ userId, status: "queued" }).sortBy("editedAt");
  if (queued.length === 0) return { sentAny: false };

  let sentAny = false;
  for (const batch of chunk(queued, BATCH_SIZE)) {
    const { synced, authBlockedUser, fkFailed } = await sendSetBatch(batch);
    const removedAny = await removeSyncedIfNotReedited(synced);
    if (removedAny) sentAny = true;
    if (authBlockedUser) {
      markAuthBlocked(authBlockedUser);
      break;
    }
    if (fkFailed) {
      // Sessions go first on the *next* flush; stop this one (D-0045 §6).
      break;
    }
  }
  return { sentAny };
}

export interface FlushHooks {
  onSynced?: () => void | Promise<void>;
}

/** Runs one flush attempt for the signed-in user. Never throws for expected failures (auth, FK,
 *  rejected rows); a network `TypeError` propagates so the retry scheduler (`retry.ts`) can back
 *  off (AC-C10). */
export async function flush(userId: string, hooks: FlushHooks = {}): Promise<FlushOutcome> {
  if (authBlocked.has(userId)) return "blocked-auth";

  try {
    const sessionResult = await flushSessions(userId);
    const setResult = await flushSets(userId);
    const sentAny = sessionResult.sentAny || setResult.sentAny;
    if (sentAny && hooks.onSynced) await hooks.onSynced();
    return sentAny ? "flushed" : "empty";
  } catch (err) {
    if (err instanceof TypeError) return "network-error";
    throw err;
  }
}
