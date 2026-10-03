// T-0415 (D-0142 §2, D-0153 §1 §3): REST_END after the finished last item, and entering an item
// at its first free set, through the reducer and the store. P1: bench ×4, row ×3, curl ×3, plank ×2.
import { describe, expect, it, vi } from "vitest";
import { focusReducer, type FocusCtx, type FocusState, type LoggedSet } from "../machine.js";
import { isValidFocusState } from "../persist.js";
import { createFocusStore, type ResolveCheckPoint } from "../store.js";
import { P1, S1 } from "./fixtures.js";
import { memoryStorage, T0 } from "./t0414-fixtures.js";
import { at, LIB, logged } from "./t0414-fixtures.js";

const ctx: FocusCtx = { plan: P1, library: LIB };
const valid = (s: FocusState) =>
  expect(isValidFocusState(JSON.parse(JSON.stringify(s)), S1, ctx)).toBe(true);
const sets = (item: number, n: number): LoggedSet[] =>
  Array.from({ length: n }, (_, i) => logged(item, i));
const bench4 = sets(0, 4);

describe("T-0415 AC-2 REST_END after the finished last item", () => {
  it("reducer: rest on plank with both sets logged gives done", () => {
    const s = at("rest", { itemIndex: 3, setIndex: 1, loggedSets: [...bench4, ...sets(3, 2)] });
    const next = focusReducer(s, { type: "REST_END", atMs: T0 + 1 }, ctx);
    expect(next).toMatchObject({ phase: "done", timer: null, itemIndex: 3 });
    valid(next);
  });

  it("through the store: no check point call, done stored", () => {
    const resolveCheckPoint = vi.fn<ResolveCheckPoint>(() => "next");
    const initial = at("rest", {
      itemIndex: 3,
      setIndex: 1,
      loggedSets: [...bench4, ...sets(3, 2)],
    });
    const store = createFocusStore({
      sessionId: S1,
      ctx,
      initial,
      storage: memoryStorage(),
      resolveCheckPoint,
    });
    store.dispatch({ type: "REST_END", atMs: T0 + 1 });
    expect(store.getState().phase).toBe("done");
    expect(resolveCheckPoint).toHaveBeenCalledTimes(0);
  });

  it("pair: item 0 all logged gives betweenItems, the store calls the resolver once -> next item 1", () => {
    const resolveCheckPoint = vi.fn<ResolveCheckPoint>(() => "next");
    const s = at("rest", { itemIndex: 0, setIndex: 3, loggedSets: bench4 });
    expect(focusReducer(s, { type: "REST_END", atMs: T0 + 1 }, ctx).phase).toBe("betweenItems");
    const store = createFocusStore({
      sessionId: S1,
      ctx,
      initial: s,
      storage: memoryStorage(),
      resolveCheckPoint,
    });
    store.dispatch({ type: "REST_END", atMs: T0 + 1 });
    expect(resolveCheckPoint).toHaveBeenCalledTimes(1);
    expect(store.getState()).toMatchObject({ phase: "next", itemIndex: 1 });
  });

  it("pair on the last item: one plank set logged gives timed for set 1", () => {
    const s = at("rest", { itemIndex: 3, setIndex: 0, loggedSets: [...bench4, ...sets(3, 1)] });
    const next = focusReducer(s, { type: "REST_END", atMs: T0 + 1 }, ctx);
    expect(next).toMatchObject({ phase: "timed", setIndex: 1 });
  });
});

describe("T-0415 AC-5 entering an item at its first free set", () => {
  it("READY reps: row with (1,0) logged enters set 1", () => {
    const s = at("next", { itemIndex: 1, loggedSets: [...bench4, logged(1, 0)] });
    const next = focusReducer(s, { type: "READY", atMs: T0 }, ctx);
    expect(next).toMatchObject({ phase: "set", setIndex: 1 });
    valid(next);
  });

  it("READY timed: plank with (3,0) logged enters timed set 1 with a fresh timer", () => {
    const s = at("next", { itemIndex: 3, loggedSets: [...bench4, logged(3, 0)] });
    const next = focusReducer(s, { type: "READY", atMs: T0 + 5 }, ctx);
    expect(next).toMatchObject({ phase: "timed", setIndex: 1, timer: { startedAtMs: T0 + 5 } });
    valid(next);
  });

  it("pair: nothing logged on the row enters set 0", () => {
    const s = at("next", { itemIndex: 1, loggedSets: bench4 });
    expect(focusReducer(s, { type: "READY", atMs: T0 }, ctx)).toMatchObject({
      phase: "set",
      setIndex: 0,
    });
  });

  it("no free set: row fully logged gives betweenItems, and the store reaches next for item 2", () => {
    const s = at("next", { itemIndex: 1, loggedSets: [...bench4, ...sets(1, 3)] });
    expect(focusReducer(s, { type: "READY", atMs: T0 }, ctx).phase).toBe("betweenItems");
    const store = createFocusStore({ sessionId: S1, ctx, initial: s, storage: memoryStorage() });
    store.dispatch({ type: "READY", atMs: T0 });
    expect(store.getState()).toMatchObject({ phase: "next", itemIndex: 2 });
  });

  it("no free set: plank fully logged gives done", () => {
    const s = at("next", { itemIndex: 3, loggedSets: [...bench4, ...sets(3, 2)] });
    const next = focusReducer(s, { type: "READY", atMs: T0 }, ctx);
    expect(next).toMatchObject({ phase: "done", timer: null });
    valid(next);
  });

  it("COUNTDOWN_END and SKIP_WARMUP with no warm-up and (0,0) logged enter set 1", () => {
    const plan = { ...P1, warmup: [] };
    const c: FocusCtx = { plan, library: LIB };
    const s = at("getReady", { loggedSets: [logged(0, 0)] });
    expect(focusReducer(s, { type: "COUNTDOWN_END", atMs: T0 }, c)).toMatchObject({
      phase: "set",
      itemIndex: 0,
      setIndex: 1,
    });
    expect(focusReducer(s, { type: "SKIP_WARMUP", atMs: T0 }, c)).toMatchObject({
      phase: "set",
      itemIndex: 0,
      setIndex: 1,
    });
  });
});
