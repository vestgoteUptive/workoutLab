// UF-08 Session setup (T-0303a). Exports the `/session/setup` host (D-0071 §3, D-0107 §1) and the
// focus-mode prefs UF-09 reads (T-0303d, D-0110 §6). T-0948 (D-0246 §16): `AddExerciseInWorkout`,
// the UF-09.10 sheet UF-09 loads lazily; no leaf entry (D-0170 §1).
export { SessionSetup } from "./SessionSetup.js";
export { AddExerciseInWorkout } from "./AddExerciseInWorkout.js";
export type { AddExerciseInWorkoutProps, AddInWorkoutResult } from "./AddExerciseInWorkout.js";
export { readFocusPrefs, writeFocusPrefs } from "./focus-prefs.js";
export type { FocusPrefs } from "./focus-prefs.js";
