// T-0422 AC-7 (D-0153 §2, amends D-0140 §1): a swap of the current item while UF-09.4 is in play
// saves the recorded set as recorded, and the machine moves on as `SAVED` with no edit would,
// with the new item's set count and rest. The reducer half; the host half is t0422.host.test.tsx.
import { describe, expect, it } from "vitest";
import {
  AUTOSAVE_S,
  focusReducer,
  restFor,
  type FocusCtx,
  type FocusEvent,
  type FocusState,
} from "../machine.js";
import { isValidFocusState } from "../persist.js";
import { remainingS } from "../timer.js";
import { CURL, ROW, S1 } from "./fixtures.js";
import * as F from "./t0414-fixtures.js";

const P = F.PAUSE_AT;
const reduce = (s: FocusState, e: FocusEvent, ctx: FocusCtx) => focusReducer(s, e, ctx);
const swap = (s: FocusState, itemIndex: number, ctx: FocusCtx) =>
  reduce(s, { type: "PLAN_REPLACED", itemIndex, atMs: F.SWAP_AT }, ctx);

/** db-row × 3, in barbell-row's slot. */
const DB_ROW_3 = { ...ROW, exerciseId: "db-row" };
const ROW_CTX = F.swapped(1, DB_ROW_3);
const autosave = { startedAtMs: F.T0, durationS: AUTOSAVE_S, pausedMs: 0 };

/** UF-09.4 on barbell-row set 2 (setIndex 1): sets (1, 0) and (1, 1) logged. */
const CONFIRM_ROW_2 = F.at("confirm", {
  itemIndex: 1,
  setIndex: 1,
  timer: autosave,
  loggedSets: [F.logged(1, 0), F.logged(1, 1)],
});
const paused = (s: FocusState): FocusState => ({
  ...s,
  phase: "paused",
  resumePhase: s.phase,
  pausedAtMs: P,
});

describe("T-0422 AC-7 reducer, paused from confirm", () => {
  it("paused, resumePhase rest at setIndex 1, the db-row rest from the pause; loggedSets unchanged and valid", () => {
    const start = paused(CONFIRM_ROW_2);
    const s = swap(start, 1, ROW_CTX);
    expect(s).toMatchObject({
      phase: "paused",
      resumePhase: "rest",
      pausedAtMs: P,
      itemIndex: 1,
      setIndex: 1,
    });
    expect(s.timer).toEqual({
      startedAtMs: P,
      durationS: restFor("db-row", ROW_CTX.library),
      pausedMs: 0,
    });
    expect(s.loggedSets).toEqual(start.loggedSets);
    expect(s.loggedSets.map((x) => x.exerciseId)).toEqual(["barbell-row", "barbell-row"]);
    expect(isValidFocusState(s, S1, ROW_CTX)).toBe(true);

    // RESUME leaves the full rest, and its end leads to db-row set 3 (setIndex 2).
    const resumed = reduce(s, { type: "RESUME", atMs: F.RESUME_AT }, ROW_CTX);
    expect(resumed.phase).toBe("rest");
    expect(remainingS(resumed.timer!, F.RESUME_AT)).toBe(restFor("db-row", ROW_CTX.library));
    const after = reduce(resumed, { type: "REST_END", atMs: F.RESUME_AT + 200_000 }, ROW_CTX);
    expect(after).toMatchObject({ phase: "set", itemIndex: 1, setIndex: 2 });
  });
});

describe("T-0422 AC-7 reducer, running confirm", () => {
  it("rest at setIndex 1, starting at the event's atMs, no pause", () => {
    const s = swap(CONFIRM_ROW_2, 1, ROW_CTX);
    expect(s).toMatchObject({ phase: "rest", itemIndex: 1, setIndex: 1, resumePhase: null });
    expect(s.pausedAtMs).toBeNull();
    expect(s.timer).toEqual({
      startedAtMs: F.SWAP_AT,
      durationS: restFor("db-row", ROW_CTX.library),
      pausedMs: 0,
    });
    expect(s.loggedSets).toEqual(CONFIRM_ROW_2.loggedSets);
    expect(isValidFocusState(s, S1, ROW_CTX)).toBe(true);
  });

  it("the rest follows the new exercise's type: an isolation replacement rests 60 s", () => {
    const ctx = F.swapped(1, { ...ROW, exerciseId: "leg-curl" });
    expect(restFor("leg-curl", ctx.library)).toBe(60);
    expect(swap(CONFIRM_ROW_2, 1, ctx).timer).toEqual({
      startedAtMs: F.SWAP_AT,
      durationS: 60,
      pausedMs: 0,
    });
  });
});

