// Pure label helpers for UF-05.1 (D-0069 §5, D-0079 §5). No rule lives here: every number comes
// from a `rankSwaps` candidate, and this file only words it.
import type { SwapCandidate } from "@workoutlab/engine";
import { en } from "../../lib/i18n/en.js";

const EQUIPMENT_LABELS: Record<string, string> = en.uf05.equipment;

/** "{round(muscleMatch × 100)} % muscle match". */
export function matchText(candidate: SwapCandidate): string {
  return en.uf05.muscleMatch(Math.round(candidate.muscleMatch * 100));
}

/** "{ceil(timeCostS / 60)} min". */
export function minutesText(candidate: SwapCandidate): string {
  return en.uf05.minutes(Math.ceil(candidate.timeCostS / 60));
}

/** `[]` or `["none"]` reads "Bodyweight"; an unknown value prints as its raw id (D-0079 §5). */
export function equipmentText(equipment: readonly string[]): string {
  const real = equipment.filter((e) => e !== "none");
  if (real.length === 0) return en.uf05.bodyweight;
  return real.map((e) => EQUIPMENT_LABELS[e] ?? e).join(en.uf05.listSeparator);
}
