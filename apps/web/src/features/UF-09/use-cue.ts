// The cached cue for an exercise (T-0304b, T-0304f, D-0118 §8): read from the IndexedDB detail
// cache with no refresh (D-0111 §11). Shared by UF-09.3 and UF-09.6.
import { useEffect, useState } from "react";
import { toUnilateral, type Unilateral } from "@workoutlab/shared";
import { loadExerciseDetail } from "../../lib/offline/index.js";

export interface CachedFields {
  cue: string | null;
  /** The one-side word from the cached detail (T-0974, D-0263 §3); null reads as both sides. */
  unilateral: Unilateral | null;
}

/** A missing detail, a `null` cue or a rejected read gives `null`; the read never delays a step,
 *  and a rejection is caught (no unhandled rejection). */
export function useCachedFields(exerciseId: string): CachedFields {
  const [fields, setFields] = useState<(CachedFields & { id: string }) | null>(null);
  useEffect(() => {
    let live = true;
    Promise.resolve()
      .then(() => loadExerciseDetail(exerciseId))
      .then(
        (detail) => {
          if (live)
            setFields({
              id: exerciseId,
              cue: detail?.cue ?? null,
              unilateral: toUnilateral(detail),
            });
        },
        () => undefined,
      );
    return () => {
      live = false;
    };
  }, [exerciseId]);
  return fields?.id === exerciseId ? fields : { cue: null, unilateral: null };
}

export function useCue(exerciseId: string): string | null {
  return useCachedFields(exerciseId).cue;
}
