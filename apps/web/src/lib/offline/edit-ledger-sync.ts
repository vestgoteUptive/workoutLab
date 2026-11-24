// T-1008 (D-0281 §2, §4, UF-08.2, UF-11.4): syncs the on-device edit ledger through the account.
//
// Each device writes only its own `edit_signals` rows, as absolute values (`onConflict:
// user_id,device_id,key`), so a replay writes the same numbers and a signal is never counted
// twice. The total for a key is the sum over devices; `pullLedger` caches the rows for offline
// reads. Plain CRUD under RLS (D-0001). Every function here is background work: none throws, none
// renders anything, none waits on a set write (UF-09 shows one task, principle 1).
//
// Only `edit_signals` columns are sent: no exercise names, no free text. The only other table
// touched is `profiles`, and only for `learn_from_edits` / `learn_reset_at`, each write sending
// just the changed field (never a full cached profile upsert, T-1001 review).
import { supabase } from "../auth/client.js";
import { cacheGeneration, cacheWriteAllowed } from "./cache-generation.js";
import { currentUserId } from "./current-user.js";
import { offlineDb, userScopedKey, type CachedEditSignal } from "./db.js";
import {
  ackSynced,
  clearLocal,
  deviceId,
  dirtyEntries,
  pruneEntries,
  entries,
  loadLearning,
  onLedgerWrite,
  pending,
  setMemoryLearning,
  purgeResetNow,
  type PendingItem,
  type RemoteSignal,
} from "./edit-ledger.js";
import { afterReset, MAX_ENTRIES, windowOpen } from "./edit-ledger-rules.js";
import { refreshProfile } from "./history.js";
import { RetryScheduler } from "./retry.js";

const CONFLICT = "user_id,device_id,key";
const COLUMNS =
  "id,device_id,key,kind,exercise_id,to_exercise_id,count,window_start,last_seen,asked_at";
/** A short debounce after a counted signal (D-0281 §2). */
export const LEDGER_FLUSH_DEBOUNCE_MS = 1000;

export type LedgerFlushOutcome =
  "sent" | "empty" | "offline" | "off" | "signed-out" | "busy" | "error";
export type LedgerPullOutcome = "pulled" | "offline" | "off" | "signed-out" | "busy" | "error";
export type LedgerChangeResult = { ok: true } | { ok: false; reason: "offline" | "error" };

const isOnline = (): boolean => typeof navigator === "undefined" || navigator.onLine !== false;

/** A refusal no retry fixes (a check, or an exercise that no longer exists): the entry is
 *  cleaned instead of blocking the ones behind it. A count is a hint, not history (D-0281 §1).
 *  A not-null or type error (23502, 22P02) is a client bug: it is not listed, so it retries and
 *  shows up as an "error" outcome instead of vanishing. */
const isRejectable = (error: { code?: string }): boolean =>
  ["23514", "23503"].includes(error.code ?? "");

// ---------------------------------------------------------------- flush

/** How long a profile read counts as fresh before a flush with dirty entries (T-1008 review). */
export const PROFILE_FRESH_MS = 30_000;
let profileReadAt = 0;
/** Forces the next flush or pull to read the profile first (an `online` event, a failed run). */
export function invalidateLedgerProfile(): void {
  profileReadAt = 0;
}
/** Reads the profile unless a read is fresh, so a Forget or turn-off done on another device
 *  reaches this device before it sends anything. False when the read failed (send nothing). */
async function ensureProfile(): Promise<boolean> {
  if (!isOnline() || Date.now() - profileReadAt < PROFILE_FRESH_MS) return true;
  try {
    await refreshProfile();
    profileReadAt = Date.now();
    return true;
  } catch {
    return false;
  }
}

/** Bumped when Forget or turn-off starts and ends: a pull that began before drops its result. */
let changeGen = 0;

let inFlight: Promise<LedgerFlushOutcome> | null = null;
let rerun = false;
/** True while Forget or "turn learning off" deletes rows: no flush may write behind them. */
let changing = false;

