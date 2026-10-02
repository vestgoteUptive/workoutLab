// @vitest-environment node
// T-0304c (D-0119 §1 §2): the `timed` timer on every way in, the hold's source, the ring-only
// pause (TIMER_PAUSE / TIMER_RESUME), the RESUME rule for a ring paused during a workout pause,
// and the stored states (a missing `timerPausedAtMs` restores; another type doesn't).
import { describe, expect, it } from "vitest";
import type { SessionPlan } from "@workoutlab/shared";
import {
  DEFAULT_HOLD_S,
  POSITION_S,
  focusReducer,
  holdSeconds,
  initialFocusState,
  timedRemainingS,
  type FocusCtx,
  type FocusEvent,
  type FocusState,
  type Phase,
} from "../machine.js";
import { isValidFocusState, readFocusState } from "../persist.js";
import { remainingS } from "../timer.js";
import { BENCH, L1, P1, PLANK, S1, planWith } from "./fixtures.js";

const CTX: FocusCtx = { plan: P1, library: L1 };
const T0 = 1_000_000;

function run(state: FocusState, events: FocusEvent[], ctx: FocusCtx = CTX): FocusState {
  return events.reduce((s, e) => focusReducer(s, e, ctx), state);
}

function at(phase: Phase, patch: Partial<FocusState> = {}): FocusState {
  return { ...initialFocusState(S1, P1, T0), phase, timer: null, ...patch };
}

/** P1's plank at set 0, its timer started at T0. */
function holding(patch: Partial<FocusState> = {}): FocusState {
  return at("timed", {
    itemIndex: 3,
    setIndex: 0,
    timer: { startedAtMs: T0, durationS: 53, pausedMs: 0 },
    ...patch,
  });
}

const plankFirst = (plank: SessionPlan["items"][number]): FocusCtx => ({
  plan: planWith({ warmup: [], items: [plank, BENCH] }),
  library: L1,
});

describe("T-0304c AC-2 entering timed starts one timer: 3 s + the hold", () => {
  const ENTRY = { startedAtMs: T0 + 7000, durationS: 53, pausedMs: 0 };

  it("POSITION_S is 3; the plank's hold is prefill.durationS 50, not item.durationS 45", () => {
    expect(POSITION_S).toBe(3);
    expect(holdSeconds(PLANK)).toBe(50);
    expect(PLANK.durationS).toBe(45);
  });

  it("READY on item 3 → timed with {startedAtMs: atMs, durationS: 53, pausedMs: 0}", () => {
    const s = run(
      at("next", { itemIndex: 3, timer: { startedAtMs: T0, durationS: 60, pausedMs: 0 } }),
      [{ type: "READY", atMs: T0 + 7000 }],
    );
    expect(s).toMatchObject({ phase: "timed", itemIndex: 3, setIndex: 0, timerPausedAtMs: null });
    expect(s.timer).toEqual(ENTRY);
  });

  it("the pair: READY on a reps item → set with no timer", () => {
    const s = run(at("next", { itemIndex: 1 }), [{ type: "READY", atMs: T0 + 7000 }]);
    expect(s).toMatchObject({ phase: "set", timer: null });
  });

  it("SKIP_WARMUP and an empty-warm-up COUNTDOWN_END onto a timed first item", () => {
    const ctx = plankFirst(PLANK);
    for (const type of ["SKIP_WARMUP", "COUNTDOWN_END"] as const) {
      const s = run(
        at("getReady", { timer: { startedAtMs: T0, durationS: 5, pausedMs: 0 } }),
        [{ type, atMs: T0 + 7000 }],
        ctx,
      );
      expect(s.phase, type).toBe("timed");
      expect(s.timer, type).toEqual(ENTRY);
    }
  });

  it("REST_END to the plank's next set starts a fresh timer at the end", () => {
    const rest = at("rest", {
      itemIndex: 3,
      setIndex: 0,
      timer: { startedAtMs: T0, durationS: 60, pausedMs: 0 },
      loggedSets: [
        {
          clientId: "p0",
          itemIndex: 3,
          setIndex: 0,
          exerciseId: "plank",
          reps: null,
          weightKg: null,
          durationS: 50,
          rir: null,
          backoff: false,
        },
      ],
    });
    const s = run(rest, [{ type: "REST_END", atMs: T0 + 7000 }]);
    expect(s).toMatchObject({ phase: "timed", setIndex: 1 });
    expect(s.timer).toEqual(ENTRY);
  });

  it("the swap of a set step into a timed item starts the timer; back to reps drops it", () => {
    const ctx = plankFirst(PLANK);
    const s = run(at("set"), [{ type: "PLAN_REPLACED", itemIndex: 0, atMs: T0 + 7000 }], ctx);
    expect(s.phase).toBe("timed");
    expect(s.timer).toEqual(ENTRY);
    const back = run(s, [{ type: "PLAN_REPLACED", itemIndex: 0, atMs: T0 + 8000 }], CTX);
    expect(back).toMatchObject({ phase: "set", timer: null });
  });

  it("RESYNC onto a timed item starts its timer", () => {
    const ctx = plankFirst(PLANK);
    const s = run(at("confirm", { loggedSets: [] }), [{ type: "RESYNC", atMs: T0 + 7000 }], ctx);
    expect(s.phase).toBe("timed");
    expect(s.timer).toEqual(ENTRY);
  });
});

