// Rule 16: estimated one-rep max per exercise (UF-06.2, D-0254, D-0255, D-0258). Pure and
// display-only: suggest, balance, timeCheck, rankSwaps, prefill and records never import this
// module, and it never imports records.ts (T-0961 AC8).
import { indexLibrary, isHardSet, normalizeHistory } from "./history.js";
import { instantMs } from "./time.js";
import type { HistorySet, Instant, LibraryExercise } from "./types.js";

/** One chart point: the best valid set of one session (rule 16). `e1rm` is unrounded. */
export interface E1rmPoint {
  sessionId: string;
  clientId: string;
  completedAt: Instant;
  weightKg: number;
  reps: number;
  e1rm: number;
}

/** Highest rep count that gives an estimate (D-0254). */
export const E1RM_MAX_REPS = 10;

interface Cand {
  set: HistorySet;
  /** `weightKg × (30 + reps)`: compared instead of the e1RM so ties are exact (D-0258 §2). */
  score: number;
  ms: number;
}

/** True when `a` ranks above `b`: higher score, then earlier completedAt, then smaller clientId. */
function better(a: Cand, b: Cand): boolean {
  if (a.score !== b.score) return a.score > b.score;
  if (a.ms !== b.ms) return a.ms < b.ms;
  return a.set.clientId < b.set.clientId;
}

function validLoad(set: HistorySet): set is HistorySet & { weightKg: number; reps: number } {
  const { weightKg: w, reps: r } = set;
  return (
    typeof w === "number" &&
    Number.isFinite(w) &&
    w > 0 &&
    typeof r === "number" &&
    Number.isInteger(r) &&
    r >= 1 &&
    r <= E1RM_MAX_REPS
  );
}

/**
 * Rule 16: the estimated 1RM points of `exerciseId`, oldest first (completedAt, then clientId),
 * one per session. Plain Epley `weightKg × (30 + reps) / 30` at every rep count. Unknown, timed,
 * bodyweight and warm-up-move exercises give `[]`.
 */
export function estimatedOneRepMax(
  history: readonly HistorySet[],
  library: readonly LibraryExercise[],
  exerciseId: string,
): E1rmPoint[] {
  const ex = indexLibrary(library).get(exerciseId);
  if (ex === undefined || ex.timed || !ex.externalLoad) return [];
  const bests = new Map<string, Cand>();
  for (const set of normalizeHistory(history)) {
    if (set.exerciseId !== exerciseId || !isHardSet(set, ex) || !validLoad(set)) continue;
    const cand: Cand = {
      set,
      score: set.weightKg * (30 + set.reps),
      ms: instantMs(set.completedAt),
    };
    if (!Number.isFinite(cand.ms)) continue;
    const cur = bests.get(set.sessionId);
    if (cur === undefined || better(cand, cur)) bests.set(set.sessionId, cand);
  }
  return [...bests.values()]
    .sort((a, b) =>
      a.ms !== b.ms
        ? a.ms - b.ms
        : a.set.clientId < b.set.clientId
          ? -1
          : a.set.clientId > b.set.clientId
            ? 1
            : 0,
    )
    .map(({ set, score }) => ({
      sessionId: set.sessionId,
      clientId: set.clientId,
      completedAt: set.completedAt,
      weightKg: set.weightKg as number,
      reps: set.reps as number,
      e1rm: score / 30,
    }));
}
