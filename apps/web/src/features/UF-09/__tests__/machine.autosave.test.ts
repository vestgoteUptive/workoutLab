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

// T-0304b rework (QA): a set whose write lands while paused arrives as SET_LOGGED, so the walk
// moves on at RESUME instead of offering the same set again (NFR-SYNC-1).
describe("RESUME onto a set that was logged while paused", () => {
  const paused = (patch: Partial<FocusState> = {}): FocusState =>
    setState(0, { phase: "paused", resumePhase: "set", pausedAtMs: T0, ...patch });
  const loggedAt = (exerciseId: string, weightKg: number | null, itemIndex = 0): LoggedSet => ({
    ...rec(exerciseId, weightKg),
    itemIndex,
  });

  it("SET_LOGGED at the current set while paused, then RESUME → confirm with the auto-save from resume", () => {
    const logged = focusReducer(
      paused(),
      { type: "SET_LOGGED", set: loggedAt("bench-press", 80), atMs: T0 + 1000 },
      ctx(),
    );
    expect(logged.phase).toBe("paused");
    const resumed = focusReducer(logged, { type: "RESUME", atMs: T0 + 30_000 }, ctx());
    expect(resumed).toMatchObject({ phase: "confirm", itemIndex: 0, setIndex: 0 });
    expect(resumed.timer).toEqual({ startedAtMs: T0 + 30_000, durationS: AUTOSAVE_S, pausedMs: 0 });
    expect(resumed.loggedSets).toHaveLength(1);
  });

  it("a null weight on a loaded lift → confirm with no auto-save (ask)", () => {
    const logged = focusReducer(
      paused({ itemIndex: 1 }),
      { type: "SET_LOGGED", set: loggedAt("leg-curl", null, 1), atMs: T0 },
      ctx(),
    );
    const resumed = focusReducer(logged, { type: "RESUME", atMs: T0 + 5000 }, ctx());
    expect(resumed).toMatchObject({ phase: "confirm", itemIndex: 1, timer: null });
  });

  it("a timed set logged while paused → RESUME goes where TIMED_RECORDED would (rest from resume)", () => {
    const plan = planOf([{ ...PU, repsMin: null, repsMax: null, durationS: 30 }, BENCH]);
    const c: FocusCtx = { plan, library: L2 };
    const s = setState(0, { phase: "paused", resumePhase: "timed", pausedAtMs: T0 });
    const logged = focusReducer(
      s,
      { type: "SET_LOGGED", set: { ...rec("push-up", null), durationS: 30, reps: null }, atMs: T0 },
      c,
    );
    const resumed = focusReducer(logged, { type: "RESUME", atMs: T0 + 9000 }, c);
    expect(resumed.phase).toBe("rest");
    expect(resumed.timer).toMatchObject({ startedAtMs: T0 + 9000, pausedMs: 0 });
  });

  it("the pair: no set logged while paused → RESUME stays on the same set", () => {
    const resumed = focusReducer(paused(), { type: "RESUME", atMs: T0 + 30_000 }, ctx());
    expect(resumed).toMatchObject({ phase: "set", itemIndex: 0, setIndex: 0, timer: null });
  });

  it("the pair: a different set logged while paused (List view) → RESUME stays on the current set", () => {
    const other = { ...loggedAt("bench-press", 80), setIndex: 2, clientId: "other" };
    const logged = focusReducer(paused(), { type: "SET_LOGGED", set: other, atMs: T0 }, ctx());
    const resumed = focusReducer(logged, { type: "RESUME", atMs: T0 + 30_000 }, ctx());
    expect(resumed).toMatchObject({ phase: "set", setIndex: 0 });
  });
});
