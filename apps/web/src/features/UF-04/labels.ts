// Pure label helpers for UF-04 (D-0079 §2, §5). No rule lives here: the primary areas and the
// set cost come from `@workoutlab/engine`, this file only names and orders what it returns.
import { primaryAreas, type LibraryExercise } from "@workoutlab/engine";
import { AREAS, type Area } from "@workoutlab/shared";
import { en } from "../../lib/i18n/en.js";

const EQUIPMENT_LABELS: Record<string, string> = en.uf04.equipment;
const TYPE_LABELS: Record<string, string> = en.uf04.types;
const LEVEL_LABELS: Record<string, string> = en.uf04.levels;

export function areaName(area: Area): string {
  return en.bodyMap.areas[area];
}

/** Weight 1 areas, in the fixed order (engine rule 1). */
export function primaryAreaNames(exercise: LibraryExercise): string[] {
  return primaryAreas(exercise).map(areaName);
}

/** Weight 0.5 areas, in the fixed order (D-0079 §2). */
export function secondaryAreaNames(exercise: LibraryExercise): string[] {
  return AREAS.filter((a) => exercise.areas[a] === 0.5).map(areaName);
}

/** `[]` or `["none"]` reads "Bodyweight"; an unknown value prints as its raw id (D-0079 §5). */
export function equipmentText(exercise: LibraryExercise): string {
  const real = exercise.equipment.filter((e) => e !== "none");
  if (real.length === 0) return en.uf04.bodyweight;
  return real.map((e) => EQUIPMENT_LABELS[e] ?? e).join(en.uf04.listSeparator);
}

export function typeText(exercise: LibraryExercise): string {
  return TYPE_LABELS[exercise.type] ?? exercise.type;
}

export function levelText(exercise: LibraryExercise): string {
  return LEVEL_LABELS[exercise.level] ?? exercise.level;
}

export function tagLine(exercise: LibraryExercise): string {
  return en.uf04.tagLine(typeText(exercise), levelText(exercise), equipmentText(exercise));
}

/** `165` → `2:45`. */
export function formatSeconds(totalS: number): string {
  const m = Math.floor(totalS / 60);
  const s = totalS % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
