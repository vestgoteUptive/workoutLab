// Wires the flush/backoff/auth triggers together (AC-C8, AC-C10, AC-C17). `startSync()` is
// called once, from a signed-in route only (never from `/welcome`'s first render, principle 5).
import { supabase } from "../auth/client.js";
import { clearAuthBlocked, flush } from "./flush.js";
import { RetryScheduler } from "./retry.js";
import {
  refreshHistory,
  refreshLibrary,
  refreshTargets,
  refreshProfile,
  refreshSessions,
  refreshCheckins,
} from "./history.js";
import { currentUserId } from "./current-user.js";

/** One refetch each of history, targets, profile and library after a flush that sent ≥ 1 row
 *  (AC-C17), plus sessions and check-ins (T-0319 AC-8): a flush is exactly when the server's
 *  `sessions` rows and the check-in answers can have moved on from the cache.
 *
 *  Routines are NOT refetched here. Nothing in the flush queue writes `routines` or
 *  `routine_items` (the queue only sends `sessions` and `session_sets`), so a flush can never
 *  make the routine cache stale. `refreshAll()` covers it. */
async function refetchAfterFlush(tz: string): Promise<void> {
  const now = new Date();
  await Promise.all([
    refreshHistory(now, tz),
    refreshTargets(),
    refreshProfile(),
    refreshLibrary(),
    refreshSessions(now, tz),
    refreshCheckins(),
  ]);
}

export interface SyncHandle {
  flushNow: () => Promise<void>;
  /** Resolves once every flush this handle started has finished, including the fire-and-forget
   *  ones kicked off by an `online` or `SIGNED_IN`/`TOKEN_REFRESHED` event.
   *
   *  A DOM listener and the supabase-js auth callback can't return a promise to their caller, so
   *  without this the only handle on that in-flight work is a dropped promise (T-0311). Anything
   *  that must not observe a half-finished flush awaits this: the trigger tests that fire a real
   *  event, and any caller that needs the queue quiescent before it reads IDB. */
  settled: () => Promise<void>;
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

  // Every flush started by this handle, so `settled()` can await work that no caller holds a
  // promise for. A rejection must never become an unhandled rejection or leak into the next
  // `settled()`, so each entry is caught and dropped as soon as it finishes.
  let inFlight: Promise<void> = Promise.resolve();
  function track(work: Promise<void>): void {
    const guarded = work.catch(() => undefined);
    inFlight = inFlight.then(() => guarded);
  }

  const onOnline = () => track(scheduler.runNow());
  window.addEventListener("online", onOnline);

  const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
      const userId = session?.user.id;
      if (userId) clearAuthBlocked(userId);
      track(scheduler.runNow());
    }
  });

  return {
    flushNow: () => {
      const work = scheduler.runNow();
      track(work);
      return work;
    },
    // Re-read `inFlight` after awaiting: a flush can start another one (a refetch, a retry), and
    // awaiting a stale reference would return before that follow-up work finished.
    settled: async () => {
      let previous: Promise<void> | null = null;
      while (previous !== inFlight) {
        previous = inFlight;
        await inFlight;
      }
    },
    stop: () => {
      window.removeEventListener("online", onOnline);
      subscription.subscription.unsubscribe();
      scheduler.cancel();
    },
  };
}
