// UF-08.1's data: the `lib/offline` cache plus the queue, read on the device (D-0071 §8,
// NFR-OFF-3). No Edge Function is called.
//
// Cache first, network second. The first read is published as soon as IndexedDB answers. Online
// AND signed in (D-0113), `refreshAll` is started once per mount and the cache is re-read when it
// settles OR 3 s after it started, whichever comes first (D-0071 §8, D-0104: a rejected refresh
// is swallowed). `stale` and `signed-out` sessions never refresh.
//
// Content, not identity (D-0107 §3): every read returns new arrays. A re-read that is deep-equal
// to the published data keeps the published object, so the host's `suggest` memo, which keys on
// that object, makes no new call. A re-read with changed content replaces it: exactly one call.
import { useCallback, useEffect, useRef, useState } from "react";
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
  { kind: "loading" } | { kind: "missing" } | { kind: "ready"; data: SetupData };

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

export function useSetupData(nowIso: string, timeZone: string, signedIn: boolean): SetupState {
  const [state, setState] = useState<SetupState>({ kind: "loading" });
  const live = useRef(true);
  // D-0113 §2: at most one refresh per mount. Set when it starts, never reset during the mount.
  const refreshStarted = useRef(false);
  // A read only publishes if no LATER-started read has published, so a slow first read can never
  // overwrite the post-refresh re-read.
  const readSeq = useRef(0);
  const publishedSeq = useRef(0);

  const readAndPublish = useCallback(async (): Promise<void> => {
    readSeq.current += 1;
    const seq = readSeq.current;
    const next = await readCache();
    if (!live.current || seq < publishedSeq.current) return;
    publishedSeq.current = seq;
    setState((prev) => merge(prev, next));
  }, []);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  // 1. The cache read, once per mount. Nothing on the network is awaited before it.
  useEffect(() => {
    void readAndPublish();
  }, [readAndPublish]);

  // 2. The refresh (D-0113 §1-§4): only online AND signed in, at the first such commit of this
  //    mount, once. `stale` and `signed-out` render from the cache with no refresh at all. The
  //    3 s cap is measured from the refresh's start; the cache is re-read when it settles or the
  //    cap fires, whichever comes first.
  useEffect(() => {
    if (!signedIn || !navigator.onLine || refreshStarted.current) return;
    refreshStarted.current = true;
    let refresh: Promise<void>;
    try {
      refresh = refreshAll(new Date(nowIso), timeZone);
    } catch {
      refresh = Promise.resolve();
    }
    void settledOrAfter(refresh, REFRESH_CAP_MS).then(() => {
      if (live.current) return readAndPublish();
    });
  }, [signedIn, nowIso, timeZone, readAndPublish]);

  return state;
}