async function flushOnce(): Promise<LedgerFlushOutcome> {
  const userId = currentUserId();
  if (!userId) return "signed-out";
  const prefs = await loadLearning(userId);
  if (!prefs.learnFromEdits) {
    await clearLocal(userId);
    return "off";
  }
  await purgeResetNow(userId);
  let dirty = await dirtyEntries(userId);
  if (dirty.length === 0) return "empty";
  if (!isOnline()) return "offline";
  if (!(await ensureProfile())) return "error";
  // The read may have turned learning off or moved the epoch: look again before sending.
  if (!(await loadLearning(userId)).learnFromEdits) {
    await clearLocal(userId);
    return "off";
  }
  await purgeResetNow(userId);
  dirty = await dirtyEntries(userId);
  if (dirty.length === 0) return "empty";
  const device = await deviceId(userId);
  if (!device) return "empty";
  let sent = 0;
  for (const e of dirty) {
    // A sign-out or a user switch while flushing: nothing more is sent for the old user.
    if (currentUserId() !== userId || changing) return changing ? "busy" : "signed-out";
    const now = await loadLearning(userId);
    if (!now.learnFromEdits) return "off";
    // Compare as instants, not strings: the server returns "+00:00" with microseconds (T-1008 re-review).
    if (afterReset([e], now.learnResetAt).length === 0) continue;
    const { error } = await supabase.from("edit_signals").upsert(
      {
        user_id: userId,
        device_id: device,
        key: e.key,
        kind: e.kind,
        exercise_id: e.exerciseId,
        to_exercise_id: e.toExerciseId,
        count: e.count,
        window_start: e.windowStart,
        last_seen: e.lastSeen,
        asked_at: e.askedAt,
      },
      { onConflict: CONFLICT },
    );
    if (error && !isRejectable(error)) return "error";
    if (error && import.meta.env.DEV) {
      console.warn("edit_signals row rejected, dropped from the outbox", error.code, e.key);
    }
    await ackSynced(e.key, e.lastSeen, { count: e.count, askedAt: e.askedAt }, userId);
    if (!error) sent += 1;
  }
  return sent > 0 ? "sent" : "empty";
}

/** Sends this device's dirty entries, one absolute upsert each. One flush at a time: a call made
 *  while one runs does not start a second; it asks for one more run after the first ends and
 *  resolves with that run's outcome. A failure leaves the entry dirty. Never rejects. */
export function flushLedger(): Promise<LedgerFlushOutcome> {
  if (changing) return Promise.resolve("busy");
  if (inFlight) {
    rerun = true;
    return inFlight;
  }
  const run = (async (): Promise<LedgerFlushOutcome> => {
    let outcome: LedgerFlushOutcome = "empty";
    try {
      do {
        rerun = false;
        outcome = await flushOnce();
        if (outcome === "error" || outcome === "signed-out") rerun = false;
      } while (rerun);
    } catch {
      outcome = "error";
    }
    // A failed run may mean the network is down while `onLine` says up: read the profile again
    // before the next send, so a Forget done elsewhere is seen first.
    if (outcome === "error") invalidateLedgerProfile();
    return outcome;
  })();
  inFlight = run;
  const clear = () => {
    if (inFlight === run) inFlight = null;
  };
  void run.then(clear, clear);
  return run;
}

// ---------------------------------------------------------------- pull

/** The cached `edit_signals` rows of this user (what the last pull read). */
export async function cachedRemoteRows(
  userId: string | null = currentUserId(),
): Promise<RemoteSignal[]> {
  if (!userId) return [];
  const rows = await offlineDb().editSignalsCache.where({ userId }).toArray();
  return rows.map((r) => ({
    device_id: r.row.device_id,
    key: r.row.key,
    kind: r.row.kind,
    exercise_id: r.row.exercise_id,
    to_exercise_id: r.row.to_exercise_id,
    count: r.row.count,
    window_start: r.row.window_start,
    last_seen: r.row.last_seen,
    asked_at: r.row.asked_at,
  }));
}

/** The prompts due now: this device's counts plus the cached rows of the account's other
 *  devices. Works offline (cached rows) and online alike. */
export async function pendingFromAccount(now: Date): Promise<PendingItem[]> {
  return pending(await cachedRemoteRows(), now);
}

/** One select of the user's rows, cached for offline reads; then cleanup (D-0281 §3): delete the
 *  rows whose window lapsed without an answer, and this device's rows beyond the cap. Online
 *  only. Never rejects. */