describe("T-0422 AC-7 reducer, fewer sets", () => {
  const allThree = F.at("confirm", {
    itemIndex: 1,
    setIndex: 2,
    timer: autosave,
    loggedSets: [F.logged(1, 0), F.logged(1, 1), F.logged(1, 2)],
  });
  const ctx2 = F.swapped(1, F.DB_ROW); // db-row × 2

  it("confirm at (1, 2), all logged, swapped to 2 sets: rest at setIndex 1, then REST_END → betweenItems", () => {
    const s = swap(allThree, 1, ctx2);
    expect(s).toMatchObject({ phase: "rest", itemIndex: 1, setIndex: 1 });
    expect(isValidFocusState(s, S1, ctx2)).toBe(true);
    expect(s.loggedSets).toEqual(allThree.loggedSets);
    const ended = reduce(s, { type: "REST_END", atMs: F.SWAP_AT + 120_000 }, ctx2);
    expect(ended.phase).toBe("betweenItems");
  });

  it("the pair: swapped to 3 sets, the same start rests at setIndex 2 (no clamp)", () => {
    const s = swap(allThree, 1, ROW_CTX);
    expect(s).toMatchObject({ phase: "rest", itemIndex: 1, setIndex: 2 });
  });
});

describe("T-0422 AC-7 reducer, the last item", () => {
  /** A reps replacement × 2 in plank's slot (item 3, the last). */
  const LAST_CTX = F.swapped(3, { ...CURL, exerciseId: "db-row", sets: 2 });
  const confirmLast = F.at("confirm", {
    itemIndex: 3,
    setIndex: 1,
    timer: autosave,
    loggedSets: [F.logged(3, 0), F.logged(3, 1)],
  });

  it("paused from confirm on its last set: done, the pause ends, workoutPausedMs grows by atMs − P", () => {
    const start = { ...paused(confirmLast), workoutPausedMs: 5000 };
    const s = swap(start, 3, LAST_CTX);
    expect(s).toMatchObject({
      phase: "done",
      timer: null,
      resumePhase: null,
      pausedAtMs: null,
      workoutPausedMs: 5000 + (F.SWAP_AT - P),
    });
    expect(s.loggedSets).toEqual(start.loggedSets);
    expect(isValidFocusState(s, S1, LAST_CTX)).toBe(true);
  });

  it("not paused: done, timer null, workoutPausedMs unchanged", () => {
    const s = swap(confirmLast, 3, LAST_CTX);
    expect(s).toMatchObject({ phase: "done", timer: null, workoutPausedMs: 0 });
    expect(isValidFocusState(s, S1, LAST_CTX)).toBe(true);
  });

  it("the pair: the first set of the last item gives a rest, not done", () => {
    const first = { ...confirmLast, setIndex: 0, loggedSets: [F.logged(3, 0)] };
    expect(swap(first, 3, LAST_CTX)).toMatchObject({ phase: "rest", setIndex: 0 });
  });
});

describe("T-0422 AC-7 the pair: another item", () => {
  it("a PLAN_REPLACED for another item while paused from confirm returns the same state object", () => {
    const start = paused(CONFIRM_ROW_2);
    const ctx = F.swapped(2, { ...CURL, exerciseId: "db-row" });
    expect(swap(start, 2, ctx)).toBe(start);
    expect(swap(CONFIRM_ROW_2, 2, ctx)).toBe(CONFIRM_ROW_2);
  });
});
