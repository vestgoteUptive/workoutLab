// UF-08.2 row helpers (D-0109 §4). Pure lookups on the library the plan was built from. Weights
// are not formatted here: every kg value goes through `lib/format` `formatKg` (D-0114 §3, D-0124).
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
