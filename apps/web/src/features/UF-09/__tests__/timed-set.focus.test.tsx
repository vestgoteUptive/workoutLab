// T-0423 AC-1–AC-5 (UF-09.7 Timed set at 0, UF-09.5 Rest, NFR-A11Y-1, D-0119 §3, D-0150): the
// "Pause timer" toggle leaves the DOM at 0, so focus moves to the view's <h1> while the hold is
// saved, to "Log hold" when the write fails, and to the next step's primary when it succeeds. A
// control the user focused in the chrome keeps focus. Same setup as `timed-set.test.tsx`.
import { act, fireEvent, screen } from "@testing-library/react";
import type { SessionPlan } from "@workoutlab/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as offline from "../../../lib/offline/index.js";
import type { FocusState, LoggedSet } from "../machine.js";
import { P1, STARTED_AT_MS, USER_A } from "./fixtures.js";
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
import { probe } from "./probe.js";
import { deferred } from "./session-helpers.js";
import { findScreen, seedFocus } from "./set-loop-helpers.js";
import { hookRecordCalls } from "./session-spy.js";
import { stores } from "./store-spy.js";

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
const HOLD_ERROR = "Couldn't save. Tap Log hold to try again.";

const h1 = () => screen.getByRole("heading", { level: 1 });
const button = (name: string) => screen.getByRole("button", { name });
const statusText = () => document.querySelector(".wl-uf09__status")?.textContent ?? "";
const buttonNames = () =>
  screen.getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? b.textContent);
const focused = () => document.activeElement;

function plankSet(setIndex: number): LoggedSet {
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
  };
}

/** The plank at `setIndex`, its position + hold timer started at `NOW`. */
function seedHold(patch: Partial<FocusState> = {}, plan: SessionPlan = P1): void {
  seedFocus(NOW, { phase: "timed", itemIndex: 3, setIndex: 0, timer: HOLD_TIMER, ...patch }, plan);
}

/** Holds the next `recordSet` on a gate; `release()` lets it through to the real write. */
function holdNextWrite() {
  const gate = deferred<void>();
  recordSpy.mockImplementationOnce(async (input) => {
    await gate.promise;
    return realRecord(input);
  });
  return gate;
}

/** Holds the next `recordSet` on a gate that rejects it. */
function holdNextWriteToReject() {
  const gate = deferred<void>();
  recordSpy.mockImplementationOnce(async () => {
    await gate.promise;
    throw new Error("quota");
  });
  return gate;
}

/** Moves focus to the chrome's "Pause workout", as a keyboard user's Tab would. */
function focusPauseWorkout(): HTMLElement {
  const pause = button("Pause workout");
  act(() => pause.focus());
  expect(focused()).toBe(pause);
  return pause;
}

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

describe("T-0423 AC-1 the pair: focus while the hold runs", () => {
  it("at mount in the position phase, focus is on 'Pause timer'", async () => {
    seedHold();
    await renderLoaded();
    expect(screenId()).toBe("UF-09.7");
    expect(focused()).toBe(button("Pause timer"));
  });

  it("ring paused: focus is on 'Resume timer', and still there after 120 s", async () => {
    seedHold();
    await renderLoaded();
    await advance(23_000);
    fireEvent.click(button("Pause timer"));
    await flushReal();
    expect(focused()).toBe(button("Resume timer"));
    await advance(120_000);
    expect(screenId()).toBe("UF-09.7");
    expect(focused()).toBe(button("Resume timer"));
    expect(recordSpy).not.toHaveBeenCalled();
  });
});

describe("T-0423 AC-2 at 0 while the write is pending", () => {
  it("focus moves to the <h1> 'Plank' (tabindex -1) and never falls to the body", async () => {
    const gate = holdNextWrite();
    seedHold();
    await renderLoaded();
    expect(focused()).toBe(button("Pause timer"));
    await advance(53_000);
    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(screenId()).toBe("UF-09.7");
    expect(timerText()).toBe("0:00");
    expect(h1().textContent).toBe("Plank");
    expect(h1()).toHaveAttribute("tabindex", "-1");
    expect(focused()).toBe(h1());
    for (let i = 0; i < 5; i += 1) {
      await advance(1000);
      expect(focused()).not.toBe(document.body);
      expect(focused()).toBe(h1());
    }
    expect(buttonNames()).toEqual(["Pause workout"]);
    gate.resolve();
    await findScreen("UF-09.5");
  });

  it("the <h1> is outside the Tab order while the hold runs too (tabindex -1, not 0)", async () => {
    seedHold();
    await renderLoaded();
    expect(h1()).toHaveAttribute("tabindex", "-1");
    expect(focused()).not.toBe(h1());
  });

  it("the pair: focus on the chrome's 'Pause workout' before 0 stays there at 0", async () => {
    const gate = holdNextWrite();
    seedHold();
    await renderLoaded();
    await advance(10_000);
    const pause = focusPauseWorkout();
    await advance(43_000);
    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(screenId()).toBe("UF-09.7");
    expect(timerText()).toBe("0:00");
    expect(focused()).toBe(pause);
    await advance(1000);
    expect(focused()).toBe(pause);
    gate.resolve();
    await findScreen("UF-09.5");
  });
});

