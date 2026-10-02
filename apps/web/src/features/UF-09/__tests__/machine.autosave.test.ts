// T-0304b AC-4/AC-5/AC-7 reducer cases (D-0118 §2 §3): the confirm auto-save timer that
// `SET_RECORDED` starts, `AUTOSAVE_CANCEL`, and Pause/Resume carrying the timer.
import { describe, expect, it } from "vitest";
import type { LibraryExercise } from "@workoutlab/shared";
import {
  AUTOSAVE_S,
  focusReducer,
  initialFocusState,
  type FocusCtx,
  type FocusState,
  type LoggedSet,
} from "../machine.js";
import { BENCH, CURL, P1, S1 } from "./fixtures.js";
import { L2, PU, planOf } from "./set-loop-fixtures.js";

const T0 = 1_000_000;

function setState(itemIndex: number, patch: Partial<FocusState> = {}): FocusState {
  return { ...initialFocusState(S1, P1, T0), phase: "set", timer: null, itemIndex, ...patch };
}

function rec(exerciseId: string, weightKg: number | null): LoggedSet {
  return {
    clientId: "c1",
    itemIndex: 0,
    setIndex: 0,
    exerciseId,
    reps: 6,
    weightKg,
    durationS: null,
    rir: null,
    backoff: false,
  };
}

const PLAN = planOf([BENCH, CURL, PU]);
const ctx = (library: readonly LibraryExercise[] = L2): FocusCtx => ({ plan: PLAN, library });

describe("AC-4 SET_RECORDED starts the persisted auto-save", () => {
  it("AUTOSAVE_S is 5", () => {
    expect(AUTOSAVE_S).toBe(5);
  });

  it("a recorded weight → timer {startedAtMs: atMs, durationS: 5, pausedMs: 0}", () => {
    const s = focusReducer(
      setState(0),
      { type: "SET_RECORDED", set: rec("bench-press", 80), atMs: T0 + 7 },
      ctx(),
    );
    expect(s.phase).toBe("confirm");
    expect(s.timer).toEqual({ startedAtMs: T0 + 7, durationS: 5, pausedMs: 0 });
  });
});

describe("AC-7 a null weight means ask, except on a known bodyweight exercise", () => {
  it("null weight on leg-curl (externalLoad true) → timer null", () => {
    const s = focusReducer(
      setState(1),
      { type: "SET_RECORDED", set: rec("leg-curl", null), atMs: T0 },
      ctx(),
    );
    expect(s.phase).toBe("confirm");
    expect(s.timer).toBeNull();
  });

  it("null weight on push-up (externalLoad false) → still auto-saves", () => {
    const s = focusReducer(
      setState(2),
      { type: "SET_RECORDED", set: rec("push-up", null), atMs: T0 },
      ctx(),
    );
    expect(s.timer).toEqual({ startedAtMs: T0, durationS: AUTOSAVE_S, pausedMs: 0 });
  });

  it("null weight with the entry missing from the library → timer null", () => {
    const library = L2.filter((e) => e.id !== "push-up");
    const s = focusReducer(
      setState(2),
      { type: "SET_RECORDED", set: rec("push-up", null), atMs: T0 },
      ctx(library),
    );
    expect(s.timer).toBeNull();
  });

  it("the pair: a weight of 0 on leg-curl auto-saves (only null asks)", () => {
    const s = focusReducer(
      setState(1),
      { type: "SET_RECORDED", set: rec("leg-curl", 0), atMs: T0 },
      ctx(),
    );
    expect(s.timer).not.toBeNull();
  });

  it("the plan's exercise decides, not the event's id (the reducer stamps it)", () => {
    const s = focusReducer(
      setState(1),
      { type: "SET_RECORDED", set: rec("push-up", null), atMs: T0 },
      ctx(),
    );
    expect(s.loggedSets[0]!.exerciseId).toBe("leg-curl");
    expect(s.timer).toBeNull();
  });
});

describe("AC-5 AUTOSAVE_CANCEL", () => {
  const confirm = focusReducer(
    setState(0),
    { type: "SET_RECORDED", set: rec("bench-press", 80), atMs: T0 },
    ctx(),
  );

  it("in confirm with a running timer → timer null, still confirm, nothing else changes", () => {
    const s = focusReducer(confirm, { type: "AUTOSAVE_CANCEL", atMs: T0 + 1000 }, ctx());
    expect(s).not.toBe(confirm);
    expect(s).toEqual({ ...confirm, timer: null });
  });

  it("with the timer already null → the same state object", () => {
    const cancelled = focusReducer(confirm, { type: "AUTOSAVE_CANCEL", atMs: T0 }, ctx());
    expect(focusReducer(cancelled, { type: "AUTOSAVE_CANCEL", atMs: T0 + 1 }, ctx())).toBe(
      cancelled,
    );
  });

  it("in set → the same state object", () => {
    const s = setState(0);
    expect(focusReducer(s, { type: "AUTOSAVE_CANCEL", atMs: T0 }, ctx())).toBe(s);
  });

  it.each(["rest", "next", "getReady"] as const)(
    "in %s (a running timer) → the same state object",
    (phase) => {
      const s = setState(0, { phase, timer: { startedAtMs: T0, durationS: 60, pausedMs: 0 } });
      expect(focusReducer(s, { type: "AUTOSAVE_CANCEL", atMs: T0 }, ctx())).toBe(s);
    },
  );

  it("paused over a confirm → the same state object (Pause isn't a touch)", () => {
    const paused = focusReducer(confirm, { type: "PAUSE", atMs: T0 + 2000 }, ctx());
    expect(focusReducer(paused, { type: "AUTOSAVE_CANCEL", atMs: T0 + 3000 }, ctx())).toBe(paused);
  });
});

describe("AC-4 Pause/Resume carry the auto-save", () => {
  it("PAUSE keeps the timer; RESUME adds the pause to pausedMs", () => {
    const confirm = focusReducer(
      setState(0),
      { type: "SET_RECORDED", set: rec("bench-press", 80), atMs: T0 },
      ctx(),
    );
    const paused = focusReducer(confirm, { type: "PAUSE", atMs: T0 + 2000 }, ctx());
    expect(paused.timer).toEqual(confirm.timer);
    const resumed = focusReducer(paused, { type: "RESUME", atMs: T0 + 62_000 }, ctx());
    expect(resumed.phase).toBe("confirm");
    expect(resumed.timer).toEqual({ startedAtMs: T0, durationS: 5, pausedMs: 60_000 });
  });
});
