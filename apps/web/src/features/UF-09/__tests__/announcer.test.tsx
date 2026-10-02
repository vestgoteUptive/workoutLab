// T-0304f AC-2 (the chrome announcer, NFR-A11Y-4, D-0118 §10, D-0119 §7): one polite live region
// that outlives every step. "10 seconds" once when a rest crosses ≤ 10 s, "Go" when a rest or
// the UF-09.1 countdown ends by expiry, and nothing for a Skip, a Start now, or a restore past an
// expiry this mount didn't see.
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as offline from "../../../lib/offline/index.js";
import type { FocusState } from "../machine.js";
import type { ViewPhase } from "../views.js";
import { STARTED_AT_MS, USER_A, behindStartedAt } from "./fixtures.js";
import {
  advance,
  flushReal,
  freshDb,
  screenId,
  seedSession,
  signIn,
  timerText,
  useFakeClock,
} from "./helpers.js";
import { renderSession } from "./session-helpers.js";
import { L2, defaultDetail } from "./set-loop-fixtures.js";
import { findScreen, seedFocus } from "./set-loop-helpers.js";
import { announced, announcer, loggedSets, seedRest } from "./countdown-helpers.js";
import { countOf, dispatched } from "./store-spy.js";

vi.mock("../../../lib/offline/index.js", (orig) =>
  import("./set-loop-mock.js").then((m) => m.setLoopMock(orig)),
);
vi.mock("../store.js", (orig) => import("./store-spy.js").then((m) => m.storeSpy(orig)));

const NOW = STARTED_AT_MS + 10 * 60_000;

