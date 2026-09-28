// Wires the flush/backoff/auth triggers together (AC-C8, AC-C10, AC-C17). `startSync()` is
// called once, from a signed-in route only (never from `/welcome`'s first render, principle 5).
import { supabase } from "../auth/client.js";
import { clearAuthBlocked, flush } from "./flush.js";
import { RetryScheduler } from "./retry.js";
import { refreshHistory, refreshLibrary, refreshTargets, refreshProfile } from "./history.js";
import { currentUserId } from "./current-user.js";

/** One refetch each of history, targets and profile after a flush that sent ≥ 1 row (AC-C17). */
async function refetchAfterFlush(tz: string): Promise<void> {
  await Promise.all([
    refreshHistory(new Date(), tz),
    refreshTargets(),
    refreshProfile(),
    refreshLibrary(),
  ]);
}

export interface SyncHandle {
  flushNow: () => Promise<void>;
  stop: () => void;
}

/** Starts the online/auth-state-driven flush loop. Returns a handle to flush on demand and to
 *  tear everything down (e.g. on unmount in tests). */
export function startSync(options: { tz: string }): SyncHandle {
  const scheduler = new RetryScheduler(async () => {
    const userId = currentUserId();
    if (!userId) return "empty";
    return flush(userId, {
      onSynced: () => refetchAfterFlush(options.tz),
    });
  });

  const onOnline = () => void scheduler.runNow();
  window.addEventListener("online", onOnline);

  const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
      const userId = session?.user.id;
      if (userId) clearAuthBlocked(userId);
      void scheduler.runNow();
    }
  });

  return {
    flushNow: () => scheduler.runNow(),
    stop: () => {
      window.removeEventListener("online", onOnline);
      subscription.subscription.unsubscribe();
      scheduler.cancel();
    },
  };
}
