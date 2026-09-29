// UF-10's data: `balance()` from @workoutlab/engine, computed on the device over the
// `lib/offline` cache plus the queue (D-0071 §8, D-0034 §3). This calls **no** Edge Function —
// not `/balance`, not any other.
//
// Cache first, network second (AC-A18). The first paint is whatever the IndexedDB read gives;
// `refreshAll` is *started* and never awaited before that paint, so a hanging fetch (or being
// offline) can't keep the nine rows off the screen. When the refresh does land, the balance is
// recomputed from the now-fresher cache.
// `BalanceResult` is taken from `@workoutlab/shared` (the `api/openapi.yaml` shape), not from
// `@workoutlab/engine`. The two differ in one field on purpose: the engine narrows
// `coverageStep` to the 0–4 union it promises to produce, while the contract type leaves it a
// `number`. UF-10 has to be able to *render* a step outside 0–4 without crashing (AC-A20), so
// the wider contract type is the honest one for a UI that treats the engine's output as data.
import { useEffect, useState } from "react";
import { balance } from "@workoutlab/engine";
import type { BalanceResult } from "@workoutlab/shared";
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
  /** Test seam (AC-A5, AC-A13, AC-A15): a fixed result, so no engine and no IDB run at all. */
  stub?: BalanceResult;
  /** Test seam: overrides the `lastSyncedAt` IDB read (AC-A8). */
  stubLastSyncedAt?: string | null;
}

export function useBalance({
  now,
  timeZone,
  stub,
  stubLastSyncedAt,
}: UseBalanceOptions): BalanceState {
  const [state, setState] = useState<BalanceState>(() => ({
    result: stub ?? null,
    lastSyncedAt: stubLastSyncedAt ?? null,
  }));
  const nowIso = now.toISOString();

  useEffect(() => {
    if (stub) return;
    let live = true;
    const at = new Date(nowIso);

    async function run(): Promise<void> {
      // 1. The cache read. Nothing on the network is awaited before this resolves, so the rows
      //    reach the DOM on the first paint after IDB (AC-A18).
      const [cached, synced] = await Promise.all([
        computeFromCache(at, timeZone),
        stubLastSyncedAt === undefined ? lastSyncedAt() : Promise.resolve(stubLastSyncedAt),
      ]);
      if (!live) return;
      setState({ result: cached, lastSyncedAt: synced });

      // 2. The refresh, only when online, capped at 3 s (D-0071 §8). Started *after* the state
      //    above is published, and its result only ever *replaces* an already-rendered screen.
      if (!navigator.onLine) return;
      await withCap(refreshAll(at, timeZone), REFRESH_TIMEOUT_MS);
      if (!live) return;
      const [fresh, freshSynced] = await Promise.all([
        computeFromCache(at, timeZone),
        stubLastSyncedAt === undefined ? lastSyncedAt() : Promise.resolve(stubLastSyncedAt),
      ]);
      if (!live || fresh === null) return;
      setState({ result: fresh, lastSyncedAt: freshSynced });
    }

    void run();
    return () => {
      live = false;
    };
  }, [nowIso, timeZone, stub, stubLastSyncedAt]);

  return state;
}
