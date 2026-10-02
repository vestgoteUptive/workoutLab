// UF-08.2 row helpers (D-0109 §4). Pure lookups on the library the plan was built from, and the
// weight number. The weight is the one fractional number on this screen, so it goes through
// `Intl.NumberFormat(locale)` (NFR-I18N-2, D-0114 §3), never a raw template literal.
import type { LibraryExercise } from "@workoutlab/shared";

export type LibraryLookup = readonly Pick<LibraryExercise, "id" | "name" | "externalLoad">[];

/** The library `name`, falling back to the `exerciseId`. */
export function exerciseName(exerciseId: string, library: LibraryLookup): string {
  return library.find((e) => e.id === exerciseId)?.name ?? exerciseId;
}

/** True when the library says the exercise carries no external load. */
export function isBodyweight(exerciseId: string, library: LibraryLookup): boolean {
  return library.find((e) => e.id === exerciseId)?.externalLoad === false;
}

/** 77.5 → "77.5" (en-GB), "77,5" (sv-SE). Up to 2 decimals (D-0109 §4). */
export function weightText(weightKg: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(weightKg);
}