describe("T-0423 AC-3 a failed write", () => {
  it("focus moves to 'Log hold'; a second rejected Log hold keeps it there", async () => {
    recordSpy.mockRejectedValueOnce(new Error("quota"));
    seedHold();
    await renderLoaded();
    await advance(53_000);
    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(screenId()).toBe("UF-09.7");
    expect(statusText()).toBe(HOLD_ERROR);
    expect(focused()).toBe(button("Log hold"));
    const gate = holdNextWriteToReject();
    fireEvent.click(button("Log hold"));
    await flushReal();
    expect(recordSpy).toHaveBeenCalledTimes(2);
    expect(focused()).toBe(button("Log hold"));
    gate.resolve();
    await flushReal();
    expect(screenId()).toBe("UF-09.7");
    expect(statusText()).toBe(HOLD_ERROR);
    expect(focused()).toBe(button("Log hold"));
    await advance(1000);
    expect(focused()).toBe(button("Log hold"));
  });

  it("the <h1> had focus during the pending write: the rejection moves it to 'Log hold'", async () => {
    const gate = holdNextWriteToReject();
    seedHold();
    await renderLoaded();
    await advance(53_000);
    expect(focused()).toBe(h1());
    gate.resolve();
    await flushReal();
    expect(statusText()).toBe(HOLD_ERROR);
    expect(focused()).toBe(button("Log hold"));
  });

  it("a remount with holdFailed already true (reject → Pause workout → Resume) focuses 'Log hold'", async () => {
    recordSpy.mockRejectedValueOnce(new Error("quota"));
    seedHold();
    await renderLoaded();
    await advance(53_000);
    expect(focused()).toBe(button("Log hold"));
    fireEvent.click(button("Pause workout"));
    await flushReal();
    expect(screenId()).toBe("UF-09.9");
    fireEvent.click(button("Resume"));
    await flushReal();
    expect(screenId()).toBe("UF-09.7");
    expect(statusText()).toBe(HOLD_ERROR);
    expect(focused()).toBe(button("Log hold"));
    await advance(1000);
    expect(focused()).toBe(button("Log hold"));
    expect(recordSpy).toHaveBeenCalledTimes(1);
  });

  it("the pair: focus on 'Pause workout' when the write rejects stays there; Log hold is rendered", async () => {
    const gate = holdNextWriteToReject();
    seedHold();
    await renderLoaded();
    await advance(10_000);
    const pause = focusPauseWorkout();
    await advance(43_000);
    gate.resolve();
    await flushReal();
    expect(statusText()).toBe(HOLD_ERROR);
    expect(button("Log hold")).toBeInTheDocument();
    expect(focused()).toBe(pause);
    await advance(1000);
    expect(focused()).toBe(pause);
  });
});

describe("T-0423 AC-4 restore after the end", () => {
  const ended = { timer: { ...HOLD_TIMER, startedAtMs: NOW - 10 * 60_000 } };

  it("a remount 10 min after the hold ended: the <h1> has focus while the write is pending", async () => {
    const gate = holdNextWrite();
    seedHold(ended);
    await renderLoaded();
    await flushReal();
    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(screenId()).toBe("UF-09.7");
    expect(screen.queryByRole("button", { name: "Pause timer" })).toBeNull();
    expect(focused()).toBe(h1());
    gate.resolve();
    await findScreen("UF-09.5");
  });

  it("the pair: that write rejects, so focus moves to 'Log hold'", async () => {
    const gate = holdNextWriteToReject();
    seedHold(ended);
    await renderLoaded();
    await flushReal();
    expect(focused()).toBe(h1());
    gate.resolve();
    await flushReal();
    expect(statusText()).toBe(HOLD_ERROR);
    expect(focused()).toBe(button("Log hold"));
  });
});

describe("T-0423 AC-5 success hands focus to the next step", () => {
  it("recordSet resolves at 0 on plank set 1: UF-09.5, focus on 'Skip rest'", async () => {
    seedHold();
    await renderLoaded();
    await advance(53_000);
    await findScreen("UF-09.5");
    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(focused()).toBe(button("Skip rest"));
  });

  it("already logged (3, 0) (D-0150 HOLD_ALREADY_LOGGED): UF-09.5, focus on 'Skip rest'", async () => {
    seedHold({
      timer: { ...HOLD_TIMER, startedAtMs: NOW - 10 * 60_000 },
      loggedSets: [plankSet(0)],
    });
    await renderLoaded();
    await findScreen("UF-09.5");
    await flushReal(50);
    expect(recordSpy).not.toHaveBeenCalled();
    expect(focused()).toBe(button("Skip rest"));
  });
});
