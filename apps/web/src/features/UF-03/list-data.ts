// UF-03.1 List view data (T-0416, D-0142 §3, D-0068 §4). IndexedDB only: the cached library and
// `loadEngineHistory()` (cache ∪ queue), never `refresh*` (D-0111 §11), so it reads the same
// offline. "Previous" is display data only: it never feeds a pre-fill (principle 3).
import { isHardSet, normalizeHistory } from "@workoutlab/engine";
import type { HistorySet, LibraryExercise } from "@workoutlab/shared";
import { loadEngineHistory, loadLibrary } from "../../lib/offline/index.js";

export interface ListData {
  library: readonly LibraryExercise[];
  history: readonly HistorySet[];
}

/** Both reads never reject: a failing read is an empty cache (every "Previous" reads "—"). */
export async function loadListData(): Promise<ListData> {
  const [library, history] = await Promise.all([
    loadLibrary().catch((): LibraryExercise[] => []),
    loadEngineHistory().catch((): HistorySet[] => []),
  ]);
  return { library, history };
}

/**
 * The hard sets of the most recent earlier session that has `exerciseId`, oldest first (D-0068 §4).
 * "Most recent" is the greatest `completedAt` among that exercise's hard sets; a tie goes to the
 * smaller `sessionId`. Warm-up sets, tombstones (`normalizeHistory`) and the running session's own
 * sets are left out. Pure.
 */
export function previousSets(
  data: ListData,
  exerciseId: string,
  currentSessionId: string,
): HistorySet[] {
  const exercise = data.library.find((e) => e.id === exerciseId);
  const sets = normalizeHistory(data.history).filter(
    (s) =>
      s.exerciseId === exerciseId && s.sessionId !== currentSessionId && isHardSet(s, exercise),
  );
  const latest = new Map<string, number>();
  for (const s of sets) {
    const at = Date.parse(s.completedAt);
    latest.set(s.sessionId, Math.max(latest.get(s.sessionId) ?? -Infinity, at));
  }
  let best: string | null = null;
  for (const [sessionId, at] of latest) {
    const bestAt = best === null ? -Infinity : latest.get(best)!;
    if (at > bestAt || (at === bestAt && best !== null && sessionId < best)) best = sessionId;
  }
  if (best === null) return [];
  return sets
    .filter((s) => s.sessionId === best)
    .sort(
      (a, b) =>
        Date.parse(a.completedAt) - Date.parse(b.completedAt) ||
        (a.clientId < b.clientId ? -1 : a.clientId > b.clientId ? 1 : 0),
    );
}
