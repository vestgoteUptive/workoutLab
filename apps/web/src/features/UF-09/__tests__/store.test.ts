// T-0304a AC-3 (NFR-OFF-2, D-0111 §6): the store writes `wl-focus:<id>` synchronously, before
// `dispatch` returns and before any subscriber hears of it. A throwing storage never stops a
// transition.
import { afterEach, describe, expect, it, vi } from "vitest";
import { initialFocusState, type FocusEvent, type FocusState, type LoggedSet } from "../machine.js";
import { createFocusStore } from "../store.js";
import type { ViewEvent } from "../views.js";
import { BENCH, L1, P1, S1, planWith } from "./fixtures.js";

const T0 = 2_000_000;
const KEY = "wl-focus:S1";

function set(itemIndex: number, setIndex: number, exerciseId: string, backoff = false): LoggedSet {
  return {
    clientId: `c-${itemIndex}-${setIndex}`,
    itemIndex,
    setIndex,
    exerciseId,
    reps: 6,
    weightKg: 80,
    durationS: null,
    rir: null,
    backoff,
  };
}

/** Every transition of the AC-1 table, in one walk over P1 with a back-off on bench-press. */
function walk(): FocusEvent[] {
  const e: FocusEvent[] = [];
  let t = T0;
  const at = () => (t += 1000);
  e.push({ type: "PAUSE", atMs: at() }, { type: "RESUME", atMs: at() });
  e.push({ type: "COUNTDOWN_END", atMs: at() });
  e.push({ type: "WARMUP_NEXT", atMs: at() }, { type: "WARMUP_RESTART", atMs: at() });
  e.push({ type: "PAUSE", atMs: at() }, { type: "RESUME", atMs: at() });
  e.push(
    { type: "WARMUP_NEXT", atMs: at() },
    { type: "WARMUP_NEXT", atMs: at() },
    { type: "WARMUP_NEXT", atMs: at() },
  );
  e.push({ type: "PAUSE", atMs: at() }, { type: "RESUME", atMs: at() });
  e.push({ type: "READY", atMs: at() });
  for (let i = 0; i < 5; i += 1) {
    e.push({ type: "SET_RECORDED", set: set(0, i, "bench-press", i === 4), atMs: at() });
    e.push({ type: "PAUSE", atMs: at() }, { type: "RESUME", atMs: at() });
    e.push({ type: "SAVED", atMs: at() });
    e.push(
      { type: "REST_ADJUST", deltaS: -15, atMs: at() },
      { type: "REST_ADJUST", deltaS: 15, atMs: at() },
    );
    e.push({ type: "PAUSE", atMs: at() }, { type: "RESUME", atMs: at() });
    e.push({ type: "REST_END", atMs: at() });
  }
  e.push({ type: "READY", atMs: at() });
  for (let i = 0; i < 3; i += 1) {
    e.push(
      { type: "SET_RECORDED", set: set(1, i, "barbell-row"), atMs: at() },
      { type: "SAVED", atMs: at() },
      { type: "REST_END", atMs: at() },
    );
  }
  e.push({ type: "READY", atMs: at() });
  for (let i = 0; i < 3; i += 1) {
    e.push(
      { type: "SET_RECORDED", set: set(2, i, "leg-curl"), atMs: at() },
      { type: "SAVED", atMs: at() },
      { type: "REST_END", atMs: at() },
    );
  }
  e.push({ type: "READY", atMs: at() });
  e.push({ type: "PAUSE", atMs: at() }, { type: "RESUME", atMs: at() });
  e.push(
    { type: "TIMED_RECORDED", set: { ...set(3, 0, "plank"), durationS: 50 }, atMs: at() },
    { type: "REST_END", atMs: at() },
  );
  e.push({ type: "TIMED_RECORDED", set: { ...set(3, 1, "plank"), durationS: 50 }, atMs: at() });
  return e;
}

