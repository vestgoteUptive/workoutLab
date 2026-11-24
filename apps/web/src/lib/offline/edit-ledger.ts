// T-1007 (D-0281 §2, D-0277, UF-08.2, UF-11.4): the on-device edit ledger. A signal is counted
// here first, instantly, online or offline; T-1008 syncs the dirty entries later. Nothing in this
// file calls the network: the flag and the reset epoch come from the profile cache, the
// favorites and exclusions from their caches.
import type { SwapReason } from "@workoutlab/shared";
import { cacheGeneration, cacheWriteAllowed } from "./cache-generation.js";
import { currentUserId } from "./current-user.js";
import { offlineDb, userScopedKey, type LedgerMeta, type StoredLedgerEntry } from "./db.js";
import {
  afterReset,
  applySignal,
  computePending,
  isCountedReason,
  ledgerKey,
  overCap,
  parseLedgerKey,
  type LedgerEntry,
  type PendingItem,
  type RemoteSignal,
} from "./edit-ledger-rules.js";

export type { LedgerEntry, PendingItem, RemoteSignal } from "./edit-ledger-rules.js";

export interface LearningState {
  learnFromEdits: boolean;
  learnResetAt: string | null;
}

/** The learning flag and reset epoch of the cached profile. A missing profile, or one cached
 *  before T-1001, means learning on and no epoch (D-0281 §6). Never rejects. */
export async function loadLearning(
  userId: string | null = currentUserId(),
): Promise<LearningState> {
  const on: LearningState = { learnFromEdits: true, learnResetAt: null };
  if (!userId) return on;
  try {
    const row = await offlineDb().profileCache.get(userId);
    return {
      learnFromEdits: row?.learning?.learnFromEdits ?? true,
      learnResetAt: row?.learning?.learnResetAt ?? null,
    };
  } catch {
    return on;
  }
}

const toEntry = (r: StoredLedgerEntry): LedgerEntry => ({
  key: r.ledgerKey,
  kind: r.kind,
  exerciseId: r.exerciseId,
  toExerciseId: r.toExerciseId,
  count: r.count,
  windowStart: r.windowStart,
  lastSeen: r.lastSeen,
  askedAt: r.askedAt,
  dirty: r.dirty,
  visits: [...r.visits],
});

const toRow = (userId: string, e: LedgerEntry): StoredLedgerEntry => ({
  key: userScopedKey(userId, e.key),
  userId,
  ledgerKey: e.key,
  kind: e.kind,
  exerciseId: e.exerciseId,
  toExerciseId: e.toExerciseId,
  count: e.count,
  windowStart: e.windowStart,
  lastSeen: e.lastSeen,
  askedAt: e.askedAt,
  dirty: e.dirty,
  visits: [...e.visits],
});

/** Deletes the entries at or before the reset epoch (never dirty again). Inside a transaction. */
async function purgeReset(userId: string, resetAt: string | null): Promise<void> {
  if (resetAt === null) return;
  const db = offlineDb();
  const rows = await db.editLedger.where({ userId }).toArray();
  const keep = new Set(afterReset(rows, resetAt).map((r) => r.key));
  const drop = rows.filter((r) => !keep.has(r.key)).map((r) => r.key);
  if (drop.length > 0) await db.editLedger.bulkDelete(drop);
}

/** Writes one entry (create or update) in a transaction; false when nothing was written. */
async function writeEntry(
  prefsOf: LearningState,
  userId: string,
  update: (prev: LedgerEntry | undefined) => LedgerEntry | null,
  keyOf: string,
): Promise<boolean> {
  const db = offlineDb();
  const gen = cacheGeneration();
  let wrote = false;
  await db.transaction("rw", db.editLedger, db.editLedgerMeta, async () => {
    if (!cacheWriteAllowed(gen)) return;
    await purgeReset(userId, prefsOf.learnResetAt);
    const prevRow = await db.editLedger.get(userScopedKey(userId, keyOf));
    const next = update(prevRow ? toEntry(prevRow) : undefined);
    if (!next) return;
    if (!(await db.editLedgerMeta.get(userId))) {
      const meta: LedgerMeta = { userId, deviceId: crypto.randomUUID() };
      await db.editLedgerMeta.put(meta);
    }
    await db.editLedger.put(toRow(userId, next));
    const all = (await db.editLedger.where({ userId }).toArray()).map(toEntry);
    const drop = overCap(all, next.key).map((k) => userScopedKey(userId, k));
    if (drop.length > 0) await db.editLedger.bulkDelete(drop);
    wrote = true;
  });
  return wrote;
}

