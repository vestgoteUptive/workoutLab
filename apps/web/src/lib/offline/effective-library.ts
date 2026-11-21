// T-0954 (D-0251, D-0259 §13): the "effective library": the cached library with the user's own
// weight step replacing `incrementKg` for that exercise. Every engine call (`suggest`, the
// pre-fill, `applySwap`, `insertItem`, `rankSwaps`) and the UF-09.4 stepper read this one array,
// so the pre-fill, the High-energy back-off and the stepper cannot disagree about the step.
import { hasExternalLoad, type LibraryExercise } from "@workoutlab/shared";

/** Pure: `library` with `incrementKg` replaced where `steps` has an override. A timed or
 *  bodyweight exercise (no external load) never takes one. Rows without an override are returned
 *  as the same objects. */
export function effectiveLibrary(
  library: readonly LibraryExercise[],
  steps: ReadonlyMap<string, number>,
): LibraryExercise[] {
  return library.map((exercise) => {
    const step = steps.get(exercise.id);
    if (step === undefined || !hasExternalLoad(exercise)) return exercise;
    return { ...exercise, incrementKg: step };
  });
}
