// T-0304e: the reducer events behind `useFocusSession()` (D-0071 §5). The reducer stays pure: no
// clock, no mutation, and an event that doesn't apply returns the same state object.
import { describe, expect, it } from "vitest";
import type { LibraryExercise } from "@workoutlab/shared";
import {
  AUTOSAVE_S,
  focusReducer,
  initialFocusState,
  type FocusCtx,
  type FocusEvent,
  type FocusState,
  type LoggedSet,
} from "../machine.js";
import { isValidFocusState, readFocusState, writeFocusState } from "../persist.js";
import { remainingS } from "../timer.js";
import { L1, P1, PLANK, ROW, S1 } from "./fixtures.js";
import * as F from "./t0414-fixtures.js";

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

// T-0410 (UF-09.3, UF-09.4, UF-09.9): RESUME moves on only for a logged set of the CURRENT item's
// exercise. After a swap while paused, a set of the old exercise at the same position is not the
// set on screen.
describe("T-0410 RESUME after a swap while paused", () => {
  const lib = (id: string, extra: Partial<LibraryExercise>): LibraryExercise => ({
    id,
    name: id,
    kind: "exercise",
    type: "compound",
    level: "beginner",
    equipment: [],
    areas: {},
    timed: false,
    defaultDurationS: null,
    incrementKg: 2.5,
    externalLoad: true,
    ...extra,
  });
  const DB_ROW_EX = lib("db-row", {
    equipment: ["dumbbell", "bench"],
    areas: { back: 1, arms: 0.5 },
  });
  const SIDE_PLANK_EX = lib("side-plank", {
    type: "isolation",
    areas: { core: 1 },
    timed: true,
    defaultDurationS: 45,
    incrementKg: 0,
    externalLoad: false,
  });
  const LIB: LibraryExercise[] = [...L1, DB_ROW_EX, SIDE_PLANK_EX];
  const DB_ROW = { ...ROW, exerciseId: "db-row", sets: 2 };
  const SIDE_PLANK = { ...PLANK, exerciseId: "side-plank", sets: 1 };
  const swapped = (index: number, item: (typeof P1.items)[number]): FocusCtx => ({
    plan: { ...P1, items: P1.items.map((it, k) => (k === index ? item : it)) },
    library: LIB,
  });

  // D-0140 §7 (T-0414 AC7): PLAN_REPLACED no longer leaves the current set on a logged position,
  // so these tests build that paused state directly (a state a pre-T-0414 build may have stored).
  it("T-0410 AC1 reps: old barbell-row set at the clamped position → RESUME stays on set 1 of db-row", () => {
    const start = at("paused", {
      itemIndex: 1,
      setIndex: 1,
      resumePhase: "set",
      pausedAtMs: T0 + 1000,
      loggedSets: [set(1, 0), set(1, 1)],
    });
    const after = swapped(1, DB_ROW);
    const replaced = start;
    expect(replaced).toMatchObject({ phase: "paused", resumePhase: "set", setIndex: 1 });
    const resumed = reduce(replaced, { type: "RESUME", atMs: T0 + 30_000 }, after);
    expect(resumed).toMatchObject({ phase: "set", itemIndex: 1, setIndex: 1 });
    expect(resumed.timer).toBe(start.timer);
    expect(resumed.timer).toBeNull();
  });

  it("T-0410 AC1 pair: a db-row set logged at (1, 1) while paused → RESUME goes to confirm with the auto-save", () => {
    const start = at("paused", {
      itemIndex: 1,
      setIndex: 1,
      resumePhase: "set",
      pausedAtMs: T0 + 1000,
      loggedSets: [set(1, 0), set(1, 1)],
    });
    const after = swapped(1, DB_ROW);
    const replaced = start;
    const dbRowSet = set(1, 1, { clientId: "c-db-row", exerciseId: "db-row", weightKg: 30 });
    const logged = reduce(replaced, { type: "SET_LOGGED", set: dbRowSet, atMs: T0 + 3000 }, after);
    const resumed = reduce(logged, { type: "RESUME", atMs: T0 + 30_000 }, after);
    expect(resumed).toMatchObject({ phase: "confirm", itemIndex: 1, setIndex: 1 });
    expect(resumed.timer).toEqual({ startedAtMs: T0 + 30_000, durationS: AUTOSAVE_S, pausedMs: 0 });
  });

  const plankSet = (extra: Partial<LoggedSet> = {}): LoggedSet =>
    set(3, 0, { reps: null, weightKg: null, durationS: 50, ...extra });

  it("T-0410 AC2 timed: old plank set at the clamped position → RESUME stays in timed at set 0", () => {
    const start = at("paused", {
      itemIndex: 3,
      setIndex: 0,
      resumePhase: "timed",
      pausedAtMs: T0 + 1000,
      loggedSets: [plankSet()],
    });
    const after = swapped(3, SIDE_PLANK);
    const replaced = start;
    expect(replaced).toMatchObject({ phase: "paused", resumePhase: "timed", setIndex: 0 });
    const resumed = reduce(replaced, { type: "RESUME", atMs: T0 + 30_000 }, after);
    expect(resumed).toMatchObject({ phase: "timed", itemIndex: 3, setIndex: 0, timer: null });
  });

  it("T-0410 AC2 pair: a side-plank set logged at (3, 0) while paused → RESUME = TIMED_RECORDED at that atMs", () => {
    const start = at("paused", {
      itemIndex: 3,
      setIndex: 0,
      resumePhase: "timed",
      pausedAtMs: T0 + 1000,
      loggedSets: [plankSet()],
    });
    const after = swapped(3, SIDE_PLANK);
    const replaced = start;
    const side = plankSet({ clientId: "c-side", exerciseId: "side-plank" });
    const logged = reduce(replaced, { type: "SET_LOGGED", set: side, atMs: T0 + 3000 }, after);
    const atMs = T0 + 30_000;
    const resumed = reduce(logged, { type: "RESUME", atMs }, after);
    const plainResume = reduce(replaced, { type: "RESUME", atMs }, after);
    expect(plainResume.phase).toBe("timed");
    const recorded = reduce(plainResume, { type: "TIMED_RECORDED", set: side, atMs }, after);
    expect(resumed).toEqual(recorded);
    expect(resumed.phase).not.toBe("timed");
  });
});

