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
  value: T;
}

/** `read` may change identity every render: only `key` (and a finished refresh) re-reads. */
export function useScreenData<T>(
  read: () => Promise<T>,
  key: string,
  options: { refresh: boolean },
): ScreenData<T> {
  const [result, setResult] = useState<Read<T> | undefined>(undefined);
  const [tick, setTick] = useState(0);
  const [pending, setPending] = useState(options.refresh);
  const readRef = useRef(read);
  useEffect(() => {
    readRef.current = read;
  });

  useEffect(() => {
    let live = true;
    void readRef.current().then((value) => {
      if (live) setResult({ key, value });
    });
    return () => {
      live = false;
    };
  }, [key, tick]);

  const refresh = options.refresh;
  useEffect(() => {
    if (!refresh || !navigator.onLine) {
      setPending(false);
      return;
    }
    let live = true;
    const timer = setTimeout(done, REFRESH_CAP_MS);
    function done(): void {
      clearTimeout(timer);
      if (!live) return;
      setPending(false);
      setTick((t) => t + 1);
    }
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // A refresh failure is not an error screen: the cache stays what the user sees.
    Promise.resolve(refreshAll(new Date(), tz)).then(done, done);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [refresh]);

  return { data: result && result.key === key ? result.value : undefined, pending };
}
