// T-0414 (UF-09.5, UF-09.9, D-0140): the swap through the store. `replacePlan` writes the state
// D-0140 §4 produces, and the swap's rest ends at the store's check point for the next item.
import { describe, expect, it } from "vitest";
import { focusReducer, type FocusState } from "../machine.js";
import { focusKey, readFocusState } from "../persist.js";
import { createFocusStore } from "../store.js";
import { S1 } from "./fixtures.js";
import * as F from "./t0414-fixtures.js";

function pausedAc2(): FocusState {
  return focusReducer(F.AC2_START, { type: "PAUSE", atMs: F.PAUSE_AT }, F.BEFORE);
}

describe("T-0414 the swap through the focus store", () => {
  it("T-0414 AC6 replacePlan on AC2's paused state writes the resting state to storage", () => {
    const storage = F.memoryStorage();
    const store = createFocusStore({ sessionId: S1, ctx: F.BEFORE, initial: pausedAc2(), storage });
    const after = F.swapped(1, F.DB_ROW);
    store.replacePlan(after.plan, 1, F.SWAP_AT);
    const expected = focusReducer(
      pausedAc2(),
      { type: "PLAN_REPLACED", itemIndex: 1, atMs: F.SWAP_AT },
      after,
    );
    expect(store.getState()).toEqual(expected);
    expect(store.getState()).toMatchObject({ phase: "paused", resumePhase: "rest", setIndex: 1 });
    expect(JSON.parse(storage.getItem(focusKey(S1))!)).toEqual(expected);
    expect(readFocusState(S1, after, storage)).toEqual(expected);
  });

  it("T-0414 AC2 RESUME then REST_END through the store: UF-09.6 next for item 2", () => {
    const storage = F.memoryStorage();
    const store = createFocusStore({ sessionId: S1, ctx: F.BEFORE, initial: pausedAc2(), storage });
    store.replacePlan(F.swapped(1, F.DB_ROW).plan, 1, F.SWAP_AT);
    store.dispatch({ type: "RESUME", atMs: F.RESUME_AT });
    expect(store.getState().phase).toBe("rest");
    store.dispatch({ type: "REST_END", atMs: F.RESUME_AT + 120_000 });
    expect(store.getState()).toMatchObject({
      phase: "next",
      itemIndex: 2,
      setIndex: 0,
      timer: { startedAtMs: F.RESUME_AT + 120_000, durationS: 60, pausedMs: 0 },
    });
  });
});