async function record(
  kind: "swap" | "removal",
  exerciseId: string,
  toExerciseId: string | null,
  visitId: string,
  now: Date,
): Promise<boolean> {
  const userId = currentUserId();
  if (!userId) return false;
  const prefs = await loadLearning(userId);
  if (!prefs.learnFromEdits) {
    // Learning off (D-0281 §4): nothing is written and what is there goes.
    await clearLocal(userId);
    return false;
  }
  const key = ledgerKey(kind, exerciseId, toExerciseId ?? undefined);
  return writeEntry(
    prefs,
    userId,
    (prev) => {
      const next = applySignal(prev, { kind, exerciseId, toExerciseId, visitId }, now);
      return next === prev ? null : next;
    },
    key,
  );
}

/** Counts a swap of `from` for `to` (UF-08.3, UF-05.1). Only reason none or "discomfort" counts;
 *  once per pair per visit. Resolves true when a count was written. */
export async function recordSwap(
  from: string,
  to: string,
  reason: SwapReason | "none" | null,
  visitId: string,
  now: Date,
): Promise<boolean> {
  if (!isCountedReason(reason) || from === to) return false;
  return record("swap", from, to, visitId, now);
}

/** Counts a Remove of an exercise on UF-08.6. This is the only removal that counts: "Not today",
 *  the stepper's remove and a time-dropped exercise have no counterpart here (D-0277). */
export async function recordRemoval(
  exerciseId: string,
  visitId: string,
  now: Date,
): Promise<boolean> {
  return record("removal", exerciseId, null, visitId, now);
}

/** Marks a key as answered for good (yes or no). Creates a count-0 mark when the device has no
 *  entry for it (a prompt raised by another device's rows). */
export async function markAsked(key: string, now: Date): Promise<boolean> {
  const userId = currentUserId();
  const parsed = parseLedgerKey(key);
  if (!userId || !parsed) return false;
  const prefs = await loadLearning(userId);
  if (!prefs.learnFromEdits) return false;
  const iso = now.toISOString();
  return writeEntry(
    prefs,
    userId,
    (prev) =>
      prev
        ? { ...prev, askedAt: iso, dirty: true }
        : {
            key,
            ...parsed,
            count: 0,
            windowStart: iso,
            lastSeen: iso,
            askedAt: iso,
            dirty: true,
            visits: [],
          },
    key,
  );
}

/** This user's entries on this device, oldest `lastSeen` first, reset epoch applied. */
export async function entries(): Promise<LedgerEntry[]> {
  const userId = currentUserId();
  if (!userId) return [];
  const prefs = await loadLearning(userId);
  if (!prefs.learnFromEdits) return [];
  const rows = await offlineDb().editLedger.where({ userId }).toArray();
  return afterReset(rows.map(toEntry), prefs.learnResetAt).sort((a, b) =>
    a.lastSeen.localeCompare(b.lastSeen),
  );
}

/** The prompts due now: this device's counts plus `remoteRows` (the cached `edit_signals` rows
 *  of the account), see `computePending`. Reads favorites and exclusions from their caches. */
export async function pending(remoteRows: RemoteSignal[], now: Date): Promise<PendingItem[]> {
  const userId = currentUserId();
  if (!userId) return [];
  const prefs = await loadLearning(userId);
  if (!prefs.learnFromEdits) return [];
  const db = offlineDb();
  const [rows, meta, fav, exc] = await Promise.all([
    db.editLedger.where({ userId }).toArray(),
    db.editLedgerMeta.get(userId),
    db.favoriteCache.where({ userId }).toArray(),
    db.excludedCache.where({ userId }).toArray(),
  ]);
  return computePending({
    entries: rows.map(toEntry),
    remote: remoteRows,
    deviceId: meta?.deviceId ?? null,
    now,
    resetAt: prefs.learnResetAt,
    favoriteIds: new Set(fav.map((r) => r.exerciseId)),
    excludedIds: new Set(exc.map((r) => r.exerciseId)),
  });
}

/** This device's id for the user, or null before the first signal (T-1008 sends it). */
export async function deviceId(userId: string | null = currentUserId()): Promise<string | null> {
  if (!userId) return null;
  return (await offlineDb().editLedgerMeta.get(userId))?.deviceId ?? null;
}

/** Empties the ledger and forgets the device id (a new one is made at the next signal). Only
 *  this user's rows go. Unsynced counts are dropped without asking (D-0281 §5). */
export async function clearLocal(userId: string | null = currentUserId()): Promise<void> {
  if (!userId) return;
  const db = offlineDb();
  await db.transaction("rw", db.editLedger, db.editLedgerMeta, async () => {
    await db.editLedger.where({ userId }).delete();
    await db.editLedgerMeta.delete(userId);
  });
}
