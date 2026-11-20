// T-0947 (D-0245 §1 §3, UF-09.10) on the machine: ITEM_INSERTED, the store method, restore realign
// by exercise id, and AC14 (an item added on the last set of the last item is walked next).
import { describe, expect, it } from "vitest";
import { focusReducer, type FocusCtx, type FocusEvent, type Phase } from "../machine.js";
import { readFocusState, writeFocusState } from "../persist.js";
import { createFocusStore } from "../store.js";
import { S1 } from "./fixtures.js";
import { LIB, NOW, PAUSED_REST, PLAN_LATERAL, PLAN_P, logged, pausedP } from "./t0947-fixtures.js";

const CTX_NEW: FocusCtx = { plan: PLAN_LATERAL, library: LIB };
const insert = (atIndex: number): FocusEvent => ({ type: "ITEM_INSERTED", atIndex, atMs: NOW });

describe("AC1 shifted indices (B9)", () => {
  const state = pausedP("set", {
    itemIndex: 0,
    setIndex: 2,
    loggedSets: [
      logged(0, 0, "bench-press"),
      logged(0, 1, "bench-press"),
      logged(2, 0, "leg-extension"),
    ],
  });

  it("the leg-extension set goes to 3, bench sets stay at 0, nothing else moves", () => {
    const next = focusReducer(state, insert(1), CTX_NEW);
    expect(next.loggedSets.map((s) => s.itemIndex)).toEqual([0, 0, 3]);
    expect(next).toMatchObject({
      phase: "paused",
      itemIndex: 0,
      setIndex: 2,
      resumePhase: "set",
      pausedAtMs: state.pausedAtMs,
      workoutPausedMs: state.workoutPausedMs,
      timer: state.timer,
      timerPausedAtMs: state.timerPausedAtMs,
    });
  });

  it("a set logged on the item exactly at atIndex moves too (the shift is i >= atIndex)", () => {
    const atBoundary = pausedP("set", {
      itemIndex: 0,
      setIndex: 1,
      loggedSets: [logged(0, 0, "bench-press"), logged(1, 0, "inverted-row")],
    });
    const next = focusReducer(atBoundary, insert(1), CTX_NEW);
    expect(next.loggedSets.map((s) => s.itemIndex)).toEqual([0, 2]);
  });

  it("a rest pause keeps its timer object exactly", () => {
    const next = focusReducer(PAUSED_REST, insert(1), CTX_NEW);
    expect(next.timer).toBe(PAUSED_REST.timer);
    expect(next.resumePhase).toBe("rest");
  });
});

describe("AC2 skippedItems", () => {
  it("[2] with an insert at 1 becomes [3]; [0] stays [0]", () => {
    const base = pausedP("next", { itemIndex: 1 });
    expect(focusReducer({ ...base, skippedItems: [2] }, insert(1), CTX_NEW).skippedItems).toEqual([
      3,
    ]);
    expect(focusReducer({ ...base, skippedItems: [0] }, insert(1), CTX_NEW).skippedItems).toEqual([
      0,
    ]);
  });

  it("a skipped item exactly at atIndex moves too: [1] with an insert at 1 becomes [2]", () => {
    const base = pausedP("next", { itemIndex: 0 });
    expect(focusReducer({ ...base, skippedItems: [1] }, insert(1), CTX_NEW).skippedItems).toEqual([
      2,
    ]);
  });
});

describe("AC3 paused only", () => {
  const phases: Phase[] = [
    "getReady",
    "warmup",
    "set",
    "confirm",
    "rest",
    "timed",
    "betweenItems",
    "next",
    "timeCheck",
    "done",
  ];
  it.each(phases)("%s: the state is unchanged", (phase) => {
    const state = {
      ...pausedP(null),
      phase,
      resumePhase: null,
      pausedAtMs: null,
      loggedSets: [logged(2, 0, "leg-extension")],
    };
    expect(focusReducer(state, insert(1), CTX_NEW)).toBe(state);
  });

  it("a pause taken on UF-09.8 is unchanged too", () => {
    const state = pausedP("timeCheck", { itemIndex: 1 });
    expect(focusReducer(state, insert(1), CTX_NEW)).toBe(state);
  });

  it("an atIndex outside the new plan is ignored", () => {
    const state = pausedP("set", { loggedSets: [logged(2, 0, "leg-extension")] });
    expect(focusReducer(state, insert(4), CTX_NEW)).toBe(state);
    expect(focusReducer(state, insert(-1), CTX_NEW)).toBe(state);
  });
});

