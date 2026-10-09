// Drain helper (T-0594, D-0211): how much of the lift colour is left over the rest. Pure, no clock.
// The caller owns time; this file must not read one (AC4 scans the source).

/** clamp(0, elapsed / total, 1) × 100, rounded to one decimal. A zero total counts as done. */
export function drainPercent(elapsedS: number, totalS: number): number {
  if (!(totalS > 0)) return 100;
  const ratio = Math.min(1, Math.max(0, elapsedS / totalS));
  return Math.round(ratio * 1000) / 10;
}

/** Inline style that feeds `.wl-drain`. */
export function drainStyle(percent: number): { "--wl-drain": string } {
  return { "--wl-drain": `${percent}%` };
}
