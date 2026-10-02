// UF-10's data: `balance()` from @workoutlab/engine, computed on the device over the
// `lib/offline` cache plus the queue (D-0071 §8, D-0034 §3). This calls **no** Edge Function —
// not `/balance`, not any other.
//
// Cache first, network second (AC-A18). The first paint is whatever the IndexedDB read gives;
// `refreshAll` is *started* and never awaited before that paint, so a hanging fetch (or being
// offline) can't keep the nine rows off the screen. When the refresh does land, the balance is
// recomputed from the now-fresher cache. The refresh runs only online and signed in, at most once
// per mount (D-0113); `stale` and `signed-out` render from the cache alone.
// `BalanceResult` is taken from `@workoutlab/shared` (the `api/openapi.yaml` shape), not from
// `@workoutlab/engine`. The two differ in one field on purpose: the engine narrows
// `coverageStep` to the 0–4 union it promises to produce, while the contract type leaves it a
// `number`. UF-10 has to be able to *render* a step outside 0–4 without crashing (AC-A20), so
// the wider contract type is the honest one for a UI that treats the engine's output as data.
import { useEffect, useRef, useState } from "react";
import { balance } from "@workoutlab/engine";
import type { BalanceResult } from "@workoutlab/shared";
import type { AuthStatus } from "../../lib/auth/auth-context.js";
import { loadEngineHistory } from "../../lib/offline/engine-feed.js";
import { loadLibrary, loadTargets, refreshAll, lastSyncedAt } from "../../lib/offline/history.js";

/** D-0071 §8: the online refresh gets 3 s, then the screen stops waiting for it. */
export const REFRESH_TIMEOUT_MS = 3000;

export interface BalanceState {
  /** `null` until the first cache read resolves. */
  result: BalanceResult | null;
  lastSyncedAt: string | null;
}

/** Computes one `BalanceResult` from the current cache. Throws nothing the caller must handle:
 *  an empty cache has no targets, which `balance()` rejects, so that case returns `null`. */
async function computeFromCache(now: Date, tz: string): Promise<BalanceResult | null> {
  const [history, targets, library] = await Promise.all([
    loadEngineHistory(),
    loadTargets(),
    loadLibrary(),
  ]);
  // `balance()` requires all nine targets (engine `indexTargets`). A cache that hasn't been
  // filled yet has none, which is not an error state on this screen — it's "no data yet".
  if (targets.length === 0) return null;
  return balance(history, targets, library, now.toISOString(), tz);
}

/** Resolves when `promise` settles or after `ms`, whichever comes first. Never rejects. */
function withCap<T>(promise: Promise<T>, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    void promise.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      () => {
        clearTimeout(timer);
        resolve();
      },
    );
  });
}

export interface UseBalanceOptions {
  now: Date;
  timeZone: string;
  /** `useAuth().status`, read by the screen (D-0113 §1). Only `signed-in` may refresh. */
  status: AuthStatus;
  /** Test seam (AC-A5, AC-A13, AC-A15): a fixed result, so no engine and no IDB run at all. */
  stub?: BalanceResult;
  /** Test seam: overrides the `lastSyncedAt` IDB read (AC-A8). */
  stubLastSyncedAt?: string | null;
}

type CacheRead = readonly [BalanceResult | null, string | null];

function readCache(
  at: Date,
  timeZone: string,
  stubLastSyncedAt: string | null | undefined,
): Promise<CacheRead> {
  return Promise.all([
    computeFromCache(at, timeZone),
    stubLastSyncedAt === undefined ? lastSyncedAt() : Promise.resolve(stubLastSyncedAt),
  ]);
}

export function useBalance({
  now,
  timeZone,
  status,
  stub,
  stubLastSyncedAt,
}: UseBalanceOptions): BalanceState {
  const [state, setState] = useState<BalanceState>(() => ({
    result: stub ?? null,
    lastSyncedAt: stubLastSyncedAt ?? null,
  }));
  // True once the first cache read has settled (published, or rejected and swallowed). The
  // refresh waits for it, so the cache rows always paint before the network is touched (AC-A18).
  const [firstReadDone, setFirstReadDone] = useState(false);
  const nowIso = now.toISOString();
  const latest = useRef({ nowIso, timeZone, stubLastSyncedAt });
  useEffect(() => {
    latest.current = { nowIso, timeZone, stubLastSyncedAt };
  });
  // D-0113 §2: at most one refresh per mount. `mounted` (not a per-effect flag) survives a status
  // change, which must not cancel the refresh already in flight.
  const started = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // 1. The cache read. Nothing on the network is awaited before this resolves, so the rows reach
  //    the DOM on the first paint after IDB (AC-A18). A rejected read (D-0104, D-0115 §2) keeps
  //    the state already published.
  useEffect(() => {
    if (stub) return;
    let live = true;
    readCache(new Date(nowIso), timeZone, stubLastSyncedAt).then(
      ([cached, synced]) => {
        if (!live) return;
        setState({ result: cached, lastSyncedAt: synced });
        setFirstReadDone(true);
      },
      () => {
        if (live) setFirstReadDone(true);
      },
    );
    return () => {
      live = false;
    };
  }, [nowIso, timeZone, stub, stubLastSyncedAt]);

  // 2. The refresh (D-0113 §1 to §4): only online and signed in, once per mount, at the first
  //    commit where both hold after the cache has painted. Capped at 3 s from its own start
  //    (D-0071 §8); its result only ever *replaces* an already-rendered screen.
  useEffect(() => {
    if (stub || !firstReadDone || started.current) return;
    if (status !== "signed-in" || !navigator.onLine) return;
    started.current = true;
    const at = new Date(latest.current.nowIso);
    const refresh = Promise.resolve(refreshAll(at, latest.current.timeZone));
    void withCap(refresh, REFRESH_TIMEOUT_MS)
      .then(async () => {
        if (!mounted.current) return;
        const l = latest.current;
        const [fresh, freshSynced] = await readCache(
          new Date(l.nowIso),
          l.timeZone,
          l.stubLastSyncedAt,
        );
        if (!mounted.current || fresh === null) return;
        setState({ result: fresh, lastSyncedAt: freshSynced });
      })
      // D-0104 / D-0115 §2: a rejected re-read keeps the state already published.
      .catch(() => undefined);
  }, [stub, firstReadDone, status]);

  return state;
}
