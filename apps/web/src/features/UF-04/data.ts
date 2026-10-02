// The one data path of UF-04 (D-0071 §8, D-0067 §5): render from the cache first, then, when
// online and signed in (D-0113), run `refreshAll` once per mount with a 3 s cap and re-read. Only
// the T-0319 read-only loaders and the public refresh are used: no Edge Function, no IndexedDB
// access, no write.
import { useEffect, useRef, useState } from "react";
import type { AuthStatus } from "../../lib/auth/auth-context.js";
import { refreshAll } from "../../lib/offline/history.js";

export const REFRESH_CAP_MS = 3000;

export interface ScreenData<T> {
  /** The value read for the current `key`, or `undefined` until the first read lands. */
  data: T | undefined;
  /** True while a refresh has been started and has neither finished nor hit the cap. */
  pending: boolean;
}

/**
 * `refresh: true` screens pass `useAuth().status` (D-0113 §1). The caller reads it, so a
 * `refresh: false` consumer (the in-workout how-to) needs no `AuthProvider` above it.
 */
export type ScreenDataOptions = { refresh: false } | { refresh: true; status: AuthStatus };

interface Read<T> {
  key: string;
  /** The `sync.tick` this read ran under, so a post-refresh read can be told from a first one. */
  tick: number;
  value: T;
}

function qualifies(status: AuthStatus): boolean {
  return status === "signed-in" && navigator.onLine;
}

/** `read` may change identity every render: only `key` (and a finished refresh) re-reads. */
export function useScreenData<T>(
  read: () => Promise<T>,
  key: string,
  options: ScreenDataOptions,
): ScreenData<T> {
  const refresh = options.refresh;
  const status = options.refresh ? options.status : undefined;
  const [result, setResult] = useState<Read<T> | undefined>(undefined);
  // `refreshed` is false only while a refresh is in flight (or about to start at this mount);
  // `tick` re-reads the cache. A `stale`, `signed-out` or offline mount is refreshed at once
  // (D-0113 §3, D-0115 §3).
  const [sync, setSync] = useState(() => ({
    tick: 0,
    refreshed: status === undefined || !qualifies(status),
  }));
  const readRef = useRef(read);
  useEffect(() => {
    readRef.current = read;
  });
  // D-0113 §2: at most one refresh per mount. `mounted` survives a status change (which must not
  // cancel the refresh in flight) and StrictMode's simulated remount.
  const started = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let live = true;
    // D-0104 / D-0115 §2: a rejected read publishes nothing; the post-refresh re-read retries.
    readRef.current().then(
      (value) => {
        if (live) setResult({ key, tick: sync.tick, value });
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [key, sync.tick]);

  useEffect(() => {
    if (status === undefined || started.current) return;
    if (!qualifies(status)) {
      setSync((s) => (s.refreshed ? s : { ...s, refreshed: true }));
      return;
    }
    started.current = true;
    // D-0115 §3: a refresh that starts late makes the screen pending again.
    setSync((s) => (s.refreshed ? { ...s, refreshed: false } : s));
    // The cap is measured from this start (D-0113 §4).
    const timer = setTimeout(done, REFRESH_CAP_MS);
    function done(): void {
      clearTimeout(timer);
      if (mounted.current) setSync((s) => ({ tick: s.tick + 1, refreshed: true }));
    }
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // A refresh failure is not an error screen: the cache stays what the user sees.
    Promise.resolve(refreshAll(new Date(), tz)).then(done, done);
  }, [status]);

  const current = result !== undefined && result.key === key ? result : undefined;
  // Pending until the re-read that follows the refresh has landed, so a screen never decides
  // (redirect, "never downloaded") from the pre-refresh cache while the refresh is filling it.
  const pending =
    refresh && !(sync.refreshed && current !== undefined && current.tick === sync.tick);
  return { data: current?.value, pending };
}
