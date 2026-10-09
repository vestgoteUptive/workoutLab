// T-0304c AC-2–AC-5 (UF-09.7 Timed set, parent AC-C2–C4, D-0119 §1–§4, D-0062 §5): the 3 s
// position and the hold on one wall-clock timer, the hold auto-logged once through the hook, the
// ring-only pause, and copy that never claims "same as last time".
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { REST_ISOLATION_S } from "@workoutlab/engine";
import type { SessionPlan } from "@workoutlab/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { en } from "../../../lib/i18n/en.js";
import * as offline from "../../../lib/offline/index.js";
import type { FocusState, LoggedSet } from "../machine.js";
import { BENCH, L1, P1, PLANK, S1, STARTED_AT_MS, USER_A, planWith } from "./fixtures.js";
import {
  advance,
  flushReal,
  freshDb,
  renderLoaded,
  screenId,
  seedSession,
  signIn,
  timerText,
  useFakeClock,
} from "./helpers.js";
import { probe, session } from "./probe.js";
import { deferred } from "./session-helpers.js";
import { findScreen, seedFocus, storedState } from "./set-loop-helpers.js";
import { hookRecordCalls } from "./session-spy.js";
import { lastStore, stores } from "./store-spy.js";

vi.mock("../../../lib/offline/index.js", (orig) =>
  import("./warmup-timed-mock.js").then((m) => m.warmupTimedMock(orig)),
);
vi.mock("../session.js", (orig) => import("./session-spy.js").then((m) => m.sessionSpy(orig)));
vi.mock("../store.js", (orig) => import("./store-spy.js").then((m) => m.storeSpy(orig)));
vi.mock("../views.js", (orig) => import("./probe.js").then((m) => m.probedViews(orig)));

const NOW = STARTED_AT_MS + 20 * 60_000;
const recordSpy = vi.mocked(offline.recordSet);
const realRecord = recordSpy.getMockImplementation()!;

const HOLD_TIMER = { startedAtMs: NOW, durationS: 53, pausedMs: 0 };

const heading = () => screen.getByRole("heading", { level: 1 }).textContent;
const phaseText = () => document.querySelector('[data-field="phase"]')?.textContent ?? null;
const targetText = () => document.querySelector('[data-field="target"]')?.textContent ?? null;
const kindEl = () => document.querySelector('[data-field="kind"]');
const announced = () => document.querySelector('[data-field="announcer"]')!.textContent;
const statusText = () => document.querySelector(".wl-uf09__status")?.textContent ?? "";
const buttonNames = () =>
  screen.getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? b.textContent);

function plankSet(setIndex: number, extra: Partial<LoggedSet> = {}): LoggedSet {
  return {
    clientId: `p${setIndex}`,
    itemIndex: 3,
    setIndex,
    exerciseId: "plank",
    reps: null,
    weightKg: null,
    durationS: 50,
    rir: null,
    backoff: false,
    ...extra,
  };
}

/** The plank at `setIndex`, its position + hold timer started at `startedAtMs`. */
function seedHold(patch: Partial<FocusState> = {}, plan: SessionPlan = P1): void {
  seedFocus(NOW, { phase: "timed", itemIndex: 3, setIndex: 0, timer: HOLD_TIMER, ...patch }, plan);
}

/** The exact `lib/offline` input of the plank set `setIndex` (D-0119 §3, with `itemIndex`). */
const holdInput = (setIndex: number, durationS = 50) => ({
  sessionId: S1,
  itemIndex: 3,
  exerciseId: "plank",
  setIndex,
  kind: "timed",
  durationS,
  reps: null,
  weightKg: null,
  rir: null,
  isWarmup: false,
  backoff: false,
});