beforeEach(async () => {
  window.localStorage.clear();
  dispatched.length = 0;
  vi.mocked(offline.loadLibrary).mockImplementation(async () => L2);
  vi.mocked(offline.loadExerciseDetail).mockImplementation(defaultDetail);
  freshDb();
  useFakeClock(NOW);
  signIn(USER_A);
  await seedSession();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const render = () => renderSession({ locale: "en-GB" });
/** One fake second inside act, with no real wait: the rest needs no IndexedDB work per tick. */
const tick = () =>
  act(() => {
    vi.advanceTimersByTime(1000);
  });
const running = (durationS: number) => ({ startedAtMs: NOW, durationS, pausedMs: 0 });

const SEEDS: Record<ViewPhase, Partial<FocusState>> = {
  getReady: { phase: "getReady", timer: running(5) },
  warmup: { phase: "warmup", warmupStartedAtMs: NOW, timer: running(40) },
  set: { phase: "set" },
  confirm: { phase: "confirm", timer: null, loggedSets: loggedSets(0, 1) },
  rest: { phase: "rest", timer: running(120), loggedSets: loggedSets(0, 1) },
  next: { phase: "next", itemIndex: 1, timer: running(60) },
  // T-0304c (D-0119 §1): a stored `timed` carries its position + hold timer.
  timed: { phase: "timed", itemIndex: 3, timer: running(53) },
  timeCheck: { phase: "timeCheck", itemIndex: 1 },
  paused: { phase: "paused", resumePhase: "rest", pausedAtMs: NOW, timer: running(120) },
};
const SCREEN: Record<ViewPhase, string> = {
  getReady: "UF-09.1",
  warmup: "UF-09.2",
  set: "UF-09.3",
  confirm: "UF-09.4",
  rest: "UF-09.5",
  next: "UF-09.6",
  timed: "UF-09.7",
  timeCheck: "UF-09.8",
  paused: "UF-09.9",
};

describe("AC-2 exactly one announcer in every machine state", () => {
  it.each(Object.keys(SEEDS) as ViewPhase[])(
    "%s: one [data-field=announcer] with aria-live=polite, empty",
    async (phase) => {
      // T-0304d (D-0120 §4): a restored time check re-runs rule 8, so this one is behind.
      if (phase === "timeCheck") await seedSession({ started_at: behindStartedAt(NOW) });
      seedFocus(NOW, SEEDS[phase]);
      await render();
      expect(screenId()).toBe(SCREEN[phase]);
      expect(announcer()).toHaveLength(1);
      expect(announcer()[0]).toHaveAttribute("aria-live", "polite");
      expect(announced()).toBe("");
    },
  );
});

describe("AC-2 a 120 s rest, live", () => {
  it("'' at 119 … 11 s, '10 seconds' from 10, 'Go' after the expiry moves to UF-09.3, still in the DOM", async () => {
    seedRest(NOW);
    await render();
    const region = announcer()[0];
    for (let left = 119; left >= 11; left -= 1) {
      tick();
      expect(timerText()).toBe(`${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`);
      expect(announced()).toBe("");
    }
    await advance(1000);
    expect(timerText()).toBe("0:10");
    expect(announced()).toBe("10 seconds");
    // Said once: the region doesn't change again on the ticks after.
    for (let left = 9; left >= 1; left -= 1) {
      tick();
      expect(announced()).toBe("10 seconds");
    }
    await advance(1000);
    expect(screenId()).toBe("UF-09.3");
    expect(countOf("REST_END")).toBe(1);
    expect(announced()).toBe("Go");
    expect(announcer()).toHaveLength(1);
    // The same element: it stayed mounted across the step (D-0118 §10).
    expect(announcer()[0]).toBe(region);
    expect(region!.isConnected).toBe(true);
  });

  it("the pair, Skip: Skip rest at 50 s leaves it ''", async () => {
    seedRest(NOW);
    await render();
    await advance(50_000);
    fireEvent.click(screen.getByRole("button", { name: "Skip rest" }));
    await flushReal();
    expect(screenId()).toBe("UF-09.3");
    expect(announced()).toBe("");
  });

  it("Skip rest after '10 seconds' was said clears it, and says no 'Go'", async () => {
    seedRest(NOW);
    await render();
    await advance(115_000);
    expect(announced()).toBe("10 seconds");
    fireEvent.click(screen.getByRole("button", { name: "Skip rest" }));
    await flushReal();
    expect(screenId()).toBe("UF-09.3");
    expect(announced()).toBe("");
  });

  it("a paused rest says nothing while paused, and the crossing after Resume speaks", async () => {
    seedRest(NOW);
    await render();
    await advance(100_000);
    fireEvent.click(screen.getByRole("button", { name: "Pause workout" }));
    await flushReal();
    await advance(60_000);
    expect(screenId()).toBe("UF-09.9");
    expect(announced()).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    await flushReal();
    expect(timerText()).toBe("0:20");
    await advance(10_000);
    expect(announced()).toBe("10 seconds");
  });
});

describe("AC-2 UF-09.1", () => {
  it("Start now leaves it ''", async () => {
    await render();
    expect(screenId()).toBe("UF-09.1");
    fireEvent.click(screen.getByRole("button", { name: "Start now" }));
    await findScreen("UF-09.2");
    expect(announced()).toBe("");
  });

  it("the pair: the 5 s expiry ends with 'Go'", async () => {
    await render();
    await advance(5000);
    expect(screenId()).toBe("UF-09.2");
    expect(countOf("COUNTDOWN_END")).toBe(1);
    expect(announced()).toBe("Go");
  });
});

describe("AC-2 restore past an expiry says nothing (D-0119 §7)", () => {
  it("a remount 600 s into a 120 s rest lands on UF-09.3; the announcer stays '' (after 50 ms)", async () => {
    seedRest(NOW - 600_000);
    await render();
    expect(screenId()).toBe("UF-09.3");
    expect(countOf("REST_END")).toBe(1);
    await flushReal(50);
    expect(announced()).toBe("");
    expect(announcer()).toHaveLength(1);
  });

  it("the same for a restore past the UF-09.1 countdown", async () => {
    seedFocus(NOW, {
      phase: "getReady",
      timer: { startedAtMs: NOW - 60_000, durationS: 5, pausedMs: 0 },
    });
    await render();
    expect(screenId()).toBe("UF-09.2");
    expect(countOf("COUNTDOWN_END")).toBe(1);
    await flushReal(50);
    expect(announced()).toBe("");
  });

  it("a restore 115 s into the rest (5 s left) says no '10 seconds', but the live end says 'Go'", async () => {
    seedRest(NOW - 115_000);
    await render();
    expect(timerText()).toBe("0:05");
    await flushReal(50);
    expect(announced()).toBe("");
    await advance(4000);
    expect(announced()).toBe("");
    await advance(1000);
    expect(screenId()).toBe("UF-09.3");
    expect(announced()).toBe("Go");
  });
});

describe("AC-2 other countdowns say nothing", () => {
  it("the UF-09.6 set-up countdown's expiry leaves it ''", async () => {
    seedFocus(NOW, SEEDS.next);
    await render();
    await advance(60_000);
    expect(screenId()).toBe("UF-09.3");
    expect(countOf("READY")).toBe(1);
    await flushReal(50);
    expect(announced()).toBe("");
  });

  it("'Go' clears on the next step with a timer (UF-09.4's auto-save)", async () => {
    seedRest(NOW);
    await render();
    await advance(120_000);
    expect(announced()).toBe("Go");
    fireEvent.click(screen.getByRole("button", { name: "Done set" }));
    await findScreen("UF-09.4");
    expect(announced()).toBe("");
  });
});
