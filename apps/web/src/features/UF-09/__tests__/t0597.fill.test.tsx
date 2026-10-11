// T-0597 (D-0208, D-0211 §5; UF-09.1 Get ready, UF-09.5 Rest, UF-09.6 Next exercise): the rest
// state with the lift-over-rest fill instead of the ring. AC1 (state and fill), AC2 (no ring, no
// warn), AC3 (state per step), AC4 (captions), the roles and buttons, and the jump rule: when the
// fill goes back down on the same root, the next render is instant (data-drain-reset).
import { cleanup, fireEvent, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { en } from "../../../lib/i18n/en.js";
import * as offline from "../../../lib/offline/index.js";
import { drainTone, fillPercent, useDrainFill } from "../drain-fill.js";
import { initialFocusState } from "../machine.js";
import type { SeamAction } from "../seams.js";
import { seedRest, loggedSets } from "./countdown-helpers.js";
import { P1, S1, STARTED_AT_MS, USER_A } from "./fixtures.js";
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
import { seedFocus } from "./set-loop-helpers.js";
import { dispatched } from "./store-spy.js";

vi.mock("../../../lib/offline/index.js", (orig) =>
  import("./set-loop-mock.js").then((m) => m.setLoopMock(orig)),
);
vi.mock("../store.js", (orig) => import("./store-spy.js").then((m) => m.storeSpy(orig)));

const NOW = STARTED_AT_MS + 20 * 60_000;
const swap: SeamAction = {
  id: "swap",
  label: "Swap",
  render: () => null,
  keepsClockRunning: false,
};

const root = () => document.querySelector<HTMLElement>("[data-screen-id]")!;
const drain = () => root().style.getPropertyValue("--wl-drain");
const running = (durationS: number) => ({ startedAtMs: NOW, durationS, pausedMs: 0 });

beforeEach(async () => {
  window.localStorage.clear();
  dispatched.length = 0;
  vi.mocked(offline.loadLibrary).mockImplementation(async () => L2);
  vi.mocked(offline.loadExerciseDetail).mockImplementation(defaultDetail);
  freshDb();
  useFakeClock(NOW);
  signIn(USER_A);
  await seedSession({ plan: P1 });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const show = async (id: string, props: Parameters<typeof renderSession>[0] = {}) => {
  await renderSession({ locale: "en-GB", ...props });
  expect(screenId()).toBe(id);
};

describe("T-0597 AC1 the state and the fill", () => {
  it("UF-09.5: a 60 s rest is 0% at the start and 50% after 30 s, not deep", async () => {
    seedRest(NOW, { durationS: 60 });
    await show("UF-09.5");
    expect(root().getAttribute("data-wl-state")).toBe("rest");
    expect(root().classList.contains("wl-drain")).toBe(true);
    expect(root().classList.contains("wl-drain--deep")).toBe(false);
    expect(drain()).toBe("0%");
    await advance(30_000);
    expect(timerText()).toBe("0:30");
    expect(drain()).toBe("50%");
  });

  it("UF-09.1: a 5 s countdown fills 20% a second", async () => {
    seedFocus(NOW, { phase: "getReady", timer: running(5) });
    await show("UF-09.1");
    expect(root().getAttribute("data-wl-state")).toBe("rest");
    expect(root().classList.contains("wl-drain--deep")).toBe(false);
    expect(drain()).toBe("0%");
    await advance(2000);
    expect(drain()).toBe("40%");
  });

  it("UF-09.6: the 60 s set-up fills 50% after 30 s", async () => {
    seedFocus(NOW, { phase: "next", itemIndex: 1, timer: running(60) });
    await show("UF-09.6");
    expect(root().getAttribute("data-wl-state")).toBe("rest");
    expect(drain()).toBe("0%");
    await advance(30_000);
    expect(drain()).toBe("50%");
  });

  it("the pure helper: 100% at the end of each, and the tone per phase", () => {
    const ctx = { plan: P1, library: [] };
    for (const phase of ["getReady", "rest", "next"] as const) {
      const st = { ...initialFocusState(S1, P1, NOW), phase, timer: running(60) };
      expect(fillPercent(st, ctx, NOW + 15_000)).toBe(25);
      expect(fillPercent(st, ctx, NOW + 60_000)).toBe(100);
      expect(drainTone(phase)).toBe("rest");
    }
    expect(drainTone("warmup")).toBe("lift");
    expect(drainTone("timed")).toBe("lift");
    expect(fillPercent({ ...initialFocusState(S1, P1, NOW), phase: "set" }, ctx, NOW)).toBeNull();
  });
});

describe("T-0597 AC3 the state per step", () => {
  it("Skip rest ends the fill: UF-09.3 is lift with no drain class", async () => {
    seedRest(NOW, { durationS: 60 });
    await show("UF-09.5");
    fireEvent.click(screen.getByRole("button", { name: "Skip rest" }));
    await flushReal();
    expect(screenId()).toBe("UF-09.3");
    expect(root().getAttribute("data-wl-state")).toBe("lift");
    expect(root().classList.contains("wl-drain")).toBe(false);
    expect(drain()).toBe("");
  });
});

describe("T-0597 AC4 the state is named in text", () => {
  it.each([
    ["UF-09.1", { phase: "getReady" as const, timer: running(5) }, en.uf09.titles.getReady],
    [
      "UF-09.5",
      { phase: "rest" as const, timer: running(60), loggedSets: loggedSets(0, 1) },
      en.uf09.titles.rest,
    ],
    ["UF-09.6", { phase: "next" as const, itemIndex: 1, timer: running(60) }, en.uf09.titles.next],
  ])("%s shows its caption", async (id, seed, caption) => {
    seedFocus(NOW, seed);
    await show(id);
    expect(screen.getByText(caption)).toBeVisible();
  });
});

describe("T-0597 AC2 no ring, no warn; roles and buttons", () => {
  it("UF-09.5: hero clock, Skip rest is the session button, -15 s / +15 s are outline", async () => {
    seedRest(NOW, { durationS: 60 });
    await show("UF-09.5");
    expect(document.querySelector(".wl-uf09__ring, svg.wl-uf09__ring-svg, [data-warn]")).toBeNull();
    expect(screen.getByRole("timer").classList.contains("wl-type-hero-number")).toBe(true);
    const skip = screen.getByRole("button", { name: "Skip rest" });
    expect(skip.classList.contains("wl-button--session")).toBe(true);
    expect(skip.hasAttribute("disabled")).toBe(false);
    for (const name of ["−15 s", "+15 s"]) {
      expect(
        screen.getByRole("button", { name }).classList.contains("wl-button--session-outline"),
      ).toBe(true);
    }
  });

  it("UF-09.1: the digit is the countdown role; Start now primary, Skip warm-up outline", async () => {
    seedFocus(NOW, { phase: "getReady", timer: running(5) });
    await show("UF-09.1");
    expect(screen.getByRole("timer").classList.contains("wl-type-countdown")).toBe(true);
    expect(screen.getByRole("timer").textContent).toBe("5");
    expect(
      screen.getByRole("button", { name: "Start now" }).classList.contains("wl-button--session"),
    ).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "Skip warm-up" })
        .classList.contains("wl-button--session-outline"),
    ).toBe(true);
    await advance(4000);
    expect(screen.getByRole("timer").textContent).toBe("1");
  });

  it("UF-09.6: the name is the section role, I'm ready primary, the seam outline", async () => {
    seedFocus(NOW, { phase: "next", itemIndex: 1, timer: running(60) });
    await show("UF-09.6", { seams: { next: [swap] } });
    expect(screen.getByRole("heading", { level: 1 }).classList.contains("wl-type-section")).toBe(
      true,
    );
    expect(screen.getByRole("timer").classList.contains("wl-type-hero-number")).toBe(true);
    expect(
      screen.getByRole("button", { name: "I'm ready" }).classList.contains("wl-button--session"),
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: "Swap" }).classList.contains("wl-button--session-outline"),
    ).toBe(true);
  });
});