beforeEach(async () => {
  window.localStorage.clear();
  recordSpy.mockReset();
  recordSpy.mockImplementation(realRecord);
  hookRecordCalls.length = 0;
  stores.length = 0;
  probe.current = null;
  freshDb();
  useFakeClock(NOW);
  signIn(USER_A);
  await seedSession({ plan: P1 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("T-0304c AC-2 position, then hold", () => {
  it("READY into the plank: the stored timer is {startedAtMs: atMs, durationS: 53, pausedMs: 0}", async () => {
    seedFocus(NOW, {
      phase: "next",
      itemIndex: 3,
      timer: { startedAtMs: NOW, durationS: 60, pausedMs: 0 },
    });
    await renderLoaded();
    await advance(4000);
    const atMs = Date.now();
    fireEvent.click(screen.getByRole("button", { name: "I'm ready" }));
    await flushReal();
    expect(screenId()).toBe("UF-09.7");
    expect(storedState().timer).toEqual({ startedAtMs: atMs, durationS: 53, pausedMs: 0 });
  });

  it("'Get in position' 3, 2, 1, then 'Hold 0:50' counting down; the h1 is 'Plank' in both", async () => {
    seedHold();
    await renderLoaded();
    expect(screenId()).toBe("UF-09.7");
    for (const n of ["3", "2", "1"]) {
      expect(phaseText()).toBe("Get in position");
      expect(timerText()).toBe(n);
      expect(heading()).toBe("Plank");
      await advance(1000);
    }
    expect(phaseText()).toBe("Hold");
    expect(timerText()).toBe("0:50");
    expect(heading()).toBe("Plank");
    await advance(1000);
    expect(timerText()).toBe("0:49");
    await advance(9000);
    expect(timerText()).toBe("0:40");
    expect(phaseText()).toBe("Hold");
  });

  it("the pair: with plank missing from the library, the h1 is 'plank' (D-0118 §8)", async () => {
    vi.mocked(offline.loadLibrary).mockResolvedValueOnce(L1.filter((e) => e.id !== "plank"));
    seedHold();
    await renderLoaded();
    expect(heading()).toBe("plank");
    await advance(3000);
    expect(phaseText()).toBe("Hold");
    expect(heading()).toBe("plank");
  });

  it("the hold is 50 from prefill.durationS, not item.durationS 45", async () => {
    seedHold();
    await renderLoaded();
    await advance(3000);
    expect(timerText()).toBe("0:50");
    expect(timerText()).not.toBe("0:45");
  });

  it.each([
    ["prefill null → item.durationS 45", { durationS: 45, prefillS: null }, "0:45"],
    ["prefill null → item.durationS 30", { durationS: 30, prefillS: null }, "0:30"],
    ["both null → 45", { durationS: null, prefillS: null }, "0:45"],
  ])("fallback: %s", async (_name, { durationS, prefillS }, shown) => {
    const plank = { ...PLANK, durationS, prefill: { ...PLANK.prefill, durationS: prefillS } };
    const plan = planWith({ items: [P1.items[0]!, P1.items[1]!, P1.items[2]!, plank] });
    await seedSession({ plan });
    seedFocus(
      NOW,
      { phase: "next", itemIndex: 3, timer: { startedAtMs: NOW, durationS: 60, pausedMs: 0 } },
      plan,
    );
    await renderLoaded();
    fireEvent.click(screen.getByRole("button", { name: "I'm ready" }));
    await flushReal();
    await advance(3000);
    expect(phaseText()).toBe("Hold");
    expect(timerText()).toBe(shown);
    expect(targetText()).toBe(`Hold ${shown}`);
  });
});

describe("T-0304c AC-3 the auto-log", () => {
  it("at 0: exactly one recordSet with the planned hold, then rest with REST_ISOLATION_S; the announcer says 'Done'", async () => {
    seedHold();
    await renderLoaded();
    await advance(52_000);
    expect(recordSpy).not.toHaveBeenCalled();
    expect(announced()).toBe("");
    await advance(1000);
    await findScreen("UF-09.5");
    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(recordSpy.mock.calls[0]![0]).toEqual(holdInput(0));
    expect(hookRecordCalls).toHaveLength(1);
    expect(storedState()).toMatchObject({
      phase: "rest",
      itemIndex: 3,
      setIndex: 0,
      timer: { durationS: REST_ISOLATION_S },
    });
    expect(storedState().loggedSets).toEqual([
      expect.objectContaining({ itemIndex: 3, setIndex: 0, exerciseId: "plank", durationS: 50 }),
    ]);
    expect(announced()).toBe("Done");
    await flushReal(50);
    expect(recordSpy).toHaveBeenCalledTimes(1);
  });

  it("the last plank set goes to done", async () => {
    seedHold({ setIndex: 1, loggedSets: [plankSet(0)] });
    await renderLoaded();
    await advance(53_000);
    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(recordSpy.mock.calls[0]![0]).toEqual(holdInput(1));
    expect(lastStore().getState().phase).toBe("done");
  });

  it("pending: re-renders over 5 s of fake time make no second call (hook or lib/offline)", async () => {
    const gate = deferred<void>();
    recordSpy.mockImplementationOnce(async (input) => {
      await gate.promise;
      return realRecord(input);
    });
    seedHold();
    await renderLoaded();
    await advance(53_000);
    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(hookRecordCalls).toHaveLength(1);
    for (let i = 0; i < 5; i += 1) await advance(1000);
    expect(screenId()).toBe("UF-09.7");
    expect(timerText()).toBe("0:00");
    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(hookRecordCalls).toHaveLength(1);
    gate.resolve();
    await findScreen("UF-09.5");
    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(hookRecordCalls).toHaveLength(1);
  });

  it("restore after the end: a remount 10 min after the hold started logs once, durationS 50, and says nothing", async () => {
    seedHold({ timer: { ...HOLD_TIMER, startedAtMs: NOW - 10 * 60_000 } });
    await renderLoaded();
    await findScreen("UF-09.5");
    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(recordSpy.mock.calls[0]![0]).toEqual(holdInput(0, 50));
    await flushReal(50);
    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(announced()).toBe("");
  });

  it("the pair, already logged: an entry for (3, 0) in loggedSets → the remount makes 0 calls", async () => {
    seedHold({
      timer: { ...HOLD_TIMER, startedAtMs: NOW - 10 * 60_000 },
      loggedSets: [plankSet(0)],
    });
    await renderLoaded();
    await flushReal(50);
    expect(recordSpy).not.toHaveBeenCalled();
    expect(hookRecordCalls).toHaveLength(0);
    // It moves on as that log did: the rest after plank set 1, with no second entry.
    expect(storedState()).toMatchObject({
      phase: "rest",
      itemIndex: 3,
      setIndex: 0,
      timer: { startedAtMs: NOW, durationS: REST_ISOLATION_S, pausedMs: 0 },
    });
    expect(storedState().loggedSets).toEqual([plankSet(0)]);
  });

  it("an entry of another exercise at (3, 0) (after a swap, T-0410) isn't this hold: it logs once", async () => {
    seedHold({
      timer: { ...HOLD_TIMER, startedAtMs: NOW - 10 * 60_000 },
      loggedSets: [plankSet(0, { clientId: "x0", exerciseId: "side-plank" })],
    });
    await renderLoaded();
    await flushReal(50);
    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(recordSpy.mock.calls[0]![0]).toEqual(holdInput(0));
  });

  it("rejection: polite 'Couldn't save. Tap Log hold to try again.', one Log hold, no auto retry; Log hold calls recordSet again", async () => {
    recordSpy.mockRejectedValueOnce(new Error("quota"));
    seedHold();
    await renderLoaded();
    await advance(53_000);
    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(screenId()).toBe("UF-09.7");
    expect(timerText()).toBe("0:00");
    expect(statusText()).toBe("Couldn't save. Tap Log hold to try again.");
    expect(document.querySelector(".wl-uf09__status")).toHaveAttribute("aria-live", "polite");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getAllByRole("button", { name: "Log hold" })).toHaveLength(1);
    expect(buttonNames()).toEqual(["Pause workout", "Log hold"]);
    // The re-renders at 0 don't retry by themselves.
    for (let i = 0; i < 5; i += 1) await advance(1000);
    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(hookRecordCalls).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Log hold" }));
    await findScreen("UF-09.5");
    expect(recordSpy).toHaveBeenCalledTimes(2);
    expect(recordSpy.mock.calls[1]![0]).toEqual(holdInput(0));
    expect(storedState().loggedSets).toHaveLength(1);
  });

  it("the pair: a write that succeeds shows no error text and no Log hold", async () => {
    seedHold();
    await renderLoaded();
    await advance(10_000);
    expect(statusText()).toBe("");
    expect(screen.queryByRole("button", { name: "Log hold" })).toBeNull();
  });

  it("a second rejected Log hold keeps the text and the button, and doesn't throw", async () => {
    recordSpy.mockRejectedValueOnce(new Error("quota")).mockRejectedValueOnce(new Error("quota"));
    seedHold();
    await renderLoaded();
    await advance(53_000);
    fireEvent.click(screen.getByRole("button", { name: "Log hold" }));
    await flushReal();
    expect(recordSpy).toHaveBeenCalledTimes(2);
    expect(screenId()).toBe("UF-09.7");
    expect(statusText()).toBe("Couldn't save. Tap Log hold to try again.");
    fireEvent.click(screen.getByRole("button", { name: "Log hold" }));
    await findScreen("UF-09.5");
    expect(recordSpy).toHaveBeenCalledTimes(3);
  });
});

describe("T-0304c AC-4 the ring-only pause in the host", () => {
  /** Hold 30 s left: 3 s position + 20 s of the hold. */
  async function to30(): Promise<void> {
    seedHold();
    await renderLoaded();
    await advance(23_000);
    expect(timerText()).toBe("0:30");
  }

  it("Pause timer (≥ 44 px class) at 30 s, 20 s, Resume timer → 30 s; elapsedS +20; the hold ends 20 s later", async () => {
    await to30();
    const pauseTimer = screen.getByRole("button", { name: "Pause timer" });
    expect(pauseTimer).toHaveClass("wl-uf09__secondary");
    expect(pauseTimer).toHaveClass("wl-uf09__wide");
    const elapsedBefore = session().elapsedS;
    fireEvent.click(pauseTimer);
    await flushReal();
    // T-0424 AC-1: the workout clock runs while the ring is held (principle 2, D-0119 §2).
    await advance(10_000);
    expect(session().elapsedS - elapsedBefore).toBe(10);
    expect(timerText()).toBe("0:30");
    await advance(10_000);
    expect(session().elapsedS - elapsedBefore).toBe(20);
    expect(timerText()).toBe("0:30");
    fireEvent.click(screen.getByRole("button", { name: "Resume timer" }));
    await flushReal();
    expect(timerText()).toBe("0:30");
    expect(session().elapsedS - elapsedBefore).toBe(20);
    expect(storedState()).toMatchObject({ workoutPausedMs: 0, timerPausedAtMs: null });
    expect(storedState().timer!.pausedMs).toBe(20_000);
    await advance(29_000);
    expect(recordSpy).not.toHaveBeenCalled();
    await advance(1000);
    await findScreen("UF-09.5");
    expect(recordSpy).toHaveBeenCalledTimes(1);
  });

  it("the pair: a ring paused at 0 s of fake time never logs (no auto-log while paused)", async () => {
    await to30();
    fireEvent.click(screen.getByRole("button", { name: "Pause timer" }));
    await flushReal();
    await advance(120_000);
    expect(recordSpy).not.toHaveBeenCalled();
    expect(screenId()).toBe("UF-09.7");
  });

  it("a workout pause during the hold: 60 s, Resume → 30 s left, workoutPausedMs +60 000", async () => {
    await to30();
    fireEvent.click(screen.getByRole("button", { name: "Pause workout" }));
    await flushReal();
    expect(screenId()).toBe("UF-09.9");
    await advance(60_000);
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    await flushReal();
    expect(screenId()).toBe("UF-09.7");
    expect(timerText()).toBe("0:30");
    expect(storedState().workoutPausedMs).toBe(60_000);
  });

  it("both pauses: the ring stays paused after Resume; after Resume timer the time left is the ring-pause value", async () => {
    await to30();
    fireEvent.click(screen.getByRole("button", { name: "Pause timer" }));
    await flushReal();
    fireEvent.click(screen.getByRole("button", { name: "Pause workout" }));
    await flushReal();
    await advance(60_000);
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    await flushReal();
    expect(screen.getByRole("button", { name: "Resume timer" })).toBeInTheDocument();
    expect(timerText()).toBe("0:30");
    await advance(5000);
    expect(timerText()).toBe("0:30");
    fireEvent.click(screen.getByRole("button", { name: "Resume timer" }));
    await flushReal();
    expect(timerText()).toBe("0:30");
    expect(storedState().workoutPausedMs).toBe(60_000);
    expect(storedState().timer!.pausedMs).toBe(65_000);
    await advance(30_000);
    await findScreen("UF-09.5");
    expect(recordSpy).toHaveBeenCalledTimes(1);
  });

  it("restore: a remount while ring-paused shows Resume timer and the same time left", async () => {
    await to30();
    fireEvent.click(screen.getByRole("button", { name: "Pause timer" }));
    await flushReal();
    const before = storedState();
    // T-0424 AC-2: unmount the first root, so only one host (one store, one timer loop) runs.
    cleanup();
    await advance(10_000);
    await renderLoaded();
    expect(screenId()).toBe("UF-09.7");
    expect(screen.getByRole("button", { name: "Resume timer" })).toBeInTheDocument();
    expect(timerText()).toBe("0:30");
    expect(storedState()).toEqual(before);
    const hosts = document.querySelectorAll("[data-screen-id]");
    expect(hosts).toHaveLength(1);
    expect(hosts[0]!.getAttribute("data-screen-id")).toBe("UF-09.7");
    await flushReal(50);
    expect(recordSpy).toHaveBeenCalledTimes(0);
  });

  it("exactly Pause workout and Pause timer while the hold runs", async () => {
    seedHold();
    await renderLoaded();
    expect(buttonNames()).toEqual(["Pause workout", "Pause timer"]);
    await advance(3000);
    expect(buttonNames()).toEqual(["Pause workout", "Pause timer"]);
  });
});

describe("T-0304c AC-5 the copy (D-0062 §5, D-0119 §4)", () => {
  type Kind = SessionPlan["items"][number]["prefill"]["kind"];
  const KINDS: Kind[] = [
    "first_time",
    "carry",
    "reentry",
    "hold_after_break",
    "increase",
    "deload",
    "hold",
    "add_rep",
  ];
  const planOfKind = (kind: Kind, durationS = 50): SessionPlan =>
    planWith({
      warmup: [],
      items: [BENCH, { ...PLANK, prefill: { ...PLANK.prefill, kind, durationS } }],
    });

  async function showTimed(plan: SessionPlan): Promise<void> {
    await seedSession({ plan });
    seedFocus(NOW, { phase: "timed", itemIndex: 1, setIndex: 0, timer: HOLD_TIMER }, plan);
    await renderLoaded();
    expect(screenId()).toBe("UF-09.7");
  }

  it("prefill {durationS: 120, kind: 'hold'} reads 'Hold 2:00', with no kind line", async () => {
    await showTimed(planOfKind("hold", 120));
    expect(targetText()).toBe("Hold 2:00");
    expect(kindEl()).toBeNull();
  });

  it.each(["hold_after_break", "reentry"] as const)("%s shows 'Easing back in'", async (kind) => {
    await showTimed(planOfKind(kind));
    expect(kindEl()?.textContent).toBe("Easing back in");
  });

  it.each(["add_rep", "first_time", "increase"] as const)(
    "the pair: %s shows no kind line",
    async (kind) => {
      await showTimed(planOfKind(kind));
      expect(targetText()).toBe("Hold 0:50");
      expect(kindEl()).toBeNull();
    },
  );

  it.each(KINDS)(
    "%s: no UF-09.6 or UF-09.7 text claims 'same / last time / as before'",
    async (kind) => {
      const plan = planOfKind(kind);
      await seedSession({ plan });
      seedFocus(
        NOW,
        { phase: "next", itemIndex: 1, timer: { startedAtMs: NOW, durationS: 60, pausedMs: 0 } },
        plan,
      );
      await renderLoaded();
      expect(screenId()).toBe("UF-09.6");
      expect(document.body.textContent).not.toMatch(/same|last time|as before/i);
      fireEvent.click(screen.getByRole("button", { name: "I'm ready" }));
      await flushReal();
      expect(screenId()).toBe("UF-09.7");
      expect(document.body.textContent).not.toMatch(/same|last time|as before/i);
      await advance(3000);
      expect(phaseText()).toBe("Hold");
      expect(document.body.textContent).not.toMatch(/same|last time|as before/i);
    },
  );

  it("the regex is live: it catches a planted claim, and passes the real copy", () => {
    const planted = ["Same as last time", "Hold as before", "+5 s on last time"];
    for (const text of planted) expect(text).toMatch(/same|last time|as before/i);
    const real = [en.uf09.holdTarget("2:00"), en.uf09.easingBackIn, en.uf09.getInPosition];
    for (const text of real) expect(text).not.toMatch(/same|last time|as before/i);
  });
});

describe("T-0619 UF-09.7 state caption (AC5, AC6)", () => {
  const caption = () => document.querySelector(".wl-uf09__state");

  it("set 1 of 2: 'Timed set · 1 of 2' above the h1, the phase line unchanged, not a heading or live", async () => {
    seedHold();
    await renderLoaded();
    expect(caption()!.textContent).toBe(en.uf09.timedCaption(1, 2));
    expect(caption()!.nextElementSibling).toBe(screen.getByRole("heading", { level: 1 }));
    expect(caption()!.closest("h1,h2,[aria-live],[role=status],[role=alert]")).toBeNull();
    expect(phaseText()).toBe("Get in position");
    expect(heading()).toBe("Plank");
  });

  it("a 1-set item shows 'Timed set · 1 of 1'", async () => {
    const plan = planWith({
      items: [P1.items[0]!, P1.items[1]!, P1.items[2]!, { ...PLANK, sets: 1 }],
    });
    await seedSession({ plan });
    seedHold({}, plan);
    await renderLoaded();
    expect(caption()!.textContent).toBe(en.uf09.timedCaption(1, 1));
    expect(caption()!.textContent).toBe("Timed set · 1 of 1");
  });
});
