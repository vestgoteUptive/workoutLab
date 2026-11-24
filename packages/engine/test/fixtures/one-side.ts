// T-0978b (D-0268): fixtures for the rule 7.1 one-side time model.
import type { LibraryExercise } from "../../src/index.js";
import { L1, LIBRARY } from "./common.js";

/** `ex` with the flag set to `value` (a stray value is cast: old data could carry one). */
export function flagged(ex: LibraryExercise, value: unknown): LibraryExercise {
  return { ...ex, unilateral: value as "arm" | "leg" | "side" | null };
}

/** Library `lib` with the listed rows flagged (`value`), the rest unchanged. */
export function withFlag(
  lib: readonly LibraryExercise[],
  ids: readonly string[],
  value: unknown,
): LibraryExercise[] {
  return lib.map((e) => (ids.includes(e.id) ? flagged(e, value) : e));
}

/** L1-ONE: L1 with `db-row` (arm) and `plank` (timed, 45 s, side) flagged; plus the warm-ups. */
export const L1_ONE: LibraryExercise[] = withFlag(LIBRARY, ["db-row", "plank"], "arm").map((e) =>
  e.id === "plank" ? flagged(e, "side") : e,
);

/** L1 with the flag set to `value` on every exercise row (not the warm-ups). */
export function allFlagged(value: unknown): LibraryExercise[] {
  const l1 = new Set(L1.map((e) => e.id));
  return LIBRARY.map((e) => (l1.has(e.id) ? flagged(e, value) : e));
}

/** The flag as stored on a row (for the independent formula). */
export function flagOf(ex: LibraryExercise): unknown {
  return ex.unilateral;
}

/** True only for the three strings the engine accepts. */
export function oneSide(ex: LibraryExercise): boolean {
  const f = flagOf(ex);
  return f === "arm" || f === "leg" || f === "side";
}

/** Rule 7.1, written out: sets × (work + rest) + 60, with the work doubled for a flagged row. */
export function itemFormula(ex: LibraryExercise, sets: number, durationS?: number | null): number {
  const side = ex.timed ? (durationS ?? ex.defaultDurationS ?? 45) : 45;
  const work = oneSide(ex) ? 2 * side : side;
  const rest = ex.type === "compound" ? 120 : 60;
  return sets * (work + rest) + 60;
}
