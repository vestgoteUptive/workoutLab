// The read path of both UF-06 screens (D-0071 §8, D-0067 §5): render from the cache first, then,
// when online, refresh (3 s cap) and re-read. No Edge Function, no direct IndexedDB access, no
// write. `now` is fixed per mount (or injected), so no effect below depends on a value that
// changes every render.
import { useEffect, useMemo, useState } from "react";
import type { AreaTarget, HistorySet, LibraryExercise } from "@workoutlab/engine";
import {
  loadEngineHistory,
  loadLibrary,
  loadSessions,
  loadTargets,
  refreshAll,
  type OfflineSession,
} from "../../lib/offline/index.js";

export const REFRESH_CAP_MS = 3000;

export interface ProgressData {
  sessions: OfflineSession[];
  history: HistorySet[];
  library: LibraryExercise[];
  targets: AreaTarget[];
}

export interface ProgressOptions {
  now?: Date | undefined;
  timeZone?: string | undefined;
  locale?: string | undefined;
}

export interface ProgressState {
  data: ProgressData | null;
  /** True once the first cache read is in and any online refresh has finished or timed out. */
  settled: boolean;
  now: Date;
  timeZone: string;
  locale: string | undefined;
}

async function read(): Promise<ProgressData> {
  const [sessions, history, library, targets] = await Promise.all([
    loadSessions(),
    loadEngineHistory(),
    loadLibrary(),
    loadTargets(),
  ]);
  return { sessions, history: history as HistorySet[], library, targets };
}

export function useProgressData(options: ProgressOptions): ProgressState {
  const [mountNow] = useState(() => new Date());
  const nowMs = (options.now ?? mountNow).getTime();
  const now = useMemo(() => new Date(nowMs), [nowMs]);
  const timeZone = options.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  const [data, setData] = useState<ProgressData | null>(null);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cached = await read();
      if (cancelled) return;
      setData(cached);
      if (!navigator.onLine) {
        setSettled(true);
        return;
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const cap = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, REFRESH_CAP_MS);
      });
      await Promise.race([refreshAll(now, timeZone).catch(() => undefined), cap]);
      clearTimeout(timer);
      if (cancelled) return;
      setData(await read());
      if (!cancelled) setSettled(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [now, timeZone]);

  return { data, settled, now, timeZone, locale: options.locale };
}

/** The `locale`/`timeZone` overrides OfflineStatus accepts, without passing explicit `undefined`. */
export function statusProps(options: ProgressOptions): { locale?: string; timeZone?: string } {
  return {
    ...(options.locale !== undefined ? { locale: options.locale } : {}),
    ...(options.timeZone !== undefined ? { timeZone: options.timeZone } : {}),
  };
}
