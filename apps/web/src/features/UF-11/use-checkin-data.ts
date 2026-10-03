// T-0308c UF-11.1 CheckinCard data (read side only; D-0070 §4-§5 writes are T-0470). Reads the
// on-device cache ONCE (`loadSessions`, `loadEngineHistory`, `loadLibrary`, `loadProfile`,
// `loadCheckins`) and evaluates rule 9 through `evaluatePlanCheckin` (the one UF-11 evaluation
// helper, T-0308b), never `refreshAll`: the card is a read of what's already on the device, and
// T-0308b's own hook already keeps the data fresh on the screens that mount it (T-0471).
//
// Never throws out of the hook: a rejected loader or a missing profile resolves to "no card"
// with no `console.error` (AC-4).
import { useEffect, useRef, useState } from "react";
import type { CheckinEvaluation, EngineProfile } from "@workoutlab/shared";
import {
  loadCheckins,
  loadEngineHistory,
  loadLibrary,
  loadProfile,
  loadSessions,
} from "../../lib/offline/index.js";
import { evaluatePlanCheckin } from "./checkin-evaluation.js";
import type { Clock } from "./use-plan-data.js";

export interface CheckinCardData {
  profile: EngineProfile;
  evaluation: CheckinEvaluation;
}

export type CheckinCardState =
  { phase: "loading" } | { phase: "none" } | { phase: "ready"; data: CheckinCardData };

async function read(now: Date, tz: string): Promise<CheckinCardData | null> {
  const profile = await loadProfile();
  if (!profile) return null;
  const [sessions, history, library, checkins] = await Promise.all([
    loadSessions(),
    loadEngineHistory(),
    loadLibrary(),
    loadCheckins(),
  ]);
  const evaluation = evaluatePlanCheckin(sessions, history, library, profile, checkins, now, tz);
  return { profile, evaluation };
}

export function useCheckinData(clock: Clock, tz: string): CheckinCardState {
  const [state, setState] = useState<CheckinCardState>({ phase: "loading" });
  // Pinned at mount, like T-0308b's `usePlanData`: a fresh clock identity on every render (the
  // real router path) must not restart the read.
  const pinned = useRef<Date | null>(null);
  pinned.current ??= clock();
  const at = pinned.current;

  useEffect(() => {
    let cancelled = false;
    read(at, tz).then(
      (data) => {
        if (cancelled) return;
        if (data && data.evaluation.proposal !== null) {
          setState({ phase: "ready", data });
        } else {
          setState({ phase: "none" });
        }
      },
      () => {
        if (!cancelled) setState({ phase: "none" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
