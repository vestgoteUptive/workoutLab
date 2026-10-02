// T-0304d (D-0120 §1 §5 §7): the reducer's new events, pure. PLAN_APPLIED moves UF-09.8 on with
// the new plan in `ctx`; SKIP_ITEM ends a pause and leaves the item; CHECK_RESOLVED past the last
// item is `done`. Every result is a readable stored state.
import { describe, expect, it } from "vitest";
import {
  NEXT_SETUP_S,
  canSkipItem,
  focusReducer,
  initialFocusState,
  type FocusCtx,
  type FocusState,
} from "../machine.js";
import { isValidFocusState } from "../persist.js";
import { remainingS } from "../timer.js";
import { L1, P1, S1 } from "./fixtures.js";

const T = 5_000_000;
const CTX: FocusCtx = { plan: P1, library: L1 };

function state(patch: Partial<FocusState>): FocusState {
  return { ...initialFocusState(S1, P1, T), timer: null, ...patch };
}

const ctxWith = (n: number): FocusCtx => ({
  plan: { ...P1, items: P1.items.slice(0, n) },
  library: L1,
});

describe("PLAN_APPLIED (D-0120 §1)", () => {
  it("timeCheck → next at the same itemIndex, with the 60 s set-up from atMs", () => {
    const next = focusReducer(
      state({ phase: "timeCheck", itemIndex: 1 }),
      { type: "PLAN_APPLIED", atMs: T + 9 },
      CTX,
    );
    expect(next).toMatchObject({ phase: "next", itemIndex: 1, setIndex: 0 });
    expect(next.timer).toEqual({ startedAtMs: T + 9, durationS: NEXT_SETUP_S, pausedMs: 0 });
    expect(isValidFocusState(next, S1, CTX)).toBe(true);
  });

  it("nothing left (itemIndex ≥ items.length) → done", () => {
    const next = focusReducer(
      state({ phase: "timeCheck", itemIndex: 1 }),
      { type: "PLAN_APPLIED", atMs: T },
      ctxWith(1),
    );
    expect(next).toMatchObject({ phase: "done", timer: null });
  });

  it("paused on UF-09.8: resumePhase next, the set-up starting at the pause, so RESUME leaves 60 s", () => {
    const paused = state({
      phase: "paused",
      resumePhase: "timeCheck",
      pausedAtMs: T,
      itemIndex: 1,
    });
    const next = focusReducer(paused, { type: "PLAN_APPLIED", atMs: T + 5000 }, CTX);
    expect(next).toMatchObject({ phase: "paused", resumePhase: "next", itemIndex: 1 });
    expect(isValidFocusState(next, S1, CTX)).toBe(true);
    const resumed = focusReducer(next, { type: "RESUME", atMs: T + 30_000 }, CTX);
    expect(resumed.phase).toBe("next");
    expect(remainingS(resumed.timer!, T + 30_000)).toBe(60);
  });

  it("paused on UF-09.8 with nothing left: done, and the pause ends there", () => {
    const paused = state({
      phase: "paused",
      resumePhase: "timeCheck",
      pausedAtMs: T,
      itemIndex: 1,
      workoutPausedMs: 1000,
    });
    const next = focusReducer(paused, { type: "PLAN_APPLIED", atMs: T + 4000 }, ctxWith(1));
    expect(next).toMatchObject({
      phase: "done",
      resumePhase: null,
      pausedAtMs: null,
      workoutPausedMs: 5000,
    });
  });

  it.each(["set", "rest", "next"] as const)("is a no-op in %s (the same object)", (phase) => {
    const s = state({ phase, itemIndex: 1 });
    expect(focusReducer(s, { type: "PLAN_APPLIED", atMs: T }, CTX)).toBe(s);
  });
});