describe("T-0597 the fill goes back down: an instant jump, not a 1 s sweep", () => {
  it("+15 s late in a rest lowers the fill once: data-drain-reset for one render", async () => {
    seedRest(NOW, { durationS: 120 });
    await show("UF-09.5");
    await advance(100_000);
    expect(drain()).toBe("83.3%");
    expect(root().getAttribute("data-drain-reset")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "+15 s" }));
    await flushReal();
    expect(drain()).toBe("74.1%");
    expect(root().getAttribute("data-drain-reset")).toBe("true");
    await advance(1000);
    expect(root().getAttribute("data-drain-reset")).toBeNull();
  });

  it("Start now on a nearly full Get ready lands on UF-09.2 at 0%, with the reset mark", async () => {
    seedFocus(NOW, { phase: "getReady", timer: running(5) });
    await show("UF-09.1");
    await advance(4000);
    expect(drain()).toBe("80%");
    fireEvent.click(screen.getByRole("button", { name: "Start now" }));
    await flushReal();
    expect(screenId()).toBe("UF-09.2");
    expect(drain()).toBe("0%");
    expect(root().getAttribute("data-drain-reset")).toBe("true");
    await advance(1000);
    expect(root().getAttribute("data-drain-reset")).toBeNull();
  });

  it("the hook: high to low marks a reset, low to higher does not, a first fill above 0 does", () => {
    const { result, rerender } = renderHook(({ p }: { p: number | null }) => useDrainFill(p), {
      initialProps: { p: 0 as number | null },
    });
    expect(result.current?.reset).toBe(false);
    rerender({ p: 100 });
    expect(result.current?.reset).toBe(false);
    rerender({ p: 0 });
    expect(result.current?.reset).toBe(true);
    rerender({ p: 1.7 });
    expect(result.current?.reset).toBe(false);
    rerender({ p: null });
    expect(result.current).toBeNull();
    rerender({ p: 40 });
    expect(result.current?.reset).toBe(true);
  });
});