describe("T-0304c AC-2 the hold's fallbacks", () => {
  it("prefill.durationS null holds item.durationS; both null hold 45", () => {
    const noPrefill = { ...PLANK, prefill: { ...PLANK.prefill, durationS: null } };
    expect(holdSeconds(noPrefill)).toBe(45);
    expect(holdSeconds({ ...noPrefill, durationS: 30 })).toBe(30);
    expect(holdSeconds({ ...noPrefill, durationS: null })).toBe(DEFAULT_HOLD_S);
    expect(DEFAULT_HOLD_S).toBe(45);
    const s = run(
      at("next", { itemIndex: 0 }),
      [{ type: "READY", atMs: T0 }],
      plankFirst({
        ...noPrefill,
        durationS: 30,
      }),
    );
    expect(s.timer!.durationS).toBe(33);
  });
});

describe("T-0304c AC-4 the ring-only pause", () => {
  // Hold 30 s left: 3 s position + 20 s of the 50 s hold have run.
  const AT_30 = T0 + 23_000;

  it("TIMER_PAUSE at 30 s left, 20 s, TIMER_RESUME → 30 s left; only timer.pausedMs grows", () => {
    const s0 = holding();
    expect(remainingS(s0.timer!, AT_30)).toBe(30);
    const paused = run(s0, [{ type: "TIMER_PAUSE", atMs: AT_30 }]);
    expect(paused).toMatchObject({ phase: "timed", timerPausedAtMs: AT_30 });
    expect(timedRemainingS(paused, AT_30 + 20_000)).toBe(30);
    const resumed = run(paused, [{ type: "TIMER_RESUME", atMs: AT_30 + 20_000 }]);
    expect(resumed.timerPausedAtMs).toBeNull();
    expect(resumed.timer).toEqual({ startedAtMs: T0, durationS: 53, pausedMs: 20_000 });
    expect(resumed.workoutPausedMs).toBe(0);
    expect(timedRemainingS(resumed, AT_30 + 20_000)).toBe(30);
    // The hold ends 20 s later than it would have.
    expect(remainingS(s0.timer!, T0 + 53_000)).toBe(0);
    expect(remainingS(resumed.timer!, T0 + 53_000)).toBe(20);
    expect(remainingS(resumed.timer!, T0 + 73_000)).toBe(0);
  });

  it("a workout PAUSE / RESUME during the hold: 30 s left again, workoutPausedMs +60 000", () => {
    const paused = run(holding(), [{ type: "PAUSE", atMs: AT_30 }]);
    const resumed = run(paused, [{ type: "RESUME", atMs: AT_30 + 60_000 }]);
    expect(resumed).toMatchObject({ phase: "timed", workoutPausedMs: 60_000 });
    expect(resumed.timer!.pausedMs).toBe(60_000);
    expect(timedRemainingS(resumed, AT_30 + 60_000)).toBe(30);
  });

  it("both pauses: the ring stays paused after RESUME, and the time is counted once", () => {
    const s = run(holding(), [
      { type: "TIMER_PAUSE", atMs: AT_30 },
      { type: "PAUSE", atMs: AT_30 + 5000 },
      { type: "RESUME", atMs: AT_30 + 65_000 },
    ]);
    expect(s).toMatchObject({ phase: "timed", timerPausedAtMs: AT_30, workoutPausedMs: 60_000 });
    // RESUME didn't add the workout pause to the ring: the ring's own pause covers it.
    expect(s.timer!.pausedMs).toBe(0);
    expect(timedRemainingS(s, AT_30 + 65_000)).toBe(30);
    const resumed = run(s, [{ type: "TIMER_RESUME", atMs: AT_30 + 70_000 }]);
    expect(resumed.timer!.pausedMs).toBe(70_000);
    expect(timedRemainingS(resumed, AT_30 + 70_000)).toBe(30);
  });

  it("the pair: with no ring pause, RESUME adds the workout pause to the ring", () => {
    const s = run(holding(), [
      { type: "PAUSE", atMs: AT_30 },
      { type: "RESUME", atMs: AT_30 + 60_000 },
    ]);
    expect(s.timer!.pausedMs).toBe(60_000);
    expect(s.timerPausedAtMs).toBeNull();
  });

  it("TIMER_PAUSE outside timed returns the same state object, and so does TIMER_RESUME", () => {
    for (const phase of [
      "getReady",
      "warmup",
      "set",
      "confirm",
      "rest",
      "next",
      "timeCheck",
      "paused",
      "done",
    ] as const) {
      const s = at(phase, { timer: { startedAtMs: T0, durationS: 60, pausedMs: 0 } });
      expect(focusReducer(s, { type: "TIMER_PAUSE", atMs: T0 + 1000 }, CTX), phase).toBe(s);
      expect(focusReducer(s, { type: "TIMER_RESUME", atMs: T0 + 1000 }, CTX), phase).toBe(s);
    }
  });

  it("the pair: in timed, TIMER_PAUSE changes the state; a second one, or TIMER_RESUME unpaused, doesn't", () => {
    const s = holding();
    const paused = focusReducer(s, { type: "TIMER_PAUSE", atMs: AT_30 }, CTX);
    expect(paused).not.toBe(s);
    expect(focusReducer(paused, { type: "TIMER_PAUSE", atMs: AT_30 + 1 }, CTX)).toBe(paused);
    expect(focusReducer(s, { type: "TIMER_RESUME", atMs: AT_30 }, CTX)).toBe(s);
  });

  it("a hold already at 0 can't be ring-paused (its auto-log is due)", () => {
    const s = holding();
    expect(focusReducer(s, { type: "TIMER_PAUSE", atMs: T0 + 53_000 }, CTX)).toBe(s);
  });

  it("leaving timed drops the ring pause (a List-view log of this set while ring-paused)", () => {
    const paused = run(holding(), [{ type: "TIMER_PAUSE", atMs: AT_30 }]);
    const set = {
      clientId: "p0",
      itemIndex: 3,
      setIndex: 0,
      exerciseId: "plank",
      reps: null,
      weightKg: null,
      durationS: 50,
      rir: null,
      backoff: false,
    };
    const s = run(paused, [{ type: "TIMED_RECORDED", set, atMs: AT_30 + 1000 }]);
    expect(s).toMatchObject({ phase: "rest", timerPausedAtMs: null });
  });
});

