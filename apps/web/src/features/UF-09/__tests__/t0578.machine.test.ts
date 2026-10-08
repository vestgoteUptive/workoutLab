// T-0578 (D-0205 §9): "Do later" on the machine: predicate, permutation, ITEM_DEFERRED, restore.
import { timeCheck } from "@workoutlab/engine";
import type { SessionPlan } from "@workoutlab/shared";
import { describe, expect, it } from "vitest";
import {
  canDoLater,
  doLaterOrder,
  focusReducer,
  NEXT_SETUP_S,
  type FocusCtx,
  type FocusEvent,
  type FocusState,
} from "../machine.js";
import { isValidFocusState, readFocusState, writeFocusState } from "../persist.js";
import { createFocusStore } from "../store.js";
import { CURL, L1, S1 } from "./fixtures.js";
import { R8_BENCH, R8_CURL, R8_LATERAL, R8_PLAN, R8_ROW } from "./r8-fixtures.js";
import {
  CTX_P,
  NOW,
  PAUSED_AT,
  PLAN_P,
  PAUSED_NEXT,
  benchDone,
  logged,
  paused,
} from "./t0578-fixtures.js";

const ids = (p: SessionPlan) => p.items.map((i) => i.exerciseId);

/** What the session seam does: permutation, then the reducer against the new plan. */
function defer(state: FocusState, plan: SessionPlan = PLAN_P, atMs = NOW) {
  const moved = doLaterOrder(state, plan);
  if (!moved) throw new Error("not available");
  const ctx: FocusCtx = { plan: { ...plan, items: moved.items }, library: L1 };
  const event: FocusEvent = {
    type: "ITEM_DEFERRED",
    order: moved.order,
    current: moved.current,
    name: "x",
    atMs,
  };
  return { moved, ctx, state: focusReducer(state, event, ctx) };
}

describe("AC1 machine (from UF-09.6)", () => {
  it("paused from next for item 1: ids reorder, next for leg-extension with a 60 s set-up, bench sets stay at 0", () => {
    const out = defer(PAUSED_NEXT);
    expect(ids(out.ctx.plan)).toEqual(["bench-press", "leg-extension", "inverted-row"]);
    expect(out.state).toMatchObject({
      phase: "next",
      itemIndex: 1,
      setIndex: 0,
      resumePhase: null,
      pausedAtMs: null,
      timer: { startedAtMs: NOW, durationS: NEXT_SETUP_S, pausedMs: 0 },
      workoutPausedMs: NOW - PAUSED_AT,
    });
    expect(out.state.loggedSets.map((s) => s.itemIndex)).toEqual([0, 0, 0, 0]);
    expect(out.ctx.plan.mainLiftId).toBe("bench-press");
    expect(out.ctx.plan.items[0]!.isMain).toBe(true);
    expect(out.ctx.plan.items[1]!.prefill).toEqual(PLAN_P.items[2]!.prefill);
    expect(out.ctx.plan.items[2]!.prefill).toEqual(PLAN_P.items[1]!.prefill);
    expect(isValidFocusState(out.state, S1, out.ctx)).toBe(true);
  });
});

describe("AC2 machine (before the first set)", () => {
  it("paused from warmup: inverted-row first, the warm-up resumes where it was", () => {
    const start = paused("warmup", {
      warmupIndex: 1,
      warmupStartedAtMs: PAUSED_AT - 50_000,
    });
    const out = defer(start);
    expect(ids(out.ctx.plan)).toEqual(["inverted-row", "bench-press", "leg-extension"]);
    expect(out.state).toMatchObject({
      phase: "warmup",
      warmupIndex: 1,
      itemIndex: 0,
      resumePhase: null,
      pausedAtMs: null,
      warmupStartedAtMs: PAUSED_AT - 50_000 + (NOW - PAUSED_AT),
    });
    expect(out.state.timer).toEqual({ ...start.timer, pausedMs: NOW - PAUSED_AT });
    expect(out.ctx.plan.items[1]!.isMain).toBe(true);
    expect(out.ctx.plan.mainLiftId).toBe("bench-press");
  });

  it("a List-view set logged on the moved-over item follows it (itemIndex 1 becomes 0)", () => {
    const out = defer(
      paused("warmup", { warmupStartedAtMs: PAUSED_AT, loggedSets: [logged(1, 0)] }),
    );
    expect(out.state.loggedSets.map((s) => [s.itemIndex, s.exerciseId])).toEqual([
      [0, "inverted-row"],
    ]);
  });

  it("paused from getReady: resumes getReady", () => {
    const out = defer(paused("getReady"));
    expect(out.state.phase).toBe("getReady");
    expect(ids(out.ctx.plan)).toEqual(["inverted-row", "bench-press", "leg-extension"]);
  });
});

