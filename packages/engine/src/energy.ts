// Rule 7.4 energy helpers (UF-08.1, D-0024, D-0026, D-0040 §4, D-0047). Pure.

/** Default weight increment in kg when the library row has none (D-0026). */
export const DEFAULT_INCREMENT_KG = 2.5;
/** The back-off weight is `floorInc(BACKOFF_FACTOR × main weight)` (rule 7.4). */
export const BACKOFF_FACTOR = 0.9;
/** Low energy trims accessories from this many sets … */
export const LOW_TRIM_FROM_SETS = 3;
/** … to this many (rule 7.4). */
export const LOW_TRIM_TO_SETS = 2;

const round3 = (x: number): number => Math.round(x * 1000) / 1000;

/**
 * `floorInc(x) = floor(round3(x) / inc) × inc` (rule 14, D-0026). The quotient gets a
 * 1e-9 guard so float noise such as 0.3 / 0.1 = 2.9999… doesn't drop a whole step, and
 * the result is rounded to 3 decimals so it prints as the weight a person would load.
 */
export function floorInc(x: number, inc: number = DEFAULT_INCREMENT_KG): number {
  if (!Number.isFinite(x) || !Number.isFinite(inc) || inc <= 0) {
    throw new RangeError(`floorInc needs a finite x and a positive inc, got ${x}, ${inc}`);
  }
  return round3(Math.floor(round3(x) / inc + 1e-9) * inc);
}
