// Wires the offline queue into the app shell (T-0300c, AC-C20). Mounted once from `App.tsx`,
// inside `AuthProvider`: it does nothing while signed out, so `/welcome`'s first render never
// imports or runs any of `lib/offline` (principle 5, D-0045 §13). Once signed in, it starts the
// flush/backoff/auth-state loop (`startSync`) and refreshes the history/library/targets/profile
// caches (`refreshAll`) so a later offline reload has cached data to show (AC-C20).
import { useEffect } from "react";
import { useAuth } from "../auth/auth-context.js";
import { startSync } from "./sync.js";
import { refreshAll } from "./history.js";

function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function AutoSync() {
  const { status } = useAuth();
  const signedIn = status === "signed-in";

  useEffect(() => {
    if (!signedIn) return;
    const tz = deviceTimeZone();
    const handle = startSync({ tz });
    if (navigator.onLine) {
      // Best-effort (D-0104 §2): a failed read keeps that table's previous cache rows, the
      // other refreshes still write theirs, and nothing surfaces as an unhandled rejection.
      refreshAll(new Date(), tz).catch(() => undefined);
      // A mount flush can only succeed while online: offline, the fetch throws, `flush()`
      // returns `network-error`, and `RetryScheduler` arms a backoff timer for nothing (D-0045
      // §6). The `online` listener `startSync` just registered covers the return of the network,
      // and so does the enqueue path (`sync.ts`'s `if (stopped || !navigator.onLine) return`),
      // so skipping it here loses no coverage (D-0116).
      void handle.flushNow();
    }
    return () => handle.stop();
  }, [signedIn]);

  return null;
}
