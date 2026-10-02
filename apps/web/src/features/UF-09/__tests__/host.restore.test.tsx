// T-0304a AC-4 (restore, NFR-TIME-1, D-0111 §7): a remount restores the same step; a running
// timer is recomputed from its timestamps; an expired one ends exactly once; paused stays paused.
import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialFocusState, type FocusState } from "../machine.js";
import { readFocusState } from "../persist.js";
import { elapsedS } from "../timer.js";
import { L1, P1, S1, STARTED_AT_MS, USER_A } from "./fixtures.js";
import {
  advance,
  flushReal,
  freshDb,
  renderLoaded,
  screenId,
  seedSession,
  signIn,
  storedFocus,
  timerText,
  useFakeClock,
} from "./helpers.js";
import { countOf, dispatched } from "./store-spy.js";

vi.mock("../../../lib/offline/index.js", (orig) =>
  import("./offline-mock.js").then((m) => m.offlineMock(orig)),
);
vi.mock("../store.js", (orig) => import("./store-spy.js").then((m) => m.storeSpy(orig)));

const NOW = STARTED_AT_MS + 20 * 60_000;
const KEY = `wl-focus:${S1}`;
const CTX = { plan: P1, library: L1 };

beforeEach(async () => {
  window.localStorage.clear();
  dispatched.length = 0;
  freshDb();
  useFakeClock(NOW);
  signIn(USER_A);
  await seedSession();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** P1 bench-press set 0 saved; a 120 s rest started at `startedAtMs`. */
function restAt(startedAtMs: number): FocusState {
  return {
    ...initialFocusState(S1, P1, STARTED_AT_MS),
    phase: "rest",
    itemIndex: 0,
    setIndex: 0,
    timer: { startedAtMs, durationS: 120, pausedMs: 0 },
    loggedSets: [
      {
        clientId: "c0",
        itemIndex: 0,
        setIndex: 0,
        exerciseId: "bench-press",
        reps: 6,
        weightKg: 80,
        durationS: null,
        rir: null,
        backoff: false,
      },
    ],
  };
}

describe("AC-4 restore at the same moment", () => {
  it("unmount + remount at the same Date.now renders the same phase and data-screen-id", async () => {
    let view = await renderLoaded();
    expect(screenId()).toBe("UF-09.1");
    await advance(5000); // → warmup move 0
    expect(screenId()).toBe("UF-09.2");
    await advance(12_000);
    const before = { id: screenId(), timer: timerText(), state: storedFocus() };
    view.unmount();
    view = await renderLoaded();
    expect(screenId()).toBe(before.id);
    expect(timerText()).toBe(before.timer);
    expect(storedFocus()).toEqual(before.state);
    expect((storedFocus() as unknown as FocusState).phase).toBe("warmup");
    view.unmount();
    // The pair for "restored": without the stored state, a remount starts again at UF-09.1.
    window.localStorage.removeItem(KEY);
    await renderLoaded();
    expect(screenId()).toBe("UF-09.1");
  });
});

describe("AC-4 mid-rest", () => {
  it("90 s into a 120 s rest, the remount shows role=timer 0:30", async () => {
    window.localStorage.setItem(KEY, JSON.stringify(restAt(NOW - 90_000)));
    await renderLoaded();
    expect(screenId()).toBe("UF-09.5");
    expect(screen.getByRole("timer")).toHaveTextContent("0:30");
  });

  it("at 119 s it still shows rest with 0:01, and no REST_END", async () => {
    window.localStorage.setItem(KEY, JSON.stringify(restAt(NOW - 119_000)));
    await renderLoaded();
    await flushReal();
    expect(screenId()).toBe("UF-09.5");
    expect(screen.getByRole("timer")).toHaveTextContent("0:01");
    expect(countOf("REST_END")).toBe(0);
  });

  it("at 600 s it shows set for the next set index, exactly once: one REST_END, then nothing", async () => {
    window.localStorage.setItem(KEY, JSON.stringify(restAt(NOW - 600_000)));
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    await renderLoaded();
    expect(screenId()).toBe("UF-09.3");
    expect(storedFocus()).toMatchObject({ phase: "set", itemIndex: 0, setIndex: 1 });
    expect(countOf("REST_END")).toBe(1);
    expect(dispatched.map((e) => e.type)).toEqual(["REST_END"]);
    const writes = setItem.mock.calls.filter(([k]) => k === KEY).length;
    expect(writes).toBe(1);
    // No further transition: set has no timer, so nothing chains.
    await advance(5 * 60_000);
    expect(screenId()).toBe("UF-09.3");
    expect(dispatched.map((e) => e.type)).toEqual(["REST_END"]);
    expect(setItem.mock.calls.filter(([k]) => k === KEY).length).toBe(writes);
  });
});

describe("AC-4 paused", () => {
  it("a state restored in paused stays paused, and its elapsedS equals the value before the unmount", async () => {
    let view = await renderLoaded();
    await advance(3000);
    screen.getByRole("button", { name: "Pause workout" }).click();
    await flushReal();
    expect(screenId()).toBe("UF-09.9");
    const elapsed = (s: FocusState) =>
      elapsedS({ startedAtMs: STARTED_AT_MS, warmupInBudget: true, ...s }, Date.now());
    const before = elapsed(readFocusState(S1, CTX)!);
    view.unmount();
    await advance(10 * 60_000);
    view = await renderLoaded();
    expect(screenId()).toBe("UF-09.9");
    await advance(60_000);
    expect(screenId()).toBe("UF-09.9");
    const after = readFocusState(S1, CTX)!;
    expect(after.phase).toBe("paused");
    expect(elapsed(after)).toBe(before);
    // The pair: once resumed, elapsed grows again.
    screen.getByRole("button", { name: "Resume" }).click();
    await advance(30_000);
    expect(elapsed(readFocusState(S1, CTX)!)).toBe(before + 30);
  });
});
