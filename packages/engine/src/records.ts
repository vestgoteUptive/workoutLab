// Rule 15: records (UF-02.1, D-0219 with the owner amendment H-36). Pure and display-only:
// suggest, balance, timeCheck, rankSwaps and prefill never import this module (T-0635 AC11).
import { indexLibrary, isHardSet, normalizeHistory } from "./history.js";
import { instantMs } from "./time.js";
import type { HistorySet, Instant, LibraryExercise } from "./types.js";

/** The set a record beat: the best hard set of an earlier other session (rule 15). */
export interface RecordPrevious {
  weightKg: number | null;
  reps: number | null;
  durationS: number | null;
}

/** One record: a session's best set that strictly beats every earlier other-session set. */
export interface RecordSet {
  exerciseId: string;
  sessionId: string;
  clientId: string;
  completedAt: Instant;
  weightKg: number | null;
  reps: number | null;
  durationS: number | null;
  previous: RecordPrevious;
}

/**
 * Rule 15 key, compared lexicographically. Timed: `[0, durationS]`. Weighted (weight > 0):
 * `[1, 30 × e1RM]` with Epley `e1RM = w × (1 + reps / 30)`, kept as `w × (30 + reps)` so equal
 * e1RMs compare equal without a division. Bodyweight (weight 0): `[0, reps]`, so any loaded set
 * beats any bodyweight set (R15-E9).
 */
export function recordKey(set: HistorySet, timed: boolean): readonly [number, number] {
  if (timed) return [0, set.durationS ?? 0];
  const w = set.weightKg ?? 0;
  const r = set.reps ?? 0;
  return w > 0 ? [1, w * (30 + r)] : [0, r];
}

function compareKey(a: readonly [number, number], b: readonly [number, number]): number {
  return a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1];
}

interface Keyed {
  set: HistorySet;
  key: readonly [number, number];
  ms: number;
}

/** True when `a` ranks above `b`: higher key, then earlier completedAt, then smaller clientId. */
function better(a: Keyed, b: Keyed): boolean {
  const c = compareKey(a.key, b.key);
  if (c !== 0) return c > 0;
  if (a.ms !== b.ms) return a.ms < b.ms;
  return a.set.clientId < b.set.clientId;
}

/** Rule 15 (D-0219): the record sets in `history`, sorted by completedAt, then clientId. */
export function records(
  history: readonly HistorySet[],
  library: readonly LibraryExercise[],
): RecordSet[] {
  const lib = indexLibrary(library);
  const byExercise = new Map<string, Keyed[]>();
  for (const set of normalizeHistory(history)) {
    const ex = lib.get(set.exerciseId);
    if (ex === undefined || !isHardSet(set, ex)) continue;
    const list = byExercise.get(set.exerciseId) ?? [];
    list.push({ set, key: recordKey(set, ex.timed), ms: instantMs(set.completedAt) });
    byExercise.set(set.exerciseId, list);
  }

  const out: Array<{ ms: number; record: RecordSet }> = [];
  for (const sets of byExercise.values()) {
    const bests = new Map<string, Keyed>();
    for (const k of sets) {
      const cur = bests.get(k.set.sessionId);
      if (cur === undefined || better(k, cur)) bests.set(k.set.sessionId, k);
    }
    for (const b of bests.values()) {
      let prev: Keyed | null = null;
      for (const e of sets) {
        if (e.set.sessionId === b.set.sessionId || e.ms >= b.ms) continue;
        if (prev === null || better(e, prev)) prev = e;
      }
      if (prev === null || compareKey(b.key, prev.key) <= 0) continue;
      const s = b.set;
      out.push({
        ms: b.ms,
        record: {
          exerciseId: s.exerciseId,
          sessionId: s.sessionId,
          clientId: s.clientId,
          completedAt: s.completedAt,
          weightKg: s.weightKg,
          reps: s.reps,
          durationS: s.durationS,
          previous: {
            weightKg: prev.set.weightKg,
            reps: prev.set.reps,
            durationS: prev.set.durationS,
          },
        },
      });
    }
  }
  out.sort((a, b) =>
    a.ms !== b.ms
      ? a.ms - b.ms
      : a.record.clientId < b.record.clientId
        ? -1
        : a.record.clientId > b.record.clientId
          ? 1
          : 0,
  );
  return out.map((o) => o.record);
}
