// T-1007 (D-0277, D-0281, docs/specs/learn-from-edits.md): the pure rules of the edit ledger.
// No IndexedDB, no clock, no network: the store (`edit-ledger.ts`) feeds these functions.
import type { SwapReason } from "@workoutlab/shared";

export const WINDOW_DAYS = 60;
export const SWAP_THRESHOLD = 3;
export const REMOVAL_THRESHOLD = 2;
export const MAX_ENTRIES = 200;
/** Visit ids kept per entry (enough to tell "same visit" without growing for ever). */
export const MAX_VISITS = 20;
/** The `count` column is checked between 0 and 999 (D-0281 §1). */
export const MAX_COUNT = 999;

const DAY_MS = 86_400_000;

export type SignalKind = "swap" | "removal";

/** One ledger entry, as the device holds it (the server row of this device, plus `dirty` and
 *  `visits`). Times are ISO strings. */
export interface LedgerEntry {
  key: string;
  kind: SignalKind;
  exerciseId: string;
  toExerciseId: string | null;
  count: number;
  windowStart: string;
  lastSeen: string;
  askedAt: string | null;
  /** True while this device's numbers have not reached the account (T-1008 clears it). */
  dirty: boolean;
  /** The latest visits (or workouts) that counted, so one visit counts once. */
  visits: string[];
}

/** The columns of an `edit_signals` row that the total reads (D-0281 §2). */
export interface RemoteSignal {
  device_id: string;
  key: string;
  kind: string;
  exercise_id: string;
  to_exercise_id: string | null;
  count: number;
  window_start: string;
  last_seen: string;
  asked_at: string | null;
}

export interface PendingItem {
  key: string;
  kind: SignalKind;
  exerciseId: string;
  toExerciseId: string | null;
  /** The sum across devices, window rules applied. */
  total: number;
  /** Earliest window start among the contributing rows (the "oldest first" order). */
  since: string;
}

/** A swap is counted only for no reason or "discomfort": the other reasons are about today. */
export function isCountedReason(reason: SwapReason | "none" | null): boolean {
  return reason === null || reason === "none" || reason === "discomfort";
}

/** The ledger key, equal to `edit_signals.key` (D-0281 §1). */
export function ledgerKey(kind: SignalKind, exerciseId: string, toExerciseId?: string): string {
  return kind === "swap"
    ? ["swap", exerciseId, toExerciseId ?? ""].join(":")
    : ["removal", exerciseId].join(":");
}

/** The inverse of `ledgerKey`, or null for a key that isn't one. */
export function parseLedgerKey(
  key: string,
): { kind: SignalKind; exerciseId: string; toExerciseId: string | null } | null {
  const parts = key.split(":");
  if (parts[0] === "swap" && parts.length === 3 && parts[1] && parts[2]) {
    return { kind: "swap", exerciseId: parts[1], toExerciseId: parts[2] };
  }
  if (parts[0] === "removal" && parts.length === 2 && parts[1]) {
    return { kind: "removal", exerciseId: parts[1], toExerciseId: null };
  }
  return null;
}

export const thresholdOf = (kind: SignalKind): number =>
  kind === "swap" ? SWAP_THRESHOLD : REMOVAL_THRESHOLD;

const ms = (iso: string): number => new Date(iso).getTime();

/** A window is open for 60 days from its first signal (day 60 itself still counts). */
export function windowOpen(windowStart: string, now: Date): boolean {
  return now.getTime() - ms(windowStart) <= WINDOW_DAYS * DAY_MS;
}

/** Drops entries whose `lastSeen` is at or before the reset epoch (D-0281 §4). */
export function afterReset<T extends { lastSeen: string }>(rows: T[], resetAt: string | null): T[] {
  if (resetAt === null) return rows;
  const epoch = ms(resetAt);
  return rows.filter((r) => ms(r.lastSeen) > epoch);
}

