// T-0304c AC-1 (UF-09.2 Warm-up, parent AC-C1, D-0066 §8, D-0119 §5): P1's four 40 s moves,
// each with its library name and cached cue, Restart from the wall clock, Next move at once, the
// auto-advance into UF-09.6, focus on Next move, and nothing ever logged.
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as offline from "../../../lib/offline/index.js";
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
import { findCue, findScreen, storedState } from "./set-loop-helpers.js";
import { SCAP_CUE } from "./warmup-timed-mock.js";

vi.mock("../../../lib/offline/index.js", (orig) =>
  import("./warmup-timed-mock.js").then((m) => m.warmupTimedMock(orig)),
);

const NOW = STARTED_AT_MS + 60_000;
const recordSpy = vi.mocked(offline.recordSet);

const heading = () => screen.getByRole("heading", { level: 1 }).textContent;
const cueEl = () => document.querySelector('[data-field="cue"]');

beforeEach(async () => {
  window.localStorage.clear();
  recordSpy.mockClear();
  freshDb();
  useFakeClock(NOW);
  signIn(USER_A);
  await seedSession({ plan: P1 });
});

afterEach(() => {
  vi.useRealTimers();
});

/** UF-09.1's 5 s, then UF-09.2 move 0. */
async function toWarmup(): Promise<void> {
  await renderLoaded();
  expect(screenId()).toBe("UF-09.1");
  await advance(5000);
  await findScreen("UF-09.2");
}

describe("T-0304c AC-1 move 0 and its pair", () => {
  it("move 0: 'Scap push-up', a role=timer 0:40, the cue 'Arms straight'", async () => {
    await toWarmup();
    expect(heading()).toBe("Scap push-up");
    expect(timerText()).toBe("0:40");
    expect((await findCue()).textContent).toBe(SCAP_CUE);
    expect(document.querySelector('[data-field="move-index"]')!.textContent).toBe("Move 1 of 4");
  });

  it("the pair: move 1 'Band pull-apart' (detail null) has no cue element", async () => {
    await toWarmup();
    await findCue();
    await advance(40_000);
    expect(screenId()).toBe("UF-09.2");
    expect(heading()).toBe("Band pull-apart");
    expect(timerText()).toBe("0:40");
    await flushReal(50);
    expect(cueEl()).toBeNull();
  });

  it("a move missing from the library shows its id (D-0118 §8)", async () => {
    vi.mocked(offline.loadLibrary).mockResolvedValueOnce([]);
    await toWarmup();
    expect(heading()).toBe("wu-scap-push-up");
  });
});

describe("T-0304c AC-1 auto-advance", () => {
  it("at 40 s it shows move 1; after move 3 it shows UF-09.6 for bench-press", async () => {
    await toWarmup();
    await advance(39_000);
    expect(heading()).toBe("Scap push-up");
    expect(timerText()).toBe("0:01");
    await advance(1000);
    expect(heading()).toBe("Band pull-apart");
    await advance(40_000);
    expect(heading()).toBe("Bodyweight squat");
    await advance(40_000);
    expect(heading()).toBe("Arm circle");
    expect(screenId()).toBe("UF-09.2");
    await advance(40_000);
    expect(screenId()).toBe("UF-09.6");
    expect(heading()).toBe("Bench press");
    expect(storedState()).toMatchObject({ phase: "next", itemIndex: 0 });
  });
});

describe("T-0304c AC-1 Restart and Next move", () => {
  it("Restart at 25 s reads 0:40 again, and the stored timer starts at the click", async () => {
    await toWarmup();
    await advance(25_000);
    expect(timerText()).toBe("0:15");
    const clickAt = Date.now();
    fireEvent.click(screen.getByRole("button", { name: "Restart" }));
    await flushReal();
    expect(timerText()).toBe("0:40");
    expect(heading()).toBe("Scap push-up");
    expect(storedState().timer).toEqual({ startedAtMs: clickAt, durationS: 40, pausedMs: 0 });
    // From the wall clock: 40 s after the click it moves on, not 15 s.
    await advance(39_000);
    expect(heading()).toBe("Scap push-up");
    await advance(1000);
    expect(heading()).toBe("Band pull-apart");
  });

  it("the pair: without Restart, the same move ends 15 s later", async () => {
    await toWarmup();
    await advance(25_000);
    await advance(15_000);
    expect(heading()).toBe("Band pull-apart");
  });

  it("Next move advances at once, with a fresh 0:40", async () => {
    await toWarmup();
    await advance(10_000);
    fireEvent.click(screen.getByRole("button", { name: "Next move" }));
    await flushReal();
    expect(heading()).toBe("Band pull-apart");
    expect(timerText()).toBe("0:40");
    expect(storedState()).toMatchObject({ phase: "warmup", warmupIndex: 1 });
  });

  it("Next move on the last move leaves the warm-up for UF-09.6", async () => {
    await toWarmup();
    for (let i = 0; i < 3; i += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Next move" }));
      await flushReal();
    }
    expect(heading()).toBe("Arm circle");
    fireEvent.click(screen.getByRole("button", { name: "Next move" }));
    await flushReal();
    expect(screenId()).toBe("UF-09.6");
  });
});

describe("T-0304c AC-1 nothing logged, focus, buttons", () => {
  it("over the whole warm-up recordSet has 0 calls", async () => {
    await toWarmup();
    await advance(20_000);
    fireEvent.click(screen.getByRole("button", { name: "Restart" }));
    await flushReal();
    fireEvent.click(screen.getByRole("button", { name: "Next move" }));
    await flushReal();
    // Moves 1, 2 and 3 run out on their own.
    await advance(40_000);
    await advance(40_000);
    await advance(40_000);
    expect(screenId()).toBe("UF-09.6");
    await flushReal(50);
    expect(recordSpy).not.toHaveBeenCalled();
    expect(storedState().loggedSets).toEqual([]);
  });

  it("focus lands on Next move, and stays there on the next move", async () => {
    await toWarmup();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Next move" }));
    await advance(40_000);
    expect(heading()).toBe("Band pull-apart");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Next move" }));
  });

  it("exactly Pause workout, Restart, Next move", async () => {
    await toWarmup();
    const names = screen
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label") ?? b.textContent);
    expect(names).toEqual(["Pause workout", "Restart", "Next move"]);
  });
});