describe("AC3 repeat", () => {
  it("after AC1, deferring leg-extension (now item 1) again restores the first order", () => {
    const first = defer(PAUSED_NEXT);
    const again: FocusState = {
      ...first.state,
      phase: "paused",
      resumePhase: "next",
      pausedAtMs: NOW + 1000,
    };
    const out = defer(again, first.ctx.plan, NOW + 2000);
    expect(ids(out.ctx.plan)).toEqual(["bench-press", "inverted-row", "leg-extension"]);
    expect(out.state.loggedSets.map((s) => s.itemIndex)).toEqual([0, 0, 0, 0]);
    expect(out.state).toMatchObject({ phase: "next", itemIndex: 1 });
  });
});

describe("AC4 predicate", () => {
  const can = (s: FocusState) => canDoLater(s, PLAN_P, s.loggedSets);
  it("true in AC1's and AC2's states", () => {
    expect(can(PAUSED_NEXT)).toBe(true);
    expect(can(paused("warmup"))).toBe(true);
  });
  it("false when one bench set is logged and the pause is from set 2", () => {
    expect(can(paused("set", { itemIndex: 0, setIndex: 1, loggedSets: [logged(0, 0)] }))).toBe(
      false,
    );
  });
  it("false for a List-view set logged on the current item", () => {
    expect(can(paused("next", { itemIndex: 1, loggedSets: [logged(1, 2)] }))).toBe(false);
  });
  it("false when the current item is the last one neither complete nor skipped", () => {
    expect(can(paused("next", { itemIndex: 2, loggedSets: benchDone }))).toBe(false);
    const rowDone = [0, 1, 2].map((s) => logged(1, s));
    expect(
      can(paused("next", { itemIndex: 1, loggedSets: [...benchDone], skippedItems: [2] })),
    ).toBe(false);
    expect(can(paused("next", { itemIndex: 0, loggedSets: rowDone, skippedItems: [] }))).toBe(true);
  });
  it("false when resumePhase is timeCheck", () => {
    expect(can(paused("timeCheck", { itemIndex: 1, loggedSets: benchDone }))).toBe(false);
  });
  it("false when the current item is skipped", () => {
    expect(can(paused("next", { itemIndex: 1, loggedSets: benchDone, skippedItems: [1] }))).toBe(
      false,
    );
  });
  it("false when not paused", () => {
    expect(can({ ...PAUSED_NEXT, phase: "next", resumePhase: null })).toBe(false);
  });
  it("ITEM_DEFERRED outside a pause, or on a time-check pause, is a no-op", () => {
    const moved = doLaterOrder(PAUSED_NEXT, PLAN_P)!;
    const ctx = { plan: { ...PLAN_P, items: moved.items }, library: L1 };
    const ev = {
      type: "ITEM_DEFERRED",
      order: moved.order,
      current: 1,
      name: "x",
      atMs: NOW,
    } as const;
    const running = {
      ...PAUSED_NEXT,
      phase: "next",
      resumePhase: null,
      pausedAtMs: null,
    } as FocusState;
    expect(focusReducer(running, ev, ctx)).toBe(running);
    const check = paused("timeCheck", { itemIndex: 1, loggedSets: benchDone });
    expect(focusReducer(check, ev, ctx)).toBe(check);
  });
});

describe("AC5 time check unchanged", () => {
  const workout = (items: SessionPlan["items"]) => ({
    plan: { ...R8_PLAN, items },
    budgetMin: 45,
    warmupInBudget: true,
    energy: "normal" as const,
    itemsTotalS: items.reduce((n, i) => n + i.costS, 0),
    totalS: 0,
    unusedS: 0,
    sessionReasons: [],
  });
  it("R8: elapsed 1500, next 1; barbell-row after leg-curl keeps behindS 105", () => {
    const before = timeCheck(workout([R8_BENCH, R8_ROW, R8_CURL, R8_LATERAL]), {
      elapsedS: 1500,
      nextItemIndex: 1,
    });
    const state = paused("next", { itemIndex: 1, loggedSets: benchDone });
    const moved = doLaterOrder(state, R8_PLAN)!;
    expect(moved.items.map((i) => i.exerciseId)).toEqual([
      "bench-press",
      "leg-curl",
      "barbell-row",
      "lateral-raise",
    ]);
    const after = timeCheck(workout(moved.items), { elapsedS: 1500, nextItemIndex: moved.current });
    expect(before.behindS).toBe(105);
    expect(after.behindS).toBe(105);
  });
});