describe("SKIP_ITEM (D-0120 §7)", () => {
  it("ends the pause as RESUME does, and goes through betweenItems with the item skipped", () => {
    const s = state({
      phase: "paused",
      resumePhase: "rest",
      pausedAtMs: T,
      itemIndex: 0,
      workoutPausedMs: 2000,
      timer: { startedAtMs: T, durationS: 120, pausedMs: 0 },
    });
    const next = focusReducer(s, { type: "SKIP_ITEM", atMs: T + 3000 }, CTX);
    expect(next).toMatchObject({
      phase: "betweenItems",
      itemIndex: 0,
      skippedItems: [0],
      resumePhase: null,
      pausedAtMs: null,
      workoutPausedMs: 5000,
      timer: null,
    });
  });

  it("from getReady: next for item 0, warmupSpentMs 0", () => {
    const s = state({
      phase: "paused",
      resumePhase: "getReady",
      pausedAtMs: T,
      timer: { startedAtMs: T, durationS: 5, pausedMs: 0 },
    });
    const next = focusReducer(s, { type: "SKIP_ITEM", atMs: T + 1000 }, CTX);
    expect(next).toMatchObject({ phase: "next", itemIndex: 0, warmupSpentMs: 0, skippedItems: [] });
  });

  it.each([
    [
      "not paused",
      state({ phase: "rest", timer: { startedAtMs: T, durationS: 120, pausedMs: 0 } }),
    ],
    [
      "paused on UF-09.8",
      state({ phase: "paused", resumePhase: "timeCheck", pausedAtMs: T, itemIndex: 1 }),
    ],
    [
      "paused on the last item",
      state({ phase: "paused", resumePhase: "set", pausedAtMs: T, itemIndex: 3 }),
    ],
  ])("is a no-op %s", (_label, s) => {
    expect(focusReducer(s, { type: "SKIP_ITEM", atMs: T + 1000 }, CTX)).toBe(s);
  });

  it("the pair: paused on the item before the last skips", () => {
    const s = state({ phase: "paused", resumePhase: "set", pausedAtMs: T, itemIndex: 2 });
    expect(focusReducer(s, { type: "SKIP_ITEM", atMs: T + 1000 }, CTX).phase).toBe("betweenItems");
  });
});

describe("CHECK_RESOLVED past the last item", () => {
  it("is done, never a next on an item that doesn't exist", () => {
    const s = state({ phase: "betweenItems", itemIndex: 3 });
    expect(focusReducer(s, { type: "CHECK_RESOLVED", to: "next", atMs: T }, CTX)).toMatchObject({
      phase: "done",
      timer: null,
    });
  });

  it("the pair: with an item after it, next", () => {
    const s = state({ phase: "betweenItems", itemIndex: 2 });
    expect(focusReducer(s, { type: "CHECK_RESOLVED", to: "next", atMs: T }, CTX)).toMatchObject({
      phase: "next",
      itemIndex: 3,
    });
  });
});

describe("persist: D-0120 §5 and skippedItems", () => {
  it("a timeCheck at itemIndex = items.length is valid; = length + 1 is not; other phases at length are not", () => {
    expect(isValidFocusState(state({ phase: "timeCheck", itemIndex: 4 }), S1, CTX)).toBe(true);
    expect(isValidFocusState(state({ phase: "timeCheck", itemIndex: 5 }), S1, CTX)).toBe(false);
    expect(isValidFocusState(state({ phase: "set", itemIndex: 4 }), S1, CTX)).toBe(false);
  });

  it("skippedItems: in range and integers only", () => {
    expect(isValidFocusState(state({ phase: "set", skippedItems: [0, 3] }), S1, CTX)).toBe(true);
    expect(isValidFocusState(state({ phase: "set", skippedItems: [4] }), S1, CTX)).toBe(false);
    expect(isValidFocusState(state({ phase: "set", skippedItems: [0.5] }), S1, CTX)).toBe(false);
    expect(isValidFocusState({ ...state({ phase: "set" }), skippedItems: "0" }, S1, CTX)).toBe(
      false,
    );
  });
});

describe("canSkipItem in the warm-up (T-0304d AC-10)", () => {
  it("a one-item plan offers no Skip from the warm-up; the pair, a two-item plan, does", () => {
    const s = state({ phase: "paused", resumePhase: "warmup", pausedAtMs: T, itemIndex: 0 });
    expect(canSkipItem(s, ctxWith(1))).toBe(false);
    expect(canSkipItem(s, ctxWith(2))).toBe(true);
  });
});
