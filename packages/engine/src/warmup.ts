// Rule 7.3 warm-up generator (D-0004, D-0024, D-0040 §2) and the rule 7.1 warm-up cost.
import { indexLibrary, primaryAreas, weightsOf } from "./history.js";
import type { Area, LibraryExercise, WarmupEntry } from "./types.js";

/** 4 moves × 40 s + 20 s get-ready, whatever the library holds (rule 7.1, D-0040 §2). */
export const WARMUP_COST_S = 180;
export const WARMUP_MOVES = 4;
export const WARMUP_MOVE_S = 40;

function byId(a: LibraryExercise, b: LibraryExercise): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Rule 7.3: go round-robin over the items' primary areas (session order, deduplicated),
 * taking the unused `kind: warmup` move with the highest weight for each area (ties by
 * id) and skipping areas with none left. Stop at 4. Fill with general moves (`areas: {}`)
 * by id, then any unused move by id. With fewer than 4 warm-up rows, all of them are used.
 */
export function generateWarmup(
  itemExerciseIds: readonly string[],
  library: readonly LibraryExercise[],
): WarmupEntry[] {
  const lib = indexLibrary(library);
  const moves = [...lib.values()].filter((e) => e.kind === "warmup").sort(byId);

  const areaList: Area[] = [];
  for (const id of itemExerciseIds) {
    const ex = lib.get(id);
    if (ex === undefined) continue;
    for (const a of primaryAreas(ex)) if (!areaList.includes(a)) areaList.push(a);
  }

  const used = new Set<string>();
  const picked: LibraryExercise[] = [];
  const take = (m: LibraryExercise): void => {
    used.add(m.id);
    picked.push(m);
  };

  let progress = true;
  while (picked.length < WARMUP_MOVES && progress) {
    progress = false;
    for (const area of areaList) {
      if (picked.length >= WARMUP_MOVES) break;
      let best: LibraryExercise | undefined;
      let bestW = 0;
      for (const m of moves) {
        if (used.has(m.id)) continue;
        const w = m.areas[area] ?? 0;
        // `moves` is id-sorted, so a strict `>` keeps the smaller id on a tie.
        if (w > bestW) {
          best = m;
          bestW = w;
        }
      }
      if (best !== undefined) {
        take(best);
        progress = true;
      }
    }
  }
  for (const m of moves) {
    if (picked.length >= WARMUP_MOVES) break;
    if (!used.has(m.id) && weightsOf(m).length === 0) take(m);
  }
  for (const m of moves) {
    if (picked.length >= WARMUP_MOVES) break;
    if (!used.has(m.id)) take(m);
  }
  return picked.map((m) => ({ exerciseId: m.id, durationS: WARMUP_MOVE_S }));
}
