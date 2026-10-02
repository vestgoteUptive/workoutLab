// @vitest-environment node
// T-0304a AC-1 (D-0111 §4): focusReducer transitions, pure, from P1.
import { describe, expect, it } from "vitest";
import { REST_COMPOUND_S, REST_ISOLATION_S } from "@workoutlab/engine";
import {
  focusReducer,
  initialFocusState,
  type FocusCtx,
  type FocusEvent,
  type FocusState,
  type LoggedSet,
  type Phase,
} from "../machine.js";
import { remainingS } from "../timer.js";
import { createFocusStore } from "../store.js";
import { BENCH, CURL, L1, P1, PLANK, ROW, S1, planWith } from "./fixtures.js";

const CTX: FocusCtx = { plan: P1, library: L1 };
const T0 = 1_000_000;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

function ev(type: FocusEvent["type"], atMs: number, extra: object = {}): FocusEvent {
  return { type, atMs, ...extra } as FocusEvent;
}

function run(state: FocusState, events: FocusEvent[], ctx: FocusCtx = CTX): FocusState {
  return events.reduce((s, e) => focusReducer(s, e, ctx), state);
}

function at(phase: Phase, patch: Partial<FocusState> = {}): FocusState {
  return { ...initialFocusState(S1, P1, T0), phase, timer: null, ...patch };
}

