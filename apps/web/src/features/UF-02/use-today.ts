// UF-02.1's data (D-0071 §8, D-0034 §3): `balance()` from @workoutlab/engine on the device, over
// the `lib/offline` cache plus the queue. No Edge Function is called (no `/balance`, no
// `/workouts/suggest`). Written in UF-02 after `features/UF-10/use-balance.ts`, because a feature
// can't deep-import another feature (D-0071 §3).
//
// Cache first, network second. The first render comes from IndexedDB. When online, one
// `refreshAll(now, tz)` starts with the mount and gets 3 s: the screen recomputes from the cache
// once the refresh settles or the 3 s are up, whichever comes first, and never again for this
// mount. A refresh that rejects is swallowed here (D-0104) and leaves the cached render alone.
//
// Every loader rejection is caught too (D-0108 §3): an empty or failing cache gives the
// no-plan state, never an uncaught error.
import { useEffect, useState } from "react";
import { balance, isHardSet, normalizeHistory } from "@workoutlab/engine";
import {
  AREAS,
  type AreaTarget,
  type BalanceResult,
  type HistorySet,
  type LibraryExercise,
} from "@workoutlab/shared";
import { loadEngineHistory } from "../../lib/offline/engine-feed.js";
import {
  lastSyncedAt,
  loadLibrary,
  loadProfile,
  loadTargets,
  refreshAll,
} from "../../lib/offline/history.js";

/** D-0071 §8: the online refresh gets 3 s, then the screen stops waiting for it. */
export const REFRESH_CAP_MS = 3000;

export type TodayState =
  /** Before the first cache read resolves. `lastSyncedAt` isn't known yet either. */
  | { status: "loading" }
  /** No cached profile, not all nine targets, or a loader that rejected (AC-10). */
  | { status: "no-plan"; lastSyncedAt: string | null }
  | {
      status: "ready";
      result: BalanceResult;
      /** Whether the loaded history holds any hard set at all (`isHardSet`, AC-7). */
      hasHardSet: boolean;
      lastSyncedAt: string | null;
    };

/** All nine areas have a cached target. `balance()` throws on fewer (engine `indexTargets`). */
function hasEveryTarget(targets: readonly AreaTarget[]): boolean {
  return AREAS.every((area) => targets.some((t) => t.area === area));
}

/** Rule 0 then rule 2, both from the engine: is there any hard set in the history at all? */
function anyHardSet(history: readonly HistorySet[], library: readonly LibraryExercise[]): boolean {
  const byId = new Map<string, LibraryExercise>();
  for (const exercise of library) if (!byId.has(exercise.id)) byId.set(exercise.id, exercise);
  return normalizeHistory(history).some((set) => isHardSet(set, byId.get(set.exerciseId)));
}

async function readSynced(): Promise<string | null> {
  try {
    return await lastSyncedAt();
  } catch {
    return null;
  }
}

/** One cache read and one `balance()` call over it. Never rejects. */
async function readCache(
  now: Date,
  timeZone: string,
): Promise<Exclude<TodayState, { status: "loading" }>> {
  const syncedRead = readSynced();
  try {
    const [history, targets, library, profile] = await Promise.all([
      loadEngineHistory(),
      loadTargets(),
      loadLibrary(),
      loadProfile(),
    ]);
    if (profile === null || !hasEveryTarget(targets)) {
      return { status: "no-plan", lastSyncedAt: await syncedRead };
    }
    const result = balance(history, targets, library, now.toISOString(), timeZone);
    return {
      status: "ready",
      result,
      hasHardSet: anyHardSet(history, library),
      lastSyncedAt: await syncedRead,
    };
  } catch {
    return { status: "no-plan", lastSyncedAt: await syncedRead };
  }
}

/** Resolves when `promise` settles or after `ms`, whichever comes first. Never rejects. */
function settledOrCapped(promise: Promise<unknown>, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    promise.then(done, done);
  });
}

export function useToday(now: Date, timeZone: string): TodayState {
  const [state, setState] = useState<TodayState>({ status: "loading" });
  const nowIso = now.toISOString();

  useEffect(() => {
    let live = true;
    const at = new Date(nowIso);
    // Started with the mount, so the 3 s cap counts from when the screen opened. Its rejection
    // is handled inside `settledOrCapped` (D-0104).
    const refreshed = navigator.onLine
      ? settledOrCapped(refreshAll(at, timeZone), REFRESH_CAP_MS)
      : null;

    async function run(): Promise<void> {
      const cached = await readCache(at, timeZone);
      if (!live) return;
      setState(cached);
      if (refreshed === null) return;
      await refreshed;
      if (!live) return;
      const fresh = await readCache(at, timeZone);
      if (!live) return;
      setState(fresh);
    }

    void run();
    return () => {
      live = false;
    };
  }, [nowIso, timeZone]);

  return state;
}