describe("T-0304c AC-3 HOLD_ALREADY_LOGGED", () => {
  const entry = (exerciseId: string) => ({
    clientId: "p0",
    itemIndex: 3,
    setIndex: 0,
    exerciseId,
    reps: null,
    weightKg: null,
    durationS: 50,
    rir: null,
    backoff: false,
  });

  it("timed with this exercise logged at the position → the rest TIMED_RECORDED gives, no second entry", () => {
    const s = holding({ loggedSets: [entry("plank")] });
    const out = run(s, [{ type: "HOLD_ALREADY_LOGGED", atMs: T0 + 60_000 }]);
    expect(out).toMatchObject({ phase: "rest", timer: { startedAtMs: T0 + 60_000 } });
    expect(out.loggedSets).toEqual([entry("plank")]);
  });

  it("the pairs: nothing logged, another exercise logged, or outside timed → the same state", () => {
    const none = holding();
    expect(focusReducer(none, { type: "HOLD_ALREADY_LOGGED", atMs: T0 }, CTX)).toBe(none);
    const other = holding({ loggedSets: [entry("side-plank")] });
    expect(focusReducer(other, { type: "HOLD_ALREADY_LOGGED", atMs: T0 }, CTX)).toBe(other);
    const set = at("set", { loggedSets: [entry("plank")] });
    expect(focusReducer(set, { type: "HOLD_ALREADY_LOGGED", atMs: T0 }, CTX)).toBe(set);
  });
});

describe("T-0304c AC-4 stored states (D-0119 §2)", () => {
  const raw = (patch: Record<string, unknown>) => ({ ...holding(), ...patch });
  const storage = (value: unknown) => {
    const map = new Map<string, string>([[`wl-focus:${S1}`, JSON.stringify(value)]]);
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
      map,
    };
  };

  it("a stored timed state with no timerPausedAtMs key restores, reading as null", () => {
    const old: Record<string, unknown> = raw({});
    delete old.timerPausedAtMs;
    expect("timerPausedAtMs" in old).toBe(false);
    expect(isValidFocusState(old, S1, CTX)).toBe(true);
    const restored = readFocusState(S1, CTX, storage(old));
    expect(restored).toMatchObject({ phase: "timed", itemIndex: 3, timerPausedAtMs: null });
  });

  it("the pair: a non-number timerPausedAtMs is rejected (and removed)", () => {
    for (const bad of ["123", true, {}, Number.NaN]) {
      expect(isValidFocusState(raw({ timerPausedAtMs: bad }), S1, CTX), String(bad)).toBe(false);
    }
    const store = storage(raw({ timerPausedAtMs: "123" }));
    expect(readFocusState(S1, CTX, store)).toBeNull();
    expect(store.map.size).toBe(0);
  });

  it("a number or null restores as is", () => {
    expect(
      readFocusState(S1, CTX, storage(raw({ timerPausedAtMs: T0 + 5 })))?.timerPausedAtMs,
    ).toBe(T0 + 5);
    expect(isValidFocusState(raw({ timerPausedAtMs: null }), S1, CTX)).toBe(true);
  });

  it("a stored timed with timer: null stays invalid; so does a paused one resuming into it", () => {
    expect(isValidFocusState(raw({ timer: null }), S1, CTX)).toBe(false);
    expect(
      isValidFocusState(
        raw({ phase: "paused", resumePhase: "timed", pausedAtMs: T0, timer: null }),
        S1,
        CTX,
      ),
    ).toBe(false);
    expect(
      isValidFocusState(raw({ phase: "paused", resumePhase: "timed", pausedAtMs: T0 }), S1, CTX),
    ).toBe(true);
  });
});
