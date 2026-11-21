// T-0954 (D-0251): live reads of the weight-step store, for UF-04.2 (T-0956) and anything that
// shows the step.
import { useCallback } from "react";
import {
  dismissExerciseSettingError,
  loadExerciseSettingErrors,
  readExerciseSteps,
  type ExerciseSettingRejection,
} from "./exercise-settings.js";
import { useLive } from "./exercise-list-hooks.js";

const NO_STEPS: ReadonlyMap<string, number> = new Map();
const NO_ERRORS: ExerciseSettingRejection[] = [];

/** The user's own steps by exercise id; `loaded` is false until the first read answers. */
export function useExerciseSteps(userId: string | null | undefined): {
  steps: ReadonlyMap<string, number>;
  loaded: boolean;
} {
  const { value, loaded } = useLive(userId, readExerciseSteps, NO_STEPS);
  return { steps: value, loaded };
}

/** Rejected writes (the device value was reverted) and a way to dismiss one. */
export function useExerciseSettingErrors(userId: string | null | undefined): {
  errors: ExerciseSettingRejection[];
  dismiss: (exerciseId: string) => Promise<void>;
} {
  const { value } = useLive(userId, loadExerciseSettingErrors, NO_ERRORS);
  const dismiss = useCallback(
    (exerciseId: string) =>
      userId ? dismissExerciseSettingError(userId, exerciseId) : Promise.resolve(),
    [userId],
  );
  return { errors: value, dismiss };
}
