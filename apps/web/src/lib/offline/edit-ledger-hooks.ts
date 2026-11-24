// T-1007 (D-0281 §4): the learning flag and reset epoch as a live read of the profile cache.
import { currentUserId } from "./current-user.js";
import { offlineDb } from "./db.js";
import { useLive } from "./exercise-list-hooks.js";

export interface LearnFlag {
  /** `profiles.learn_from_edits`; true when the cached profile has no value. */
  enabled: boolean;
  /** `profiles.learn_reset_at`; null when the cached profile has no value. */
  resetAt: string | null;
  /** False until the first cache read answers. */
  loaded: boolean;
}

const INITIAL = { enabled: true, resetAt: null as string | null };

export function useLearnFlag(userId: string | null | undefined = currentUserId()): LearnFlag {
  const { value, loaded } = useLive(
    userId,
    async (id) => {
      const row = await offlineDb().profileCache.get(id);
      return {
        enabled: row?.learning?.learnFromEdits ?? true,
        resetAt: row?.learning?.learnResetAt ?? null,
      };
    },
    INITIAL,
  );
  return { ...value, loaded };
}