const PLAN = planWith({
  items: [{ ...BENCH, backoff: { weightKg: 70, reps: 6 } }, ...P1.items.slice(1)],
});
const CTX = { plan: PLAN, library: L1 };

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("AC-3 written before dispatch returns", () => {
  it("after every transition of the walk, localStorage parses to {version: 1, …} deep-equal to getState()", () => {
    const store = createFocusStore({
      sessionId: S1,
      ctx: CTX,
      initial: initialFocusState(S1, PLAN, T0),
      storage: window.localStorage,
    });
    const phases: string[] = [];
    for (const event of walk()) {
      const before = store.getState();
      store.dispatch(event);
      // No await, act or timer advance between the dispatch and this read.
      const raw = window.localStorage.getItem(KEY);
      expect(raw, event.type).not.toBeNull();
      const stored = JSON.parse(raw!) as FocusState;
      expect(store.getState(), event.type).not.toBe(before);
      expect(stored.version).toBe(1);
      expect(stored).toEqual(store.getState());
      phases.push(stored.phase);
    }
    expect(store.getState().phase).toBe("done");
    expect(new Set(phases)).toEqual(
      new Set(["paused", "getReady", "warmup", "next", "set", "confirm", "rest", "timed", "done"]),
    );
  });

  it("subscribers are notified only after the write", () => {
    const store = createFocusStore({
      sessionId: S1,
      ctx: CTX,
      initial: initialFocusState(S1, PLAN, T0),
      storage: window.localStorage,
    });
    const seen: string[] = [];
    store.subscribe(() =>
      seen.push((JSON.parse(window.localStorage.getItem(KEY)!) as FocusState).phase),
    );
    store.dispatch({ type: "COUNTDOWN_END", atMs: T0 + 5000 });
    store.dispatch({ type: "PAUSE", atMs: T0 + 6000 });
    expect(seen).toEqual(["warmup", "paused"]);
  });

  it("a no-op event neither writes nor notifies (the pair of a transition)", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const store = createFocusStore({
      sessionId: S1,
      ctx: CTX,
      initial: initialFocusState(S1, PLAN, T0),
      storage: window.localStorage,
    });
    const listener = vi.fn();
    store.subscribe(listener);
    store.dispatch({ type: "REST_END", atMs: T0 });
    expect(setItem).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
    store.dispatch({ type: "COUNTDOWN_END", atMs: T0 });
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("AC-3 throwing storage", () => {
  it("with setItem throwing, dispatch still transitions and doesn't throw", () => {
    const storage = {
      getItem: vi.fn(() => null),
      removeItem: vi.fn(),
      setItem: vi.fn(() => {
        throw new DOMException("quota", "QuotaExceededError");
      }),
    };
    const store = createFocusStore({
      sessionId: S1,
      ctx: CTX,
      initial: initialFocusState(S1, PLAN, T0),
      storage,
    });
    const listener = vi.fn();
    store.subscribe(listener);
    expect(() => store.dispatch({ type: "COUNTDOWN_END", atMs: T0 + 5000 })).not.toThrow();
    expect(store.getState().phase).toBe("warmup");
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(() => store.dispatch({ type: "SKIP_WARMUP", atMs: T0 })).not.toThrow();
  });

  it("with no storage at all (null), it still transitions", () => {
    const store = createFocusStore({
      sessionId: S1,
      ctx: CTX,
      initial: initialFocusState(S1, PLAN, T0),
      storage: null,
    });
    store.dispatch({ type: "SKIP_WARMUP", atMs: T0 });
    expect(store.getState().phase).toBe("set");
  });
});

// T-0304d AC-9 (the T-0304a QA follow-up): the events T-0304b–d added, each written before
// `dispatch` (or `applyPlan`) returns.
describe("T-0304d AC-9 the walk gains the T-0304b–d events", () => {
  it("SKIP_WARMUP, AUTOSAVE_CANCEL, SKIP_ITEM, CHECK_RESOLVED → timeCheck, CONTINUE, PLAN_APPLIED, TIMER_PAUSE, TIMER_RESUME", () => {
    const answers: Array<"next" | "timeCheck"> = ["timeCheck", "timeCheck", "next"];
    const store = createFocusStore({
      sessionId: S1,
      ctx: CTX,
      initial: initialFocusState(S1, PLAN, T0),
      storage: window.localStorage,
      resolveCheckPoint: () => answers.shift() ?? "next",
    });
    let t = T0;
    const seen: string[] = [];
    const written = (label: string) => {
      // No await, act or timer advance between the call and this read.
      const stored = JSON.parse(window.localStorage.getItem(KEY)!) as FocusState;
      expect(stored, label).toEqual(store.getState());
      seen.push(`${label}:${stored.phase}`);
      return stored;
    };
    const send = (event: ViewEvent) => {
      store.dispatch({ ...event, atMs: (t += 1000) } as FocusEvent);
      return written(event.type);
    };

    expect(send({ type: "SKIP_WARMUP" }).phase).toBe("set");
    send({ type: "SET_RECORDED", set: set(0, 0, "bench-press") });
    expect(send({ type: "AUTOSAVE_CANCEL" }).timer).toBeNull();
    send({ type: "SAVED" });
    send({ type: "PAUSE" });
    // SKIP_ITEM ends item 0; the check point answers "timeCheck" (CHECK_RESOLVED → timeCheck).
    expect(send({ type: "SKIP_ITEM" })).toMatchObject({
      phase: "timeCheck",
      itemIndex: 1,
      skippedItems: [0],
    });
    expect(send({ type: "CONTINUE" })).toMatchObject({ phase: "next", itemIndex: 1 });
    send({ type: "READY" });
    for (let i = 0; i < 3; i += 1) {
      send({ type: "SET_RECORDED", set: set(1, i, "barbell-row") });
      send({ type: "SAVED" });
      send({ type: "REST_END" });
    }
    expect(store.getState()).toMatchObject({ phase: "timeCheck", itemIndex: 2 });
    const trimmed = {
      ...PLAN,
      items: PLAN.items.map((item, i) => (i === 2 ? { ...item, sets: 2 } : item)),
    };
    store.applyPlan(trimmed, (t += 1000));
    expect(written("PLAN_APPLIED")).toMatchObject({ phase: "next", itemIndex: 2 });
    expect(store.getSnapshot().ctx.plan).toBe(trimmed);
    send({ type: "READY" });
    send({ type: "PAUSE" });
    expect(send({ type: "SKIP_ITEM" })).toMatchObject({
      phase: "next",
      itemIndex: 3,
      skippedItems: [0, 2],
    });
    expect(send({ type: "READY" }).phase).toBe("timed");
    expect(send({ type: "TIMER_PAUSE" }).timerPausedAtMs).not.toBeNull();
    expect(send({ type: "TIMER_RESUME" }).timerPausedAtMs).toBeNull();
    expect(seen).toContain("SKIP_ITEM:timeCheck");
    expect(seen).toContain("PLAN_APPLIED:next");
  });
});