export async function pullLedger(now: Date = new Date()): Promise<LedgerPullOutcome> {
  const userId = currentUserId();
  if (!userId) return "signed-out";
  if (changing) return "busy";
  const startedChange = changeGen;
  const raced = (): boolean => changing || changeGen !== startedChange;
  try {
    const prefs = await loadLearning(userId);
    if (!prefs.learnFromEdits) {
      await offlineDb().editSignalsCache.where({ userId }).delete();
      return "off";
    }
    if (!isOnline()) return "offline";
    const gen = cacheGeneration();
    const { data, error } = await supabase
      .from("edit_signals")
      .select(COLUMNS)
      .eq("user_id", userId);
    if (error || !data) return "error";
    if (!cacheWriteAllowed(gen) || currentUserId() !== userId) return "signed-out";
    if (raced()) return "busy";

    const rows = data as unknown as CachedEditSignal["row"][];
    const mine = await deviceId(userId);
    const lapsed = rows.filter((r) => r.asked_at === null && !windowOpen(r.window_start, now));
    const live = rows.filter((r) => !lapsed.includes(r));
    const own = live
      .filter((r) => r.device_id === mine)
      .sort((a, b) => a.last_seen.localeCompare(b.last_seen));
    const overCap = own.slice(0, Math.max(0, own.length - MAX_ENTRIES));
    const doomed = [...lapsed, ...overCap];
    let deleted = new Set<string>();
    if (doomed.length > 0) {
      const res = await supabase
        .from("edit_signals")
        .delete()
        .eq("user_id", userId)
        .in(
          "id",
          doomed.map((r) => r.id),
        );
      // A failed cleanup is retried by the next pull; the rows stay cached (and a lapsed one
      // counts 0 in the total anyway).
      if (!res.error) deleted = new Set(doomed.map((r) => r.id));
      if (!res.error) {
        const gone = doomed.filter((r) => r.device_id === mine);
        // This device's own lapsed or over-cap entry goes locally too, but only the very
        // window that was deleted (a newer one counted since stays) and never an answered one.
        await pruneEntries(userId, await localDroppable(userId, gone));
      }
    }
    const kept = rows.filter((r) => !deleted.has(r.id));
    const db = offlineDb();
    await db.transaction("rw", db.editSignalsCache, async () => {
      if (!cacheWriteAllowed(gen) || raced()) return;
      await db.editSignalsCache.where({ userId }).delete();
      await db.editSignalsCache.bulkPut(
        kept.map((row) => ({
          key: userScopedKey(userId, [row.device_id, row.key].join("|")),
          userId,
          row,
        })),
      );
    });
    return raced() ? "busy" : "pulled";
  } catch {
    return "error";
  }
}

/** Of the deleted rows, the keys of local entries that may go: the same window, no answer. */
async function localDroppable(
  userId: string,
  gone: { key: string; window_start: string }[],
): Promise<string[]> {
  const mine = new Map((await entries()).map((e) => [e.key, e]));
  return gone
    .filter((g) => {
      const e = mine.get(g.key);
      return e !== undefined && e.askedAt === null && e.windowStart === g.window_start;
    })
    .map((g) => g.key)
    .filter(() => currentUserId() === userId);
}

/** A flush then a pull: what UF-08.2 does on mount. Never rejects. */
export async function syncLedgerNow(): Promise<void> {
  // Profile first, like the start trigger: a Forget done elsewhere is seen before any send.
  if (!(await ensureProfile())) return;
  await flushLedger();
  await pullLedger();
}

// ---------------------------------------------------------------- forget / learning off

async function patchCachedLearning(
  userId: string,
  patch: { learnFromEdits?: boolean; learnResetAt?: string | null },
): Promise<void> {
  const db = offlineDb();
  const row = await db.profileCache.get(userId);
  if (!row) {
    // No cached profile to patch: remember it in memory until a profile read succeeds.
    setMemoryLearning(userId, patch);
    return;
  }
  await db.profileCache.put({
    ...row,
    learning: { ...(row.learning ?? { learnFromEdits: true, learnResetAt: null }), ...patch },
  });
}

async function deleteAllRows(userId: string): Promise<boolean> {
  const { error } = await supabase.from("edit_signals").delete().eq("user_id", userId);
  return !error;
}

async function changeLearning(
  write: (userId: string) => Promise<{ ok: boolean; resetAt: string | null }>,
  after: (userId: string, resetAt: string | null) => Promise<void>,
): Promise<LedgerChangeResult> {
  const userId = currentUserId();
  if (!userId) return { ok: false, reason: "error" };
  if (!isOnline()) return { ok: false, reason: "offline" };
  changing = true;
  changeGen += 1;
  try {
    await inFlight?.catch(() => undefined);
    if (!(await deleteAllRows(userId))) return { ok: false, reason: "error" };
    // If this write fails the deletes above stay done: the counts are gone and the flag or
    // epoch is unchanged, so the user sees an error and can try again (a hint, not history).
    const written = await write(userId);
    if (!written.ok) return { ok: false, reason: "error" };
    await after(userId, written.resetAt);
    return { ok: true };
  } catch {
    return { ok: false, reason: "error" };
  } finally {
    changing = false;
    changeGen += 1;
  }
}

