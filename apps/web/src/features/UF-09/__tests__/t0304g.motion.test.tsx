// T-0304g AC-5 (reduced motion, NFR-A11Y-5, D-0119 §10, D-0155 §1–§2). No view draws a ring any
// more: T-0596 (UF-09.2, UF-09.7) and T-0597 (UF-09.1, UF-09.5, UF-09.6) replaced it with the fill,
// whose reduced-motion rule is CSS (asserted in t0596.* and t0597.*). Here the `role="timer"` text
// still changes each second under reduce, without it and with no `matchMedia` (D-0155 §1–§2).
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
import { hideMatchMedia, restoreDeviceStubs, stubMatchMedia } from "./t0304g-stubs.js";

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

const FILLS: Array<[string, Partial<FocusState>]> = [
  ["UF-09.2", { phase: "warmup", warmupStartedAtMs: NOW, timer: running(40) }],
  // Past the 3 s Get in position, into the hold.
  [
    "UF-09.7",
    {
      phase: "timed",
      itemIndex: 3,
      timer: { startedAtMs: NOW - 5000, durationS: 53, pausedMs: 0 },
    },
  ],
  ["UF-09.5", { phase: "rest", timer: running(120), loggedSets: loggedSets(0, 1) }],
  ["UF-09.6", { phase: "next", itemIndex: 1, timer: running(60) }],
  ["UF-09.1", { phase: "getReady", timer: running(60) }],
];

describe("AC-5 no view has a ring; the timer text still counts", () => {
  it.each(
    FILLS.flatMap((f) =>
      ["reduce", "no-preference", "no matchMedia"].map((m) => [...f, m] as const),
    ),
  )("%s, %s", async (id, seed, mode) => {
    if (mode === "no matchMedia") hideMatchMedia();
    else stubMatchMedia(mode === "reduce");
    seedFocus(NOW, seed);
    await renderSession({ locale: "en-GB" });
    expect(screenId()).toBe(id);
    expect(document.querySelector(".wl-uf09__ring-fill, svg.wl-uf09__ring-svg")).toBeNull();
    const seen = [timerText()];
    for (let i = 0; i < 3; i += 1) {
      tick();
      seen.push(timerText());
    }
    expect(new Set(seen).size).toBe(4);
  });
});