/** Counts one signal. Returns the same object when the visit already counted for this key. */
export function applySignal(
  prev: LedgerEntry | undefined,
  signal: {
    kind: SignalKind;
    exerciseId: string;
    toExerciseId: string | null;
    visitId: string;
  },
  now: Date,
): LedgerEntry {
  const iso = now.toISOString();
  const key = ledgerKey(signal.kind, signal.exerciseId, signal.toExerciseId ?? undefined);
  if (!prev) {
    return {
      key,
      kind: signal.kind,
      exerciseId: signal.exerciseId,
      toExerciseId: signal.toExerciseId,
      count: 1,
      windowStart: iso,
      lastSeen: iso,
      askedAt: null,
      dirty: true,
      visits: [signal.visitId],
    };
  }
  if (prev.visits.includes(signal.visitId)) return prev;
  // An "asked" mark with no count has no window of its own: the first signal opens one.
  const restart = prev.count === 0 || !windowOpen(prev.windowStart, now);
  const lastSeen = ms(iso) > ms(prev.lastSeen) ? iso : prev.lastSeen;
  return {
    ...prev,
    count: restart ? 1 : Math.min(prev.count + 1, MAX_COUNT),
    windowStart: restart ? iso : prev.windowStart,
    lastSeen,
    dirty: true,
    visits: [...prev.visits, signal.visitId].slice(-MAX_VISITS),
  };
}

/** The oldest entries beyond the cap, by `lastSeen` (never `keep`, the one just written). */
export function overCap(entries: LedgerEntry[], keep: string): string[] {
  const extra = entries.length - MAX_ENTRIES;
  if (extra <= 0) return [];
  return entries
    .filter((e) => e.key !== keep)
    .sort((a, b) => ms(a.lastSeen) - ms(b.lastSeen) || a.key.localeCompare(b.key))
    .slice(0, extra)
    .map((e) => e.key);
}

/**
 * The prompts due (D-0281 §2): per key, this device's count plus the counts of other devices'
 * rows, each only while its window is open and its `lastSeen` is after the reset epoch. A key is
 * never pending once asked (here or on any device), nor when the swap-in is already a favorite
 * or excluded, or the removed exercise is already excluded. Oldest first.
 */
export function computePending(input: {
  entries: LedgerEntry[];
  remote: RemoteSignal[];
  /** This device's id; its own rows in `remote` are ignored (the local entry is newer). */
  deviceId: string | null;
  now: Date;
  resetAt: string | null;
  favoriteIds: ReadonlySet<string>;
  excludedIds: ReadonlySet<string>;
}): PendingItem[] {
  const { now, resetAt, favoriteIds, excludedIds } = input;
  const groups = new Map<
    string,
    {
      kind: SignalKind;
      exerciseId: string;
      toExerciseId: string | null;
      total: number;
      since: string | null;
      asked: boolean;
    }
  >();
  const group = (key: string, kind: SignalKind, exerciseId: string, to: string | null) => {
    let g = groups.get(key);
    if (!g) {
      g = { kind, exerciseId, toExerciseId: to, total: 0, since: null, asked: false };
      groups.set(key, g);
    }
    return g;
  };
  const add = (
    g: { total: number; since: string | null },
    count: number,
    windowStart: string,
  ): void => {
    g.total += count;
    if (count > 0 && (g.since === null || ms(windowStart) < ms(g.since))) g.since = windowStart;
  };

  for (const e of afterReset(input.entries, resetAt)) {
    const g = group(e.key, e.kind, e.exerciseId, e.toExerciseId);
    if (e.askedAt !== null) g.asked = true;
    if (windowOpen(e.windowStart, now)) add(g, e.count, e.windowStart);
  }
  const remote = input.remote
    .filter((r) => r.device_id !== input.deviceId)
    .map((r) => ({ r, lastSeen: r.last_seen }));
  for (const { r } of afterReset(remote, resetAt)) {
    const parsed = parseLedgerKey(r.key);
    if (!parsed) continue;
    const g = group(r.key, parsed.kind, parsed.exerciseId, parsed.toExerciseId);
    if (r.asked_at !== null) g.asked = true;
    if (windowOpen(r.window_start, now)) add(g, r.count, r.window_start);
  }

  const out: PendingItem[] = [];
  for (const [key, g] of groups) {
    if (g.asked || g.since === null || g.total < thresholdOf(g.kind)) continue;
    if (g.kind === "swap") {
      if (favoriteIds.has(g.toExerciseId ?? "") || excludedIds.has(g.toExerciseId ?? "")) continue;
    } else if (excludedIds.has(g.exerciseId)) continue;
    out.push({
      key,
      kind: g.kind,
      exerciseId: g.exerciseId,
      toExerciseId: g.toExerciseId,
      total: g.total,
      since: g.since,
    });
  }
  return out.sort((a, b) => ms(a.since) - ms(b.since) || a.key.localeCompare(b.key));
}
