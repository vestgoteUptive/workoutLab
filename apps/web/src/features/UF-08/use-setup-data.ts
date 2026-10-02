// UF-08.1's data: the `lib/offline` cache plus the queue, read on the device (D-0071 §8,
// NFR-OFF-3). No Edge Function is called.
//
// Cache first, network second. The first read is published as soon as IndexedDB answers. Online,
// `refreshAll` is then started and the cache is re-read when it settles OR after 3 s, whichever
// comes first (D-0071 §8, D-0104: a rejected refresh is swallowed).
//
// Content, not identity (D-0107 §3): every read returns new arrays. A re-read that is deep-equal
// to the published data keeps the published object, so the host's `suggest` memo, which keys on
// that object, makes no new call. A re-read with changed content replaces it: exactly one call.
import { useEffect, useState } from "react";
import { AREAS, type AreaTarget, type HistorySet, type LibraryExercise } from "@workoutlab/shared";
import type { EngineProfile } from "@workoutlab/engine";
import { loadEngineHistory } from "../../lib/offline/engine-feed.js";
import { loadLibrary, loadProfile, loadTargets, refreshAll } from "../../lib/offline/history.js";
import { deepEqual } from "./deep-equal.js";

/** D-0071 §8: the online refresh gets 3 s, then the screen stops waiting for it. */
export const REFRESH_CAP_MS = 3000;

export interface SetupData {
  history: HistorySet[];
  targets: AreaTarget[];
  profile: EngineProfile;
  library: LibraryExercise[];
}

export type SetupState =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "ready"; data: SetupData };

/** One cache read. Never rejects: a failing loader, no profile or < 9 targets is `missing`. */
async function readCache(): Promise<SetupState> {
  try {
    const [history, targets, profile, library] = await Promise.all([
      loadEngineHistory(),
      loadTargets(),
      loadProfile(),
      loadLibrary(),
    ]);
    const areas = new Set(targets.map((t) => t.area));
    if (profile === null || !AREAS.every((a) => areas.has(a))) return { kind: "missing" };
    return { kind: "ready", data: { history, targets, profile, library } };
  } catch {
    return { kind: "missing" };
  }
}

/** Resolves when `promise` settles or after `ms`, whichever comes first. Never rejects. */
function settledOrAfter(promise: Promise<unknown>, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    promise.then(done, done);
  });
}

/** Keeps `prev` when `next` has the same content, so consumers keyed on identity don't re-run. */
function merge(prev: SetupState, next: SetupState): SetupState {
  if (next.kind === "ready") {
    if (prev.kind === "ready" && deepEqual(prev.data, next.data)) return prev;
    return next;
  }
  // A re-read that comes back empty never hides data that was already on screen.
  if (prev.kind === "ready") return prev;
  return prev.kind === next.kind ? prev : next;
}

export function useSetupData(nowIso: string, timeZone: string): SetupState {
  const [state, setState] = useState<SetupState>({ kind: "loading" });

  useEffect(() => {
    let live = true;

    async function run(): Promise<void> {
      const first = await readCache();
      if (!live) return;
      setState((prev) => merge(prev, first));

      if (!navigator.onLine) return;
      let refresh: Promise<void>;
      try {
        refresh = refreshAll(new Date(nowIso), timeZone);
      } catch {
        refresh = Promise.resolve();
      }
      await settledOrAfter(refresh, REFRESH_CAP_MS);
      if (!live) return;
      const second = await readCache();
      if (!live) return;
      setState((prev) => merge(prev, second));
    }

    void run();
    return () => {
      live = false;
    };
  }, [nowIso, timeZone]);

  return state;
}