async function clearDevice(userId: string): Promise<void> {
  await clearLocal(userId);
  await offlineDb().editSignalsCache.where({ userId }).delete();
}

/** "Forget what was counted" (D-0281 §4): delete all of the user's rows, then touch
 *  `learn_reset_at` (the only field written). A failed step reports an error and does nothing
 *  after it; offline changes nothing. */
export function forgetAll(): Promise<LedgerChangeResult> {
  return changeLearning(
    async (userId) => {
      // The server stamps the epoch itself; the device caches that value, not its own clock.
      const { data, error } = await supabase
        .from("profiles")
        .update({ learn_reset_at: new Date().toISOString() })
        .eq("user_id", userId)
        .select("learn_reset_at")
        .single();
      return { ok: !error, resetAt: data?.learn_reset_at ?? null };
    },
    async (userId, resetAt) => {
      await clearDevice(userId);
      if (resetAt !== null) await patchCachedLearning(userId, { learnResetAt: resetAt });
      await refreshProfile().catch(() => undefined);
    },
  );
}

/** Turns learning off (D-0281 §4): delete the rows, then write `learn_from_edits = false` (the
 *  only field written). A failed step reports an error and leaves the flag as it was. */
export function turnLearningOff(): Promise<LedgerChangeResult> {
  return changeLearning(
    async (userId) => {
      const { data, error } = await supabase
        .from("profiles")
        .update({ learn_from_edits: false })
        .eq("user_id", userId)
        .select("learn_reset_at")
        .single();
      return { ok: !error, resetAt: data?.learn_reset_at ?? null };
    },
    async (userId, resetAt) => {
      await clearDevice(userId);
      await patchCachedLearning(userId, {
        learnFromEdits: false,
        ...(resetAt !== null ? { learnResetAt: resetAt } : {}),
      });
      await refreshProfile().catch(() => undefined);
    },
  );
}

// ---------------------------------------------------------------- triggers

export interface LedgerSyncHandle {
  /** Flush then pull now (UF-08.2 mount). */
  syncNow: () => Promise<void>;
  /** Resolves when every run this handle started has ended. */
  settled: () => Promise<void>;
  stop: () => void;
}

/** App start, the `online` event and a debounce after a counted signal. A failed run backs off
 *  like the set queue (`RetryScheduler`, 2 s doubling to 300 s). At start and on `online`, the
 *  profile is read first, so a device that was offline during Forget drops its older entries
 *  before anything is sent; if that read fails nothing is sent and the run is retried. */
export function startLedgerSync(): LedgerSyncHandle {
  let signalOnly = false;
  invalidateLedgerProfile(); // the start trigger reads the profile first
  const scheduler = new RetryScheduler(async () => {
    if (!currentUserId()) return "empty";
    if (!(await ensureProfile())) return "network-error";
    const flushed = await flushLedger();
    if (flushed === "error") return "network-error"; // flushLedger already invalidated the profile
    if (!signalOnly && (await pullLedger()) === "error") return "network-error";
    return flushed === "sent" ? "flushed" : "empty";
  });

  let tracked: Promise<void> = Promise.resolve();
  const run = (onlySignal: boolean): Promise<void> => {
    signalOnly = onlySignal;
    const work = scheduler.runNow().catch(() => undefined);
    tracked = tracked.then(() => work);
    return work;
  };

  let debounce: ReturnType<typeof setTimeout> | null = null;
  const unsubscribe = onLedgerWrite(() => {
    if (!isOnline()) return;
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      debounce = null;
      void run(true);
    }, LEDGER_FLUSH_DEBOUNCE_MS);
  });
  const onOnline = () => {
    invalidateLedgerProfile();
    void run(false);
  };
  window.addEventListener("online", onOnline);
  if (isOnline()) void run(false);

  return {
    syncNow: () => run(false),
    settled: async () => {
      let prev: Promise<void> | null = null;
      while (prev !== tracked) {
        prev = tracked;
        await tracked;
      }
    },
    stop: () => {
      if (debounce) clearTimeout(debounce);
      debounce = null;
      unsubscribe();
      window.removeEventListener("online", onOnline);
      scheduler.stop();
    },
  };
}
