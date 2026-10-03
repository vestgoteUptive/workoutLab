// T-0304g AC-5 (reduced motion, NFR-A11Y-5, D-0119 §10, D-0155 §1–§2). The ring fill on UF-09.2
// (warm-up) and UF-09.7 (timed, both `ring.tsx`) and UF-09.5 (rest's own ring) has an inline
// `style.transition` of "none" under reduce or with no `matchMedia`, else
// "stroke-dashoffset 1s linear". The `role="timer"` text still changes each second on all three,
// and on UF-09.6, which has no ring (D-0155 §1).
import { act, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as offline from "../../../lib/offline/index.js";
import type { FocusState } from "../machine.js";
import { STARTED_AT_MS, USER_A } from "./fixtures.js";
import { freshDb, screenId, seedSession, signIn, timerText, useFakeClock } from "./helpers.js";
import { renderSession } from "./session-helpers.js";
import { L2, defaultDetail } from "./set-loop-fixtures.js";
import { seedFocus } from "./set-loop-helpers.js";
import { loggedSets } from "./countdown-helpers.js";
import {
  hideMatchMedia,
  restoreDeviceStubs,
  ringTransition,
  stubMatchMedia,
} from "./t0304g-stubs.js";

vi.mock("../../../lib/offline/index.js", (orig) =>
  import("./set-loop-mock.js").then((m) => m.setLoopMock(orig)),
);

const NOW = STARTED_AT_MS + 10 * 60_000;

beforeEach(async () => {
  window.localStorage.clear();
  vi.mocked(offline.loadLibrary).mockImplementation(async () => L2);
  vi.mocked(offline.loadExerciseDetail).mockImplementation(defaultDetail);
  freshDb();
  useFakeClock(NOW);
  signIn(USER_A);
  await seedSession();
});

afterEach(() => {
  cleanup();
  restoreDeviceStubs();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const running = (durationS: number) => ({ startedAtMs: NOW, durationS, pausedMs: 0 });
const tick = () =>
  act(() => {
    vi.advanceTimersByTime(1000);
  });

const RINGS: Array<[string, Partial<FocusState>]> = [
  ["UF-09.2", { phase: "warmup", warmupStartedAtMs: NOW, timer: running(40) }],
  ["UF-09.5", { phase: "rest", timer: running(120), loggedSets: loggedSets(0, 1) }],
  // Past the 3 s Get in position, into the hold.
  [
    "UF-09.7",
    {
      phase: "timed",
      itemIndex: 3,
      timer: { startedAtMs: NOW - 5000, durationS: 53, pausedMs: 0 },
    },
  ],
];

/** Mounts `seed`, checks the screen and the transition, and that the timer text moves on each
 *  of three seconds while the transition stays the same. */
async function check(screen: string, seed: Partial<FocusState>, transition: string) {
  seedFocus(NOW, seed);
  await renderSession({ locale: "en-GB" });
  expect(screenId()).toBe(screen);
  const seen = [timerText()];
  expect(ringTransition()).toBe(transition);
  for (let i = 0; i < 3; i += 1) {
    tick();
    seen.push(timerText());
    expect(ringTransition()).toBe(transition);
  }
  expect(new Set(seen).size).toBe(4);
}

describe("AC-5 reduce: matchMedia(reduce).matches true", () => {
  it.each(RINGS)(
    "%s: the ring fill's transition is 'none'; the timer text still counts",
    async (id, seed) => {
      const mm = stubMatchMedia(true);
      await check(id, seed, "none");
      expect(mm).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
    },
  );

  it("UF-09.6 (no ring): the timer text still changes each second", async () => {
    stubMatchMedia(true);
    seedFocus(NOW, { phase: "next", itemIndex: 1, timer: running(60) });
    await renderSession({ locale: "en-GB" });
    expect(screenId()).toBe("UF-09.6");
    expect(ringTransition()).toBeNull();
    const seen = [timerText()];
    for (let i = 0; i < 3; i += 1) {
      tick();
      seen.push(timerText());
    }
    expect(new Set(seen).size).toBe(4);
  });
});

describe("AC-5 the pair: the preference false", () => {
  it.each(RINGS)("%s: 'stroke-dashoffset 1s linear'", async (id, seed) => {
    stubMatchMedia(false);
    await check(id, seed, "stroke-dashoffset 1s linear");
  });
});

describe("AC-5 no matchMedia counts as reduce (D-0155 §2)", () => {
  it.each(RINGS)("%s: 'none', with no throw", async (id, seed) => {
    hideMatchMedia();
    expect(window.matchMedia).toBeUndefined();
    const errors = vi.spyOn(console, "error");
    await check(id, seed, "none");
    expect(errors).not.toHaveBeenCalled();
  });
});
