// Cache-first data for UF-11.2 and UF-11.3 (D-0071 §8): read the on-device caches, render, then
// (online) run `refreshAll` under a 3 s cap and read again. Never throws out of the hook: a
// missing client, a failed or slow refresh only means the cache read stands.
import { useEffect, useRef, useState } from "react";
import type { AreaTarget, CheckinEvaluation, EngineProfile, PlanCheckin } from "@workoutlab/shared";
import {
  loadCheckins,
  loadEngineHistory,
  loadLibrary,
  loadProfile,
  loadRoutines,
  loadSessions,
  loadTargets,
  refreshAll,
  type OfflineRoutine,
} from "../../lib/offline/index.js";
import { evaluatePlanCheckin } from "./checkin-evaluation.js";
import { resolveTimeZone } from "./format.js";

export const REFRESH_CAP_MS = 3000;

export interface PlanData {
  profile: EngineProfile;
  targets: AreaTarget[];
  checkins: PlanCheckin[];
  routines: OfflineRoutine[];
  evaluation: CheckinEvaluation;
  tz: string;
}

export type PlanState =
  { phase: "loading" } | { phase: "cold" } | { phase: "ready"; data: PlanData };

export type Clock = () => Date;

export const systemClock: Clock = () => new Date();

async function read(clock: Clock, tz: string): Promise<PlanData | null> {
  const profile = await loadProfile();
  if (!profile) return null;
  const [targets, checkins, routines, sessions, history, library] = await Promise.all([
    loadTargets(),
    loadCheckins(),
    loadRoutines(),
    loadSessions(),
    loadEngineHistory(),
    loadLibrary(),
  ]);
  const evaluation = evaluatePlanCheckin(
    sessions,
    history,
    library,
    profile,
    checkins,
    clock(),
    tz,
  );
  return { profile, targets, checkins, routines, evaluation, tz };
}

export function usePlanData(clock: Clock, revision = 0): PlanState {
  const [state, setState] = useState<PlanState>({ phase: "loading" });
  // `now` is PINNED at mount: both the clock function and the instant it returns. T-0307a's e2e
  // found the alternative the hard way — a `now` read per render changed the effect's dependency
  // every render and froze the screen in a reload loop that no unit test could see, because every
  // unit test injects a fixed `now`. Nothing below reads `clock` again, so a fresh prop identity
  // on a re-render (the router's `now={() => new Date()}`) cannot restart the load.
  const pinned = useRef<Date | null>(null);
  pinned.current ??= clock();
  const at = pinned.current;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tz = resolveTimeZone();
    const safeRead = () => read(() => at, tz).catch(() => null);

    async function run() {
      const first = await safeRead();
      if (cancelled) return;
      if (first) setState({ phase: "ready", data: first });
      if (!navigator.onLine) {
        if (!first) setState({ phase: "cold" });
        return;
      }
      await new Promise<void>((resolve) => {
        timer = setTimeout(resolve, REFRESH_CAP_MS);
        Promise.resolve()
          .then(() => refreshAll(at, tz))
          .then(
            () => undefined,
            () => undefined,
          )
          .then(resolve);
      });
      clearTimeout(timer);
      if (cancelled) return;
      const second = await safeRead();
      if (cancelled) return;
      if (second) setState({ phase: "ready", data: second });
      else if (!first) setState({ phase: "cold" });
    }

    void run();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  // T-0481: when `revision` changes after mount, ONE cache-only read (no `refreshAll`: the card
  // that bumped it just ran one). It only ever upgrades to `ready`; a null or rejected read
  // leaves the state as it was. The newest revision wins; unmount cancels.
  const firstRevision = useRef(revision);
  useEffect(() => {
    if (revision === firstRevision.current) return;
    let cancelled = false;
    void read(() => at, resolveTimeZone())
      .catch(() => null)
      .then((data) => {
        if (cancelled || !data) return;
        setState({ phase: "ready", data });
      });
    return () => {
      cancelled = true;
    };
  }, [revision, at]);

  return state;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}