describe("store.insertItem", () => {
  it("walks the new plan, writes the shifted state, and reports false when not paused", () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    };
    const state = pausedP("set", { setIndex: 2, loggedSets: [logged(2, 0, "leg-extension")] });
    const store = createFocusStore({
      sessionId: S1,
      ctx: { plan: PLAN_P, library: LIB },
      initial: state,
      storage,
    });
    expect(store.insertItem(PLAN_LATERAL, 1, NOW)).toBe(true);
    expect(store.getSnapshot().ctx.plan).toBe(PLAN_LATERAL);
    expect(store.getState().loggedSets[0]!.itemIndex).toBe(3);
    expect(JSON.parse(data.get(`wl-focus:${S1}`)!).loggedSets[0].itemIndex).toBe(3);

    store.dispatch({ type: "RESUME", atMs: NOW });
    const ctxBefore = store.getSnapshot().ctx;
    expect(store.insertItem(PLAN_P, 1, NOW)).toBe(false);
    expect(store.getSnapshot().ctx).toBe(ctxBefore);
  });
});

describe("AC11 restore realigns by exercise id (D-0245 §3)", () => {
  const storage = () => {
    const data = new Map<string, string>();
    return {
      data,
      s: {
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => void data.set(k, v),
        removeItem: (k: string) => void data.delete(k),
      },
    };
  };

  it("a state written for three items, read against four, keeps every set on its exercise", () => {
    const { s } = storage();
    const old = pausedP("set", {
      itemIndex: 0,
      setIndex: 2,
      loggedSets: [
        logged(0, 0, "bench-press"),
        logged(0, 1, "bench-press"),
        logged(2, 0, "leg-extension"),
      ],
      skippedItems: [1],
    });
    writeFocusState(s, S1, old, PLAN_P);
    const restored = readFocusState(S1, CTX_NEW, s)!;
    expect(restored.phase).toBe("paused");
    expect(restored.loggedSets.map((x) => [x.exerciseId, x.itemIndex])).toEqual([
      ["bench-press", 0],
      ["bench-press", 0],
      ["leg-extension", 3],
    ]);
    expect(restored.skippedItems).toEqual([2]);
  });

  it("a state and plan that agree restore unchanged (D-0111 §7)", () => {
    const { s } = storage();
    const agree = pausedP(
      "set",
      { itemIndex: 0, setIndex: 2, loggedSets: [logged(3, 0, "leg-extension")] },
      PLAN_LATERAL,
    );
    writeFocusState(s, S1, agree, PLAN_LATERAL);
    expect(readFocusState(S1, CTX_NEW, s)).toEqual({ ...agree, timerPausedAtMs: null });
  });
});

describe("AC14 an item added on the last set of the last item (B8)", () => {
  it("after leg-extension set 2 of 2 the next step is UF-09.6 for the added item, not done", () => {
    const BICEPS = { ...PLAN_LATERAL.items[3]!, exerciseId: "biceps-curl", sets: 3, costS: 375 };
    const planAdded = { ...PLAN_P, items: [...PLAN_P.items, BICEPS] };
    const loggedAhead = [
      ...[0, 1, 2, 3].map((i) => logged(0, i, "bench-press")),
      ...[0, 1, 2].map((i) => logged(1, i, "inverted-row")),
      logged(2, 0, "leg-extension"),
    ];
    const state = pausedP("set", { itemIndex: 2, setIndex: 1, loggedSets: loggedAhead });
    const store = createFocusStore({
      sessionId: S1,
      ctx: { plan: PLAN_P, library: LIB },
      initial: state,
      storage: null,
    });
    expect(store.insertItem(planAdded, 3, NOW)).toBe(true);
    store.dispatch({ type: "RESUME", atMs: NOW + 1000 });
    expect(store.getState().phase).toBe("set");
    store.dispatch({
      type: "SET_RECORDED",
      set: logged(2, 1, "leg-extension"),
      atMs: NOW + 2000,
    });
    store.dispatch({ type: "SAVED", atMs: NOW + 3000 });
    // Leg-extension was the last item before the add: the walk goes on to the added one.
    expect(store.getState().phase).toBe("rest");
    store.dispatch({ type: "REST_END", atMs: NOW + 4000 });
    expect(store.getState()).toMatchObject({ phase: "next", itemIndex: 3, setIndex: 0 });
  });
});
