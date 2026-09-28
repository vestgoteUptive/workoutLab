// Rule 0 (history normalisation), rule 1 (mapping) and rule 2 (hard sets).
import { instantMs } from "./time.js";
import { AREAS, type Area, type HistorySet, type LibraryExercise } from "./types.js";

/** True when `candidate` replaces `current` for the same `clientId` (rule 0, D-0034 §3). */
function beats(candidate: HistorySet, current: HistorySet): boolean {
  const c = instantMs(candidate.editedAt);
  const u = instantMs(current.editedAt);
  if (c !== u) return c > u;
  const cQueued = candidate.pending === true;
  const uQueued = current.pending === true;
  // Equal edited_at: a server row beats a queued row (mirrors the server's no-op, D-0015).
  if (cQueued !== uQueued) return !cQueued;
  // Both queued: a tombstone beats a live row.
  if (cQueued) {
    const cDead = candidate.deletedAt !== null;
    const uDead = current.deletedAt !== null;
    if (cDead !== uDead) return cDead;
  }
  // Otherwise the first row in input order wins.
  return false;
}

/**
 * Rule 0: history is server rows ∪ the offline queue. Dedupe by `clientId`, keeping the
 * greatest `editedAt` (ties per D-0034 §3), then drop tombstones (D-0015). The result keeps
 * the order in which each `clientId` first appears. Inputs are never mutated.
 */
export function normalizeHistory(history: readonly HistorySet[]): HistorySet[] {
  const winners = new Map<string, HistorySet>();
  for (const row of history) {
    const current = winners.get(row.clientId);
    if (current === undefined || beats(row, current)) winners.set(row.clientId, row);
  }
  const out: HistorySet[] = [];
  for (const row of winners.values()) {
    if (row.deletedAt === null) out.push(row);
  }
  return out;
}

/** Rule 1: the areas with weight 1.0, in the fixed order. */
export function primaryAreas(exercise: LibraryExercise): Area[] {
  return AREAS.filter((a) => exercise.areas[a] === 1);
}

/**
 * Rule 2 + D-0034 §4: a set counts as hard when it isn't a warm-up set, isn't tombstoned,
 * and its exercise is a known library exercise of kind `exercise` (warm-up moves and
 * exercises missing from a stale library add 0).
 */
export function isHardSet(set: HistorySet, exercise: LibraryExercise | undefined): boolean {
  return (
    !set.isWarmup &&
    set.deletedAt === null &&
    exercise !== undefined &&
    exercise.kind === "exercise"
  );
}

/** Library lookup by id; the first entry wins on a duplicate id. */
export function indexLibrary(library: readonly LibraryExercise[]): Map<string, LibraryExercise> {
  const byId = new Map<string, LibraryExercise>();
  for (const ex of library) if (!byId.has(ex.id)) byId.set(ex.id, ex);
  return byId;
}

/** The positive area weights of an exercise, in the fixed order. */
export function weightsOf(exercise: LibraryExercise): Array<[Area, number]> {
  const out: Array<[Area, number]> = [];
  for (const a of AREAS) {
    const w = exercise.areas[a];
    if (w !== undefined && w > 0) out.push([a, w]);
  }
  return out;
}
