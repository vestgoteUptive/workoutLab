// T-0304e: the reducer events behind `useFocusSession()` (D-0071 §5). The reducer stays pure: no
// clock, no mutation, and an event that doesn't apply returns the same state object.
import { describe, expect, it } from "vitest";
import {
  focusReducer,
  initialFocusState,
  type FocusCtx,
  type FocusEvent,
  type FocusState,
  type LoggedSet,
} from "../machine.js";
import { L1, P1, PLANK, S1 } from "./fixtures.js";

const T0 = 1_000_000;
const CTX: FocusCtx = { plan: P1, library: L1 };

function at(phase: FocusState["phase"], extra: Partial<FocusState> = {}): FocusState {
  return { ...initialFocusState(S1, P1, T0), phase, timer: null, ...extra };
}

function set(itemIndex: number, setIndex: number, extra: Partial<LoggedSet> = {}): LoggedSet {
  return {
    clientId: `c-${itemIndex}-${setIndex}`,
    itemIndex,
    setIndex,
    exerciseId: P1.items[itemIndex]!.exerciseId,
    reps: 6,
    weightKg: 80,
    durationS: null,
    rir: null,
    backoff: false,
    ...extra,
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

function reduce(state: FocusState, event: FocusEvent, ctx: FocusCtx = CTX): FocusState {
  return focusReducer(deepFreeze(state), event, deepFreeze(ctx));
}

describe("SET_LOGGED / SET_EDITED / SET_DELETED", () => {
  it("SET_LOGGED appends in any phase and never moves the phase or position", () => {
    for (const phase of ["set", "rest", "next", "paused", "confirm"] as const) {
      const s = reduce(at(phase), { type: "SET_LOGGED", set: set(2, 0), atMs: T0 });
      expect(s.phase).toBe(phase);
      expect([s.itemIndex, s.setIndex]).toEqual([0, 0]);
      expect(s.loggedSets).toEqual([set(2, 0)]);
    }
  });

  it("SET_EDITED replaces the entry; an unknown clientId returns the same state", () => {
    const s = at("rest", { loggedSets: [set(0, 0), set(0, 1)] });
    const edited = reduce(s, { type: "SET_EDITED", set: set(0, 0, { reps: 5 }), atMs: T0 });
    expect(edited.loggedSets.map((x) => x.reps)).toEqual([5, 6]);
    expect(reduce(s, { type: "SET_EDITED", set: set(3, 0), atMs: T0 })).toBe(s);
  });

  it("SET_DELETED removes the entry; an unknown clientId returns the same state", () => {
    const s = at("rest", { loggedSets: [set(0, 0), set(0, 1)] });
    expect(reduce(s, { type: "SET_DELETED", clientId: "c-0-0", atMs: T0 }).loggedSets).toEqual([
      set(0, 1),
    ]);
    expect(reduce(s, { type: "SET_DELETED", clientId: "nope", atMs: T0 })).toBe(s);
  });
});

describe("REST_END follows the live sets", () => {
  it("skips a set already logged out of order", () => {
    const s = at("rest", {
      setIndex: 0,
      timer: { startedAtMs: T0, durationS: 120, pausedMs: 0 },
      loggedSets: [set(0, 0), set(0, 1)],
    });
    expect(reduce(s, { type: "REST_END", atMs: T0 + 120_000 })).toMatchObject({
      phase: "set",
      setIndex: 2,
    });
  });

  it("every later set logged → betweenItems", () => {
    const s = at("rest", {
      setIndex: 1,
      timer: { startedAtMs: T0, durationS: 120, pausedMs: 0 },
      loggedSets: [set(0, 0), set(0, 1), set(0, 2), set(0, 3)],
    });
    expect(reduce(s, { type: "REST_END", atMs: T0 }).phase).toBe("betweenItems");
  });
});

describe("REST_START from an unlogged set, then REST_END (rework: the current set is never skipped)", () => {
  it("(a) set: bench setIndex 0 unlogged, a row set logged out of order → REST_END lands on bench setIndex 0", () => {
    const s0 = at("set", { setIndex: 0, loggedSets: [set(1, 0)] });
    const rest = reduce(s0, { type: "REST_START", exerciseId: "barbell-row", atMs: T0 });
    expect(rest).toMatchObject({ phase: "rest", itemIndex: 0, setIndex: 0 });
    expect(reduce(rest, { type: "REST_END", atMs: T0 + 120_000 })).toMatchObject({
      phase: "set",
      itemIndex: 0,
      setIndex: 0,
    });
  });

  it("(b) timed: plank setIndex 0 unlogged → REST_END lands on plank setIndex 0", () => {
    const s0 = at("timed", { itemIndex: 3, setIndex: 0 });
    const rest = reduce(s0, { type: "REST_START", exerciseId: "plank", atMs: T0 });
    expect(reduce(rest, { type: "REST_END", atMs: T0 + 60_000 })).toMatchObject({
      phase: "timed",
      itemIndex: 3,
      setIndex: 0,
    });
  });

  it("(d) the normal flow still advances: set 0 recorded, saved, rest → REST_END → setIndex 1", () => {
    let s = reduce(at("set"), { type: "SET_RECORDED", set: set(0, 0), atMs: T0 });
    s = reduce(s, { type: "SAVED", atMs: T0 });
    expect(s).toMatchObject({ phase: "rest", setIndex: 0 });
    expect(reduce(s, { type: "REST_END", atMs: T0 + 120_000 })).toMatchObject({
      phase: "set",
      setIndex: 1,
    });
  });

  it("(d) a set logged after the current one is still skipped: sets 0 and 1 logged, rest at 0 → setIndex 2", () => {
    const s = at("rest", {
      setIndex: 0,
      timer: { startedAtMs: T0, durationS: 120, pausedMs: 0 },
      loggedSets: [set(0, 0), set(0, 1)],
    });
    expect(reduce(s, { type: "REST_END", atMs: T0 }).setIndex).toBe(2);
  });
});

describe("REST_START", () => {
  it.each(["set", "confirm", "rest", "timed"] as const)(
    "from %s: a fresh rest by type",
    (phase) => {
      const s = reduce(at(phase), { type: "REST_START", exerciseId: "leg-curl", atMs: T0 });
      expect(s).toMatchObject({
        phase: "rest",
        timer: { startedAtMs: T0, durationS: 60, pausedMs: 0 },
      });
    },
  );

  it.each(["getReady", "warmup", "next", "timeCheck", "paused", "done"] as const)(
    "from %s: the same state",
    (phase) => {
      const s = at(phase);
      expect(reduce(s, { type: "REST_START", exerciseId: "bench-press", atMs: T0 })).toBe(s);
    },
  );

  it("an exercise missing from the library gets the compound rest", () => {
    const s = reduce(at("set"), { type: "REST_START", exerciseId: "mystery", atMs: T0 });
    expect(s.timer!.durationS).toBe(120);
  });
});

describe("PLAN_REPLACED", () => {
  const timedFirst: FocusCtx = {
    plan: { ...P1, items: [PLANK, ...P1.items.slice(1)] },
    library: L1,
  };

  it("the current item becomes timed: set → timed, paused keeps resumePhase in step", () => {
    expect(
      reduce(
        at("set", { setIndex: 1 }),
        { type: "PLAN_REPLACED", itemIndex: 0, atMs: T0 },
        timedFirst,
      ),
    ).toMatchObject({
      phase: "timed",
      setIndex: 1,
    });
    const paused = at("paused", { resumePhase: "set", pausedAtMs: T0 });
    expect(
      reduce(paused, { type: "PLAN_REPLACED", itemIndex: 0, atMs: T0 }, timedFirst),
    ).toMatchObject({
      phase: "paused",
      resumePhase: "timed",
    });
  });

  it("setIndex stays inside the new item's set count", () => {
    // Bench has 4 sets; the plank 2: set index 3 → 1.
    const s = reduce(
      at("rest", { setIndex: 3, timer: { startedAtMs: T0, durationS: 120, pausedMs: 0 } }),
      { type: "PLAN_REPLACED", itemIndex: 0, atMs: T0 },
      timedFirst,
    );
    expect(s.setIndex).toBe(1);
  });

  it("another item, or nothing to change: the same state", () => {
    const s = at("set");
    expect(reduce(s, { type: "PLAN_REPLACED", itemIndex: 1, atMs: T0 }, timedFirst)).toBe(s);
    expect(reduce(s, { type: "PLAN_REPLACED", itemIndex: 0, atMs: T0 })).toBe(s);
  });
});

describe("RESYNC", () => {
  it("a running rest stays (same object)", () => {
    const s = at("rest", {
      timer: { startedAtMs: T0, durationS: 120, pausedMs: 0 },
      loggedSets: [set(0, 0)],
    });
    expect(reduce(s, { type: "RESYNC", atMs: T0 })).toBe(s);
  });

  it("goes to the first item with an unlogged set, at that set", () => {
    const s = at("confirm", {
      loggedSets: [set(0, 0), set(0, 1), set(0, 2), set(0, 3), set(1, 1)],
    });
    expect(reduce(s, { type: "RESYNC", atMs: T0 })).toMatchObject({
      phase: "set",
      itemIndex: 1,
      setIndex: 0,
    });
  });

  it("a timed item enters timed", () => {
    const logged = [0, 1, 2].flatMap((i) =>
      [0, 1, 2, 3].filter((k) => k < P1.items[i]!.sets).map((k) => set(i, k)),
    );
    expect(reduce(at("set", { loggedSets: logged }), { type: "RESYNC", atMs: T0 })).toMatchObject({
      phase: "timed",
      itemIndex: 3,
      setIndex: 0,
    });
  });

  it("everything logged → done", () => {
    const logged = P1.items.flatMap((item, i) =>
      Array.from({ length: item.sets }, (_, k) => set(i, k)),
    );
    expect(reduce(at("set", { loggedSets: logged }), { type: "RESYNC", atMs: T0 }).phase).toBe(
      "done",
    );
  });

  it("UF-09.6 for the right item stays; the warm-up with nothing logged stays; paused stays", () => {
    const next = at("next", {
      itemIndex: 1,
      timer: { startedAtMs: T0, durationS: 60, pausedMs: 0 },
      loggedSets: [0, 1, 2, 3].map((k) => set(0, k)),
    });
    expect(reduce(next, { type: "RESYNC", atMs: T0 })).toBe(next);
    const warmup = at("warmup", {
      warmupStartedAtMs: T0,
      timer: { startedAtMs: T0, durationS: 40, pausedMs: 0 },
    });
    expect(reduce(warmup, { type: "RESYNC", atMs: T0 + 10_000 })).toBe(warmup);
    const paused = at("paused", { resumePhase: "set", pausedAtMs: T0 });
    expect(reduce(paused, { type: "RESYNC", atMs: T0 })).toBe(paused);
  });

  it("leaving the warm-up because sets were logged records the warm-up time", () => {
    const warmup = at("warmup", {
      warmupStartedAtMs: T0,
      timer: { startedAtMs: T0, durationS: 40, pausedMs: 0 },
      loggedSets: [set(0, 0)],
    });
    expect(reduce(warmup, { type: "RESYNC", atMs: T0 + 10_000 })).toMatchObject({
      phase: "set",
      setIndex: 1,
      warmupSpentMs: 10_000,
      warmupStartedAtMs: null,
    });
  });
});