function logged(
  itemIndex: number,
  setIndex: number,
  exerciseId: string,
  backoff = false,
): LoggedSet {
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

/** Walks one reps item from `set` setIndex 0 through its sets, ending after the last SAVED. */
function walkItem(state: FocusState, itemIndex: number, sets: number, ctx: FocusCtx = CTX) {
  let s = state;
  const item = ctx.plan.items[itemIndex]!;
  for (let i = 0; i < sets; i += 1) {
    s = run(
      s,
      [ev("SET_RECORDED", T0, { set: logged(itemIndex, i, item.exerciseId, false) })],
      ctx,
    );
    s = run(s, [ev("SAVED", T0)], ctx);
    if (i < sets - 1) {
      expect(s.phase).toBe("rest");
      s = run(s, [ev("REST_END", T0)], ctx);
    }
  }
  return s;
}

describe("AC-1 purity", () => {
  it("frozen state, event and ctx: no throw, and two calls are deep-equal", () => {
    const state = deepFreeze(at("set"));
    const event = deepFreeze(ev("SET_RECORDED", T0, { set: logged(0, 0, "bench-press") }));
    const ctx = deepFreeze({ plan: structuredClone(P1), library: structuredClone(L1) });
    const a = focusReducer(state, event, ctx);
    const b = focusReducer(state, event, ctx);
    expect(a).toEqual(b);
    expect(a).not.toBe(state);
    // Every event against frozen inputs, from every phase.
    const types: FocusEvent["type"][] = [
      "COUNTDOWN_END",
      "SKIP_WARMUP",
      "WARMUP_NEXT",
      "WARMUP_RESTART",
      "SET_RECORDED",
      "SAVED",
      "REST_END",
      "REST_ADJUST",
      "CHECK_RESOLVED",
      "CONTINUE",
      "READY",
      "TIMED_RECORDED",
      "PAUSE",
      "RESUME",
    ];
    const phases: Phase[] = [
      "getReady",
      "warmup",
      "set",
      "confirm",
      "rest",
      "next",
      "timed",
      "timeCheck",
      "paused",
      "betweenItems",
      "done",
    ];
    for (const phase of phases) {
      const s = deepFreeze(
        at(phase, {
          timer: { startedAtMs: T0, durationS: 40, pausedMs: 0 },
          pausedAtMs: phase === "paused" ? T0 : null,
          resumePhase: phase === "paused" ? "rest" : null,
          warmupStartedAtMs: T0,
        }),
      );
      for (const type of types) {
        const e = deepFreeze(
          ev(type, T0 + 1000, { set: logged(0, 0, "bench-press"), deltaS: 15, to: "next" }),
        );
        expect(() => focusReducer(s, e, ctx)).not.toThrow();
        expect(focusReducer(s, e, ctx)).toEqual(focusReducer(s, e, ctx));
      }
    }
  });

  it("an event that doesn't apply returns the same state object", () => {
    const set = at("set");
    expect(focusReducer(set, ev("REST_END", T0), CTX)).toBe(set);
    const rest = at("rest", { timer: { startedAtMs: T0, durationS: 120, pausedMs: 0 } });
    expect(focusReducer(rest, ev("READY", T0), CTX)).toBe(rest);
    // The pair: an event that does apply returns a new object.
    expect(focusReducer(rest, ev("REST_END", T0), CTX)).not.toBe(rest);
  });
});

describe("AC-1 table from P1", () => {
  it("getReady + COUNTDOWN_END → warmup move 0 with a 40 s timer started at atMs", () => {
    const s = run(initialFocusState(S1, P1, T0), [ev("COUNTDOWN_END", T0 + 5000)]);
    expect(s).toMatchObject({
      phase: "warmup",
      warmupIndex: 0,
      timer: { startedAtMs: T0 + 5000, durationS: 40, pausedMs: 0 },
    });
  });

  it("getReady + SKIP_WARMUP → set item 0 setIndex 0, warmupSpentMs 0", () => {
    const s = run(initialFocusState(S1, P1, T0), [ev("SKIP_WARMUP", T0 + 1000)]);
    expect(s).toMatchObject({
      phase: "set",
      itemIndex: 0,
      setIndex: 0,
      warmupSpentMs: 0,
      timer: null,
    });
  });

  it("warmup move 1 + WARMUP_NEXT → move 2; WARMUP_RESTART restarts the same move at atMs", () => {
    const m1 = at("warmup", {
      warmupIndex: 1,
      timer: { startedAtMs: T0, durationS: 40, pausedMs: 0 },
    });
    const m2 = run(m1, [ev("WARMUP_NEXT", T0 + 40_000)]);
    expect(m2).toMatchObject({
      phase: "warmup",
      warmupIndex: 2,
      timer: { startedAtMs: T0 + 40_000, durationS: 40 },
    });
    const restarted = run(m2, [ev("WARMUP_RESTART", T0 + 52_000)]);
    expect(restarted).toMatchObject({
      phase: "warmup",
      warmupIndex: 2,
      timer: { startedAtMs: T0 + 52_000, durationS: 40, pausedMs: 0 },
    });
  });

  it("warmup move 3 + WARMUP_NEXT → next item 0 with a 60 s timer", () => {
    const m3 = at("warmup", {
      warmupIndex: 3,
      warmupStartedAtMs: T0,
      timer: { startedAtMs: T0, durationS: 40, pausedMs: 0 },
    });
    const s = run(m3, [ev("WARMUP_NEXT", T0 + 40_000)]);
    expect(s).toMatchObject({
      phase: "next",
      itemIndex: 0,
      timer: { startedAtMs: T0 + 40_000, durationS: 60, pausedMs: 0 },
    });
  });

  it("next + READY → set item 0", () => {
    const s = run(at("next", { timer: { startedAtMs: T0, durationS: 60, pausedMs: 0 } }), [
      ev("READY", T0),
    ]);
    expect(s).toMatchObject({ phase: "set", itemIndex: 0, setIndex: 0, timer: null });
  });

  it("set + SET_RECORDED → confirm, with loggedSets gaining that entry", () => {
    const entry = logged(0, 0, "bench-press");
    const s = run(at("set"), [ev("SET_RECORDED", T0, { set: entry })]);
    expect(s.phase).toBe("confirm");
    expect(s.loggedSets).toEqual([entry]);
  });

  it("confirm + SAVED on bench-press set 0 → rest 120 s (REST_COMPOUND_S); REST_END → set 1", () => {
    const s = run(at("confirm", { loggedSets: [logged(0, 0, "bench-press")] }), [
      ev("SAVED", T0 + 3000),
    ]);
    expect(REST_COMPOUND_S).toBe(120);
    expect(s).toMatchObject({
      phase: "rest",
      timer: { startedAtMs: T0 + 3000, durationS: REST_COMPOUND_S, pausedMs: 0 },
    });
    expect(run(s, [ev("REST_END", T0 + 123_000)])).toMatchObject({
      phase: "set",
      itemIndex: 0,
      setIndex: 1,
    });
  });

  it("leg-curl (isolation) → rest 60 s (REST_ISOLATION_S)", () => {
    const s = run(at("confirm", { itemIndex: 2 }), [ev("SAVED", T0)]);
    expect(REST_ISOLATION_S).toBe(60);
    expect(s.timer?.durationS).toBe(REST_ISOLATION_S);
  });

  it("an exercise missing from ctx.library → 120", () => {
    const s = run(at("confirm", { itemIndex: 2 }), [ev("SAVED", T0)], { plan: P1, library: [] });
    expect(s.timer?.durationS).toBe(REST_COMPOUND_S);
  });

  it("the last bench-press set → rest → REST_END → the store resolves betweenItems to next item 1", () => {
    const last = at("confirm", { setIndex: 3 });
    const rest = run(last, [ev("SAVED", T0)]);
    expect(rest.phase).toBe("rest");
    // The bare reducer lands on the check point…
    expect(run(rest, [ev("REST_END", T0 + 120_000)]).phase).toBe("betweenItems");
    // …which the store resolves in the same dispatch (AC-9).
    const store = createFocusStore({ sessionId: S1, ctx: CTX, initial: rest, storage: null });
    store.dispatch(ev("REST_END", T0 + 120_000));
    expect(store.getState()).toMatchObject({
      phase: "next",
      itemIndex: 1,
      setIndex: 0,
      timer: { startedAtMs: T0 + 120_000, durationS: 60 },
    });
  });

  it("item 3 (plank, repsMin null) + READY → timed, not set; the pair: item 1 → set", () => {
    expect(run(at("next", { itemIndex: 3 }), [ev("READY", T0)]).phase).toBe("timed");
    expect(run(at("next", { itemIndex: 1 }), [ev("READY", T0)]).phase).toBe("set");
  });

  it("P1 without the plank: the last leg-curl set + SAVED → done with no rest", () => {
    const plan = planWith({ items: [BENCH, ROW, CURL] });
    const s = run(at("confirm", { itemIndex: 2, setIndex: 2 }), [ev("SAVED", T0)], {
      plan,
      library: L1,
    });
    expect(s).toMatchObject({ phase: "done", timer: null });
    // The pair: with the plank following, the same set rests.
    expect(run(at("confirm", { itemIndex: 2, setIndex: 2 }), [ev("SAVED", T0)]).phase).toBe("rest");
  });

  it("P1: plank set 0 + TIMED_RECORDED → rest; the last plank set → done", () => {
    const entry = { ...logged(3, 0, "plank"), reps: null, weightKg: null, durationS: 50 };
    const first = run(at("timed", { itemIndex: 3, setIndex: 0 }), [
      ev("TIMED_RECORDED", T0, { set: entry }),
    ]);
    expect(first).toMatchObject({ phase: "rest", timer: { durationS: REST_ISOLATION_S } });
    expect(run(first, [ev("REST_END", T0 + 60_000)])).toMatchObject({
      phase: "timed",
      setIndex: 1,
    });
    const last = run(at("timed", { itemIndex: 3, setIndex: 1 }), [
      ev("TIMED_RECORDED", T0, { set: { ...entry, clientId: "c-3-1", setIndex: 1 } }),
    ]);
    expect(last.phase).toBe("done");
    expect(last.loggedSets).toHaveLength(1);
  });

  const PAUSABLE: Phase[] = [
    "getReady",
    "warmup",
    "set",
    "confirm",
    "rest",
    "next",
    "timed",
    "timeCheck",
  ];
  it.each(PAUSABLE)("%s + PAUSE → paused (resumePhase %s); RESUME → back", (phase) => {
    const s = at(phase, { timer: { startedAtMs: T0, durationS: 60, pausedMs: 0 } });
    const paused = run(s, [ev("PAUSE", T0 + 1000)]);
    expect(paused).toMatchObject({ phase: "paused", resumePhase: phase, pausedAtMs: T0 + 1000 });
    expect(run(paused, [ev("RESUME", T0 + 2000)])).toMatchObject({
      phase,
      resumePhase: null,
      pausedAtMs: null,
    });
  });

  it.each(["paused", "done"] as Phase[])("PAUSE in %s is a no-op", (phase) => {
    const s = at(phase, {
      pausedAtMs: phase === "paused" ? T0 : null,
      resumePhase: phase === "paused" ? "rest" : null,
    });
    expect(focusReducer(s, ev("PAUSE", T0 + 1000), CTX)).toBe(s);
  });

  it("empty items, no warm-up → done after COUNTDOWN_END", () => {
    const plan = planWith({ warmup: [], items: [] });
    const s = run(initialFocusState(S1, plan, T0), [ev("COUNTDOWN_END", T0 + 5000)], {
      plan,
      library: L1,
    });
    expect(s.phase).toBe("done");
  });

  it("empty items with a warm-up → done after the last WARMUP_NEXT (not before)", () => {
    const plan = planWith({ items: [] });
    const ctx = { plan, library: L1 };
    let s = run(initialFocusState(S1, plan, T0), [ev("COUNTDOWN_END", T0 + 5000)], ctx);
    for (let i = 0; i < 3; i += 1) {
      s = run(s, [ev("WARMUP_NEXT", T0 + 5000 + (i + 1) * 40_000)], ctx);
      expect(s.phase).toBe("warmup");
    }
    s = run(s, [ev("WARMUP_NEXT", T0 + 165_000)], ctx);
    expect(s.phase).toBe("done");
  });

  it("back-off: with bench-press backoff non-null, setIndex 4 follows set 3 and its entry has backoff: true", () => {
    const plan = planWith({
      items: [{ ...BENCH, backoff: { weightKg: 70, reps: 6 } }, ROW, CURL, PLANK],
    });
    const ctx = { plan, library: L1 };
    let s = run(at("set"), [], ctx);
    s = walkItem(s, 0, 4, ctx);
    expect(s.phase).toBe("rest");
    s = run(s, [ev("REST_END", T0)], ctx);
    expect(s).toMatchObject({ phase: "set", itemIndex: 0, setIndex: 4 });
    // The input says `backoff: false`: the reducer stamps `setIndex >= item.sets` itself.
    s = run(s, [ev("SET_RECORDED", T0, { set: logged(0, 4, "bench-press", false) })], ctx);
    expect(s.loggedSets.at(-1)).toMatchObject({ setIndex: 4, backoff: true });
    expect(s.loggedSets).toHaveLength(5);
    expect(s.loggedSets.slice(0, 4).every((l) => !l.backoff)).toBe(true);
    s = run(s, [ev("SAVED", T0), ev("REST_END", T0)], ctx);
    expect(s.phase).toBe("betweenItems");
  });

  it("back-off: with backoff null, set 3 is the item's last", () => {
    let s = walkItem(at("set"), 0, 4);
    expect(s.loggedSets.map((l) => l.backoff)).toEqual([false, false, false, false]);
    s = run(s, [ev("REST_END", T0)]);
    expect(s.phase).toBe("betweenItems");
  });
});

describe("AC-1 REST_ADJUST", () => {
  const rest = at("rest", { timer: { startedAtMs: T0, durationS: 120, pausedMs: 0 } });
  it("−15 ×9 from 120 → remainingS 0, floored, never negative", () => {
    let s = rest;
    for (let i = 0; i < 9; i += 1) s = run(s, [ev("REST_ADJUST", T0, { deltaS: -15 })]);
    expect(remainingS(s.timer!, T0)).toBe(0);
    expect(s.timer!.durationS).toBeGreaterThanOrEqual(0);
    // −15 ×8 leaves 0 too (120 − 120); ×7 leaves 15: the floor is what keeps ×9 at 0.
    let seven = rest;
    for (let i = 0; i < 7; i += 1) seven = run(seven, [ev("REST_ADJUST", T0, { deltaS: -15 })]);
    expect(remainingS(seven.timer!, T0)).toBe(15);
  });

  it("+15 from 120 → 135, no cap", () => {
    expect(remainingS(run(rest, [ev("REST_ADJUST", T0, { deltaS: 15 })]).timer!, T0)).toBe(135);
    let s = rest;
    for (let i = 0; i < 40; i += 1) s = run(s, [ev("REST_ADJUST", T0, { deltaS: 15 })]);
    expect(remainingS(s.timer!, T0)).toBe(720);
  });
});

describe("AC-1 a full P1 walk ends in done", () => {
  it("getReady → warm-up → 4 items → done, with 12 logged sets", () => {
    const store = createFocusStore({
      sessionId: S1,
      ctx: CTX,
      initial: initialFocusState(S1, P1, T0),
      storage: null,
    });
    store.dispatch(ev("COUNTDOWN_END", T0));
    for (let i = 0; i < 4; i += 1) store.dispatch(ev("WARMUP_NEXT", T0));
    for (const [itemIndex, item] of P1.items.entries()) {
      expect(store.getState()).toMatchObject({ phase: "next", itemIndex });
      store.dispatch(ev("READY", T0));
      for (let setIndex = 0; setIndex < item.sets; setIndex += 1) {
        const set = logged(itemIndex, setIndex, item.exerciseId);
        if (item.repsMin === null) store.dispatch(ev("TIMED_RECORDED", T0, { set }));
        else {
          store.dispatch(ev("SET_RECORDED", T0, { set }));
          store.dispatch(ev("SAVED", T0));
        }
        if (store.getState().phase === "rest") store.dispatch(ev("REST_END", T0));
      }
    }
    expect(store.getState().phase).toBe("done");
    expect(store.getState().loggedSets).toHaveLength(12);
    expect(PLANK.sets + CURL.sets + ROW.sets + BENCH.sets).toBe(12);
  });
});
