// UF-02.1's data (D-0071 §8, D-0034 §3): `balance()` from @workoutlab/engine on the device, over
// the `lib/offline` cache plus the queue. No Edge Function is called (no `/balance`, no
// `/workouts/suggest`). Written in UF-02 after `features/UF-10/use-balance.ts`, because a feature
// can't deep-import another feature (D-0071 §3).
//
// Cache first, network second. The first render comes from IndexedDB. When online and signed in
// (D-0113), one `refreshAll(now, tz)` starts, at most once per mount, and gets 3 s: the screen recomputes from the cache
// once the refresh settles or the 3 s are up, whichever comes first, and never again for this
// mount. A refresh that rejects is swallowed here (D-0104) and leaves the cached render alone.
//
// Every loader rejection is caught too (D-0108 §3): an empty or failing cache gives the
// no-plan state, never an uncaught error.
//
// T-0302c adds the UF-02.1 preview: each cache read also runs `suggest()` once, with the D-0065 §1
// inputs (45 min, warm-up in budget, normal energy, nothing pinned, excluded or shuffled) and the
// cached profile as it is, `goal` included (D-0095). The card renders that `Workout` only.
//
// Each cache-read effect run owns its own `cancelled` flag, so a read started for an older
// `now`/`timeZone` never lands over a newer one. The 3 s cap timer is cleared when the refresh
// settles and when the screen unmounts.
import { useEffect, useRef, useState } from "react";
import {
  balance,
  isHardSet,
  normalizeHistory,
  suggest,
  type SessionInput,
  type Workout,
} from "@workoutlab/engine";
import {
  AREAS,
  type AreaTarget,
  type BalanceResult,
  type HistorySet,
  type EngineProfile,
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

/** D-0065 §1: the time the UF-02.1 preview assumes. UF-08.1 asks for the real one. */
export const PREVIEW_BUDGET_MIN = 45;

/** D-0065 §1: the preview's `suggest` input, and the only one this screen ever passes. */
export const PREVIEW_INPUT: SessionInput = {
  budgetMin: PREVIEW_BUDGET_MIN,
  warmupInBudget: true,
  energy: "normal",
  shuffle: 0,
  mainLiftId: null,
  pinnedIds: [],
  excludeIds: [],
};

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
      /** The 45-min preview, as `suggest()` returned it; null only if `suggest` threw. */
      workout: Workout | null;
      /** The cached library the preview was built from, for the exercise names. */
      library: readonly LibraryExercise[];
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
    const nowIso = now.toISOString();
    const result = balance(history, targets, library, nowIso, timeZone);
    return {
      status: "ready",
      result,
      hasHardSet: anyHardSet(history, library),
      workout: preview(history, targets, profile, library, nowIso, timeZone),
      library,
      lastSyncedAt: await syncedRead,
    };
  } catch {
    return { status: "no-plan", lastSyncedAt: await syncedRead };
  }
}

/** One `suggest()` over the read. A throw leaves the rest of the screen alone (no card). */
function preview(
  history: readonly HistorySet[],
  targets: readonly AreaTarget[],
  profile: EngineProfile,
  library: readonly LibraryExercise[],
  nowIso: string,
  timeZone: string,
): Workout | null {
  try {
    return suggest(history, targets, profile, library, PREVIEW_INPUT, nowIso, timeZone);
  } catch {
    return null;
  }
}

/**
 * Resolves `done` when `promise` settles or after `ms`, whichever comes first; never rejects.
 * `pause()` clears the timer (unmount); `resume()` re-arms it for the time that was left.
 */
interface Cap {
  done: Promise<void>;
  pause(): void;
  resume(): void;
}

function settledOrCapped(promise: Promise<unknown>, ms: number): Cap {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let settled = false;
  let remaining = ms;
  let armedAt = 0;
  let resolveDone: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });
  const clear = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const finish = () => {
    if (settled) return;
    settled = true;
    clear();
    resolveDone();
  };
  const arm = () => {
    armedAt = Date.now();
    timer = setTimeout(finish, Math.max(0, remaining));
  };
  arm();
  promise.then(finish, finish);
  return {
    done,
    pause: () => {
      if (settled || timer === null) return;
      clear();
      remaining -= Date.now() - armedAt;
    },
    resume: () => {
      if (settled || timer !== null) return;
      arm();
    },
  };
}

/**
 * T-0482: `revision` is bumped by the screen when the check-in card reports an answer. A bump
 * re-runs the cache read (effect 1) and nothing else: the state stays at its last value until the
 * read lands, and the D-0113 refresh is not started again.
 */
export function useToday(now: Date, timeZone: string, signedIn: boolean, revision = 0): TodayState {
  const [state, setState] = useState<TodayState>({ status: "loading" });
  const nowIso = now.toISOString();
  /** Whether the screen is mounted. Only the unmount clears it. */
  const mounted = useRef(false);
  /** The clock and tz of the latest cache-read effect run; a re-read for older ones never lands. */
  const inputs = useRef({ nowIso, timeZone });
  /** The latest cache read; the post-refresh re-read always waits for it. */
  const latestRead = useRef<Promise<void>>(Promise.resolve());
  /** D-0113 §2: the refresh starts at most once per mount. */
  const refreshStarted = useRef(false);
  /** The running refresh's 3 s cap, until it is done. */
  const cap = useRef<Cap | null>(null);

  // 0. Mount and unmount. The unmount clears the cap timer; a StrictMode remount re-arms it.
  useEffect(() => {
    mounted.current = true;
    cap.current?.resume();
    return () => {
      mounted.current = false;
      cap.current?.pause();
    };
  }, []);

  // 1. The cache read, on mount and whenever the clock or tz changes. Nothing on the network is
  //    awaited before it. Each run owns its `cancelled` flag: an older read never overwrites.
  useEffect(() => {
    let cancelled = false;
    const current = { nowIso, timeZone };
    inputs.current = current;
    latestRead.current = readCache(new Date(nowIso), timeZone).then((cached) => {
      if (!cancelled) setState(cached);
    });
    return () => {
      cancelled = true;
    };
  }, [nowIso, timeZone, revision]);

  // 2. The refresh (D-0113): only online and signed in, at the first such commit of this mount,
  //    never again. `stale` and `signed-out` get none. The 3 s cap counts from when it starts.
  useEffect(() => {
    if (refreshStarted.current || !signedIn || !navigator.onLine) return;
    refreshStarted.current = true;
    // Its rejection is handled inside `settledOrCapped` (D-0104).
    const capped = settledOrCapped(refreshAll(new Date(nowIso), timeZone), REFRESH_CAP_MS);
    cap.current = capped;
    void (async () => {
      await capped.done;
      cap.current = null;
      await latestRead.current;
      if (!mounted.current) return;
      const at = inputs.current;
      const fresh = await readCache(new Date(at.nowIso), at.timeZone);
      if (mounted.current && inputs.current === at) setState(fresh);
    })();
  }, [signedIn, nowIso, timeZone]);

  return state;
}
