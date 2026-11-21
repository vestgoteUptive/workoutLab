// The effective library (D-0259 §15, T-0959; docs/specs/rir-progression-and-increments.md): the
// library with `incrementKg` replaced by the caller's `exercise_settings` override, per exercise.
// The web builds the same thing, so the server's back-off and pre-fill step equal the client's.
import { hasExternalLoad, type LibraryExercise } from "@workoutlab/shared";
import type { AuthContext } from "../_shared/auth.ts";
import { internalError } from "../_shared/errors.ts";

export interface ExerciseSettingRow {
  exercise_id: string;
  increment_kg: number;
}

/** Pure: replaces `incrementKg` where an override row exists for a loaded, non-timed exercise; every other exercise is returned
 * as is (same object). No rows gives the library unchanged. */
export function buildEffectiveLibrary(
  library: readonly LibraryExercise[],
  settings: readonly ExerciseSettingRow[],
): LibraryExercise[] {
  if (settings.length === 0) return [...library];
  const steps = new Map(settings.map((s) => [s.exercise_id, s.increment_kg]));
  return library.map((e) => {
    const step = steps.get(e.id);
    // Same guard as the web (T-0954): a timed or bodyweight exercise has no step to override.
    return step === undefined || !hasExternalLoad(e) ? e : { ...e, incrementKg: step };
  });
}

/** Reads the caller's `exercise_settings` with the caller's JWT client, so RLS returns only the
 * caller's own rows. A database error is the existing 500 shape, never a silent fallback to the
 * library step. */
export async function loadExerciseSettings(ctx: AuthContext): Promise<ExerciseSettingRow[]> {
  const { data, error } = await ctx.supabase
    .from("exercise_settings")
    .select("exercise_id, increment_kg");
  if (error) throw internalError();
  return data ?? [];
}
