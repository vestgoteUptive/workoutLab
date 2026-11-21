// T-0976 (D-0261, D-0263 §7): the one-side how-to line for UF-04.2. The lane does not own
// `lib/i18n/flows`, so the strings live here until T-0974's shared `per-side` module exists.
import type { Unilateral } from "@workoutlab/shared";

export function oneSideHowTo(unit: Unilateral, timed: boolean): string {
  if (timed) return "Hold one side, then switch. Log seconds for one side.";
  const both = unit === "side" ? "sides" : `${unit}s`;
  return `Do all reps on one ${unit}, then switch. Log reps for one ${unit}. One set covers both ${both}. Log RIR for your weaker side.`;
}
