// The one data path of UF-04 (D-0071 §8, D-0067 §5): render from the cache first, then, when
// online, run `refreshAll` with a 3 s cap and re-read. Only the T-0319 read-only loaders and the
// public refresh are used: no Edge Function, no IndexedDB access, no write.
import { useEffect, useRef, useState } from "react";
import { refreshAll } from "../../lib/offline/history.js";

export const REFRESH_CAP_MS = 3000;

export interface ScreenData<T> {
  /** The value read for the current `key`, or `undefined` until the first read lands. */
  data: T | undefined;
  /** True while a refresh has been started and has neither finished nor hit the cap. */
  pending: boolean;
}

interface Read<T> {
  key: string;
  /** The `sync.tick` this read ran under, so a post-refresh read can be told from a first one. */
  tick: number;
  value: T;
}

/** `read` may change identity every render: only `key` (and a finished refresh) re-reads. */
export function useScreenData<T>(
  read: () => Promise<T>,
  key: string,
  options: { refresh: boolean },
): ScreenData<T> {
  const refresh = options.refresh;
  const [result, setResult] = useState<Read<T> | undefined>(undefined);
  // `refreshed` flips when the refresh finished (or was skipped); `tick` re-reads the cache.
  const [sync, setSync] = useState({ tick: 0, refreshed: !refresh });
  const readRef = useRef(read);
  useEffect(() => {
    readRef.current = read;
  });

  useEffect(() => {
    let live = true;
    void readRef.current().then((value) => {
      if (live) setResult({ key, tick: sync.tick, value });
    });
    return () => {
      live = false;
    };
  }, [key, sync.tick]);

  useEffect(() => {
    if (!refresh) return;
    if (!navigator.onLine) {
      setSync((s) => ({ ...s, refreshed: true }));
      return;
    }
    let live = true;
    const timer = setTimeout(done, REFRESH_CAP_MS);
    function done(): void {
      clearTimeout(timer);
      if (live) setSync((s) => ({ tick: s.tick + 1, refreshed: true }));
    }
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // A refresh failure is not an error screen: the cache stays what the user sees.
    Promise.resolve(refreshAll(new Date(), tz)).then(done, done);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [refresh]);

  const current = result !== undefined && result.key === key ? result : undefined;
  // Pending until the re-read that follows the refresh has landed, so a screen never decides
  // (redirect, "never downloaded") from the pre-refresh cache while the refresh is filling it.
  const pending =
    refresh && !(sync.refreshed && current !== undefined && current.tick === sync.tick);
  return { data: current?.value, pending };
}
