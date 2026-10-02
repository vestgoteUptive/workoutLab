// The cached cue for an exercise (T-0304b, T-0304f, D-0118 §8): read from the IndexedDB detail
// cache with no refresh (D-0111 §11). Shared by UF-09.3 and UF-09.6.
import { useEffect, useState } from "react";
import { loadExerciseDetail } from "../../lib/offline/index.js";

/** A missing detail, a `null` cue or a rejected read gives `null`; the read never delays a step,
 *  and a rejection is caught (no unhandled rejection). */
export function useCue(exerciseId: string): string | null {
  const [cue, setCue] = useState<{ id: string; text: string | null } | null>(null);
  useEffect(() => {
    let live = true;
    Promise.resolve()
      .then(() => loadExerciseDetail(exerciseId))
      .then(
        (detail) => {
          if (live) setCue({ id: exerciseId, text: detail?.cue ?? null });
        },
        () => undefined,
      );
    return () => {
      live = false;
    };
  }, [exerciseId]);
  return cue?.id === exerciseId ? cue.text : null;
}