describe("AC6 skipped items remap", () => {
  it("4 items, item 1 skipped, current 2: item 2 moves after item 3; skippedItems follows the exercise", () => {
    const plan: SessionPlan = {
      ...PLAN_P,
      items: [PLAN_P.items[0]!, PLAN_P.items[1]!, PLAN_P.items[2]!, { ...CURL, exerciseId: "x4" }],
    };
    const start = paused("next", {
      itemIndex: 2,
      skippedItems: [1],
      loggedSets: benchDone,
    });
    const out = defer(start, plan);
    expect(ids(out.ctx.plan)).toEqual(["bench-press", "inverted-row", "x4", "leg-extension"]);
    expect(out.state.skippedItems).toEqual([1]);
    expect(out.ctx.plan.items[out.state.skippedItems[0]!]!.exerciseId).toBe("inverted-row");
    expect(out.state).toMatchObject({ phase: "next", itemIndex: 2 });
  });

  it("a skipped item between the two moves with its index", () => {
    const start = paused("next", { itemIndex: 0, skippedItems: [1], loggedSets: [] });
    const out = defer(start);
    expect(ids(out.ctx.plan)).toEqual(["inverted-row", "leg-extension", "bench-press"]);
    expect(out.state.skippedItems).toEqual([0]);
    expect(out.state).toMatchObject({ phase: "next", itemIndex: 1 });
  });
});

describe("AC8 restore realigns by exercise id", () => {
  const storage = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    };
  };
  it("a set of inverted-row stored at index 1 reads back at index 2 when the plan has it at 2", () => {
    const st = storage();
    const reordered: SessionPlan = {
      ...PLAN_P,
      items: [PLAN_P.items[0]!, PLAN_P.items[2]!, PLAN_P.items[1]!],
    };
    const state = paused("next", {
      itemIndex: 1,
      loggedSets: [...benchDone, logged(1, 0, "inverted-row")],
    });
    writeFocusState(st, S1, state);
    const read = readFocusState(S1, { plan: reordered, library: L1 }, st)!;
    expect(read.loggedSets.map((s) => s.itemIndex)).toEqual([0, 0, 0, 0, 2]);
  });

  it("skippedItems realign by the ids the state was written with", () => {
    const st = storage();
    const reordered: SessionPlan = {
      ...PLAN_P,
      items: [PLAN_P.items[0]!, PLAN_P.items[2]!, PLAN_P.items[1]!],
    };
    writeFocusState(st, S1, paused("next", { skippedItems: [1] }), PLAN_P);
    const read = readFocusState(S1, { plan: reordered, library: L1 }, st)!;
    expect(read.skippedItems).toEqual([2]);
  });

  it("an entry whose exercise is no longer in the plan stays where it is (a swap keeps old sets)", () => {
    const st = storage();
    const state = paused("next", { itemIndex: 1, loggedSets: [logged(1, 0, "gone-swapped")] });
    writeFocusState(st, S1, state);
    const read = readFocusState(S1, CTX_P, st)!;
    expect(read.loggedSets[0]!.itemIndex).toBe(1);
  });
});

describe("store.deferItem", () => {
  it("writes the remapped state to storage before it returns, under the new plan", () => {
    const m = new Map<string, string>();
    const st = {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    };
    const store = createFocusStore({
      sessionId: S1,
      ctx: CTX_P,
      initial: PAUSED_NEXT,
      storage: st,
    });
    const moved = doLaterOrder(PAUSED_NEXT, PLAN_P)!;
    store.deferItem(
      { ...PLAN_P, items: moved.items },
      { order: moved.order, current: moved.current, name: "Inverted row" },
      NOW,
    );
    expect(store.getState().phase).toBe("next");
    expect(store.getSnapshot().ctx.plan.items.map((i) => i.exerciseId)).toEqual([
      "bench-press",
      "leg-extension",
      "inverted-row",
    ]);
    const read = readFocusState(S1, store.getSnapshot().ctx, st)!;
    expect(read.phase).toBe("next");
  });
});