// T-0414 (UF-09.3, UF-09.5, UF-09.7, UF-09.9, D-0140): after a swap to fewer sets, the current
// set moves to the first free position, or the swap ends the item. Never two logged sets at one
// (itemIndex, setIndex).
describe("T-0414 PLAN_REPLACED never leaves the set on a logged position", () => {
  const pause = (s: FocusState, ctx: FocusCtx = F.BEFORE) =>
    reduce(s, { type: "PAUSE", atMs: F.PAUSE_AT }, ctx);
  const swap = (s: FocusState, itemIndex: number, ctx: FocusCtx) =>
    reduce(s, { type: "PLAN_REPLACED", itemIndex, atMs: F.SWAP_AT }, ctx);

  const AC1_CTX = F.swapped(0, F.DB_BENCH);
  const AC1_START = F.at("set", {
    itemIndex: 0,
    setIndex: 3,
    loggedSets: [F.logged(0, 0), F.logged(0, 2)],
  });
  const AC2_CTX = F.swapped(1, F.DB_ROW);
  const AC3_CTX = F.swapped(3, F.SIDE_PLANK);
  const AC3_START = F.at("timed", {
    itemIndex: 3,
    setIndex: 1,
    timer: { startedAtMs: F.T0, durationS: 53, pausedMs: 0 },
    loggedSets: [F.logged(3, 0)],
  });

  it("T-0414 AC1 a gap below the clamp: setIndex goes to the first free position, and SET_RECORDED stamps (0, 1)", () => {
    const s = swap(AC1_START, 0, AC1_CTX);
    expect(s).toMatchObject({ phase: "set", itemIndex: 0, setIndex: 1 });
    const recorded = reduce(
      s,
      { type: "SET_RECORDED", set: F.logged(0, 9, { clientId: "c-db" }), atMs: F.SWAP_AT + 1000 },
      AC1_CTX,
    );
    const positions = recorded.loggedSets.map((x) => `${x.itemIndex}:${x.setIndex}`);
    expect(new Set(positions).size).toBe(positions.length);
    expect(recorded.loggedSets.at(-1)).toMatchObject({
      itemIndex: 0,
      setIndex: 1,
      exerciseId: "db-bench-press",
    });
  });

  it("T-0414 AC1 paused: paused, resumePhase set, setIndex 1; RESUME gives set at 1", () => {
    const s = swap(pause(AC1_START), 0, AC1_CTX);
    expect(s).toMatchObject({ phase: "paused", resumePhase: "set", setIndex: 1 });
    expect(reduce(s, { type: "RESUME", atMs: F.RESUME_AT }, AC1_CTX)).toMatchObject({
      phase: "set",
      itemIndex: 0,
      setIndex: 1,
    });
  });

  it("T-0414 AC1 pair: only (0, 0) logged, the clamp lands on free 2 and stays", () => {
    const start = F.at("set", { itemIndex: 0, setIndex: 3, loggedSets: [F.logged(0, 0)] });
    expect(swap(start, 0, AC1_CTX)).toMatchObject({ phase: "set", setIndex: 2 });
  });

  it("T-0414 AC2 no free position, not the last item, paused: resumePhase rest at the last set with the new exercise's rest", () => {
    const s = swap(pause(F.AC2_START), 1, AC2_CTX);
    expect(s).toMatchObject({
      phase: "paused",
      resumePhase: "rest",
      pausedAtMs: F.PAUSE_AT,
      itemIndex: 1,
      setIndex: 1,
    });
    expect(s.timer).toEqual({ startedAtMs: F.PAUSE_AT, durationS: 120, pausedMs: 0 });
    expect(s.loggedSets).toEqual(F.AC2_START.loggedSets);

    const resumed = reduce(s, { type: "RESUME", atMs: F.RESUME_AT }, AC2_CTX);
    expect(resumed.phase).toBe("rest");
    expect(remainingS(resumed.timer!, F.RESUME_AT)).toBe(120);
    expect(reduce(resumed, { type: "REST_END", atMs: F.RESUME_AT + 120_000 }, AC2_CTX).phase).toBe(
      "betweenItems",
    );
  });

  it("T-0414 AC2 not paused: rest at setIndex 1, the timer from the swap", () => {
    const s = swap(F.AC2_START, 1, AC2_CTX);
    expect(s).toMatchObject({ phase: "rest", itemIndex: 1, setIndex: 1, resumePhase: null });
    expect(s.timer).toEqual({ startedAtMs: F.SWAP_AT, durationS: 120, pausedMs: 0 });
    expect(s.loggedSets).toEqual(F.AC2_START.loggedSets);
  });

  it("T-0414 AC3 no free position, the last item, paused: done, and the pause ends at the swap", () => {
    const s = swap(pause(AC3_START), 3, AC3_CTX);
    expect(s).toMatchObject({
      phase: "done",
      timer: null,
      resumePhase: null,
      pausedAtMs: null,
      workoutPausedMs: 1000,
      timerPausedAtMs: null,
    });
    expect(s.loggedSets).toEqual(AC3_START.loggedSets);
  });

  it("T-0414 AC3 not paused: done, timer null, workoutPausedMs 0", () => {
    const s = swap(AC3_START, 3, AC3_CTX);
    expect(s).toMatchObject({ phase: "done", timer: null, workoutPausedMs: 0 });
  });

  it("T-0414 AC3 a ring paused by Pause timer: the swap's done drops timerPausedAtMs", () => {
    const held = reduce(AC3_START, { type: "TIMER_PAUSE", atMs: F.T0 + 500 }, F.BEFORE);
    expect(held.timerPausedAtMs).toBe(F.T0 + 500);
    const s = swap(pause(held), 3, AC3_CTX);
    expect(s).toMatchObject({ phase: "done", timer: null, timerPausedAtMs: null });
  });

  it("T-0414 AC4 the rest follows the new exercise's type: an isolation db-row rests 60 s", () => {
    const isoLib = F.LIB.map((e) => (e.id === "db-row" ? { ...e, type: "isolation" as const } : e));
    const ctx = F.swapped(1, F.DB_ROW, isoLib);
    expect(swap(pause(F.AC2_START), 1, ctx).timer).toEqual({
      startedAtMs: F.PAUSE_AT,
      durationS: 60,
      pausedMs: 0,
    });
    expect(swap(F.AC2_START, 1, ctx).timer).toEqual({
      startedAtMs: F.SWAP_AT,
      durationS: 60,
      pausedMs: 0,
    });
  });

  it("T-0414 AC5 rest, next, confirm and paused-on-rest keep the clamp-only result", () => {
    const timer = { startedAtMs: F.T0, durationS: 120, pausedMs: 0 };
    const starts: FocusState[] = [
      { ...F.AC2_START, phase: "rest", timer },
      { ...F.AC2_START, phase: "next", timer: { ...timer, durationS: 60 } },
      { ...F.AC2_START, phase: "confirm", timer: { ...timer, durationS: AUTOSAVE_S } },
      { ...F.AC2_START, phase: "paused", resumePhase: "rest", pausedAtMs: F.PAUSE_AT, timer },
    ];
    for (const start of starts) {
      expect(swap(start, 1, AC2_CTX)).toEqual({ ...start, setIndex: 1 });
    }
  });

  it("T-0414 AC5 a PLAN_REPLACED for another item returns the same state", () => {
    const ctx = F.swapped(0, F.DB_BENCH);
    for (const s of [F.AC2_START, pause(F.AC2_START)]) expect(swap(s, 0, ctx)).toBe(s);
  });

  it("T-0414 AC6 every new state is a valid stored state and survives a round trip", () => {
    const cases: [FocusState, FocusCtx][] = [
      [swap(pause(AC1_START), 0, AC1_CTX), AC1_CTX],
      [swap(pause(F.AC2_START), 1, AC2_CTX), AC2_CTX],
      [swap(F.AC2_START, 1, AC2_CTX), AC2_CTX],
      [swap(pause(AC3_START), 3, AC3_CTX), AC3_CTX],
      [swap(AC3_START, 3, AC3_CTX), AC3_CTX],
    ];
    for (const [state, ctx] of cases) {
      expect(isValidFocusState(state, S1, ctx)).toBe(true);
      const storage = F.memoryStorage();
      writeFocusState(storage, S1, state);
      expect(readFocusState(S1, ctx, storage)).toEqual(state);
    }
  });
});
