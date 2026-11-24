// T-0692 (D-0269): test-local library rows and the matrix shared by the rule 7.2 step 1 tests.
import type { Energy, LibraryExercise, SessionInput } from "@workoutlab/engine";
import { L1, WARMUPS, input } from "./common.js";

/** Test-local bodyweight compounds (T-0692 "L1+"); never added to the shared L1. */
export const ARCHER_PUSH_UP: LibraryExercise = {
  id: "archer-push-up",
  name: "Archer Push Up",
  kind: "exercise",
  type: "compound",
  level: "beginner",
  equipment: [],
  areas: { chest: 1, shoulders: 0.5, arms: 0.5 },
  timed: false,
  defaultDurationS: null,
  incrementKg: null,
  externalLoad: false,
};
export const BIRD_DOG: LibraryExercise = {
  id: "bird-dog",
  name: "Bird Dog",
  kind: "exercise",
  type: "compound",
  level: "beginner",
  equipment: [],
  areas: { back: 1, core: 0.5, glutes: 0.5 },
  timed: false,
  defaultDurationS: null,
  incrementKg: null,
  externalLoad: false,
};

/**
 * A test-local bodyweight isolation (never a main lift), added to the golden library only: it
 * shares shoulders with the loaded lateral-raise and sorts first by id, so a loaded-first sort in
 * step 3 (greedy) would change the golden (planted fault F3).
 */
export const ANGEL_RAISE: LibraryExercise = {
  id: "angel-raise",
  name: "Angel Raise",
  kind: "exercise",
  type: "isolation",
  level: "beginner",
  equipment: [],
  areas: { shoulders: 1 },
  timed: false,
  defaultDurationS: null,
  incrementKg: null,
  externalLoad: false,
};

export const L1_PLUS: LibraryExercise[] = [...L1, ARCHER_PUSH_UP, BIRD_DOG];
export const LIBRARY_PLUS: LibraryExercise[] = [...L1_PLUS, ...WARMUPS];
/** L1+ minus every bodyweight compound, plus one bodyweight isolation: the rule changes nothing here (AC7 b). */
export const L1_LOADED_ONLY: LibraryExercise[] = L1_PLUS.filter(
  (e) => !(e.type === "compound" && !e.externalLoad),
);
export const LIBRARY_LOADED_ONLY: LibraryExercise[] = [...L1_LOADED_ONLY, ANGEL_RAISE, ...WARMUPS];

export const BUDGETS = Array.from({ length: 22 }, (_, i) => 15 + 5 * i);
export const ENERGIES: readonly Energy[] = ["low", "normal", "high"];
export const SHUFFLES = [0, 1, 2, 3, 4, 5, 6];

/** Every grid point: budgets 15..120 step 5 × warm-up × energy × shuffle 0..6. */
export function* grid(): Generator<SessionInput> {
  for (const budgetMin of BUDGETS) {
    for (const warmupInBudget of [true, false]) {
      for (const energy of ENERGIES) {
        for (const shuffle of SHUFFLES) yield input({ budgetMin, warmupInBudget, energy, shuffle });
      }
    }
  }
}
