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
  | { phase: "loading" }
  | { phase: "cold" }
  | { phase: "ready"; data: PlanData };

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

export function usePlanData(clock: Clock): PlanState {
  const [state, setState] = useState<PlanState>({ phase: "loading" });
  const clockRef = useRef(clock);
  clockRef.current = clock;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tz = resolveTimeZone();
    const safeRead = () => read(clockRef.current, tz).catch(() => null);

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
          .then(() => refreshAll(clockRef.current(), tz))
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
