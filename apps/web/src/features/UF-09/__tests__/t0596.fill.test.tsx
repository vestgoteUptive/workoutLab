// T-0596 (D-0208, D-0211 §5; UF-09.2 Warm-up, UF-09.7 Timed set): the lift state with the deep
// fill instead of the ring. AC1 (state and fill), AC2 (no ring), AC3 (captions), AC4 (contrast),
// AC7 (the fill freezes with the timer and continues), and the restyle-only guard.
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initialFocusState } from "../machine.js";
import { fillPercent } from "../drain-fill.js";
import { P1, STARTED_AT_MS, S1, USER_A } from "./fixtures.js";
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
import { seedFocus } from "./set-loop-helpers.js";

vi.mock("../../../lib/offline/index.js", (orig) =>
  import("./warmup-timed-mock.js").then((m) => m.warmupTimedMock(orig)),
);

const NOW = STARTED_AT_MS + 20 * 60_000;
const WARMUP = {
  phase: "warmup" as const,
  warmupStartedAtMs: NOW,
  timer: { startedAtMs: NOW, durationS: 40, pausedMs: 0 },
};
// The plank: 3 s "Get in position", then the 50 s hold.
const HOLD = {
  phase: "timed" as const,
  itemIndex: 3,
  setIndex: 0,
  timer: { startedAtMs: NOW, durationS: 53, pausedMs: 0 },
};

const root = () => document.querySelector<HTMLElement>("[data-screen-id]")!;
const drain = () => root().style.getPropertyValue("--wl-drain");

beforeEach(async () => {
  window.localStorage.clear();
  freshDb();
  useFakeClock(NOW);
  signIn(USER_A);
  await seedSession({ plan: P1 });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("T-0596 AC1 the state and the fill", () => {
  it("UF-09.2: lift state, deep drain classes, 0% then 25% after 10 s", async () => {
    seedFocus(NOW, WARMUP);
    await renderLoaded();
    expect(screenId()).toBe("UF-09.2");
    expect(root().getAttribute("data-wl-state")).toBe("lift");
    expect(root().classList.contains("wl-drain")).toBe(true);
    expect(root().classList.contains("wl-drain--deep")).toBe(true);
    expect(drain()).toBe("0%");
    await advance(10_000);
    expect(timerText()).toBe("0:30");
    expect(drain()).toBe("25%");
    await advance(10_000);
    expect(drain()).toBe("50%");
  });

  it("UF-09.7: no fill in the 3 s position, then the hold fills: 0% to 20% after 10 s", async () => {
    seedFocus(NOW, HOLD);
    await renderLoaded();
    expect(screenId()).toBe("UF-09.7");
    expect(root().getAttribute("data-wl-state")).toBe("lift");
    expect(root().classList.contains("wl-drain--deep")).toBe(true);
    expect(drain()).toBe("0%");
    await advance(2000);
    expect(drain()).toBe("0%");
    await advance(1000);
    expect(drain()).toBe("0%");
    await advance(10_000);
    expect(timerText()).toBe("0:40");
    expect(drain()).toBe("20%");
  });

  it("the fill is 100% at the end of a 40 s move and of the hold (the pure helper)", () => {
    const ctx = { plan: P1, library: [] };
    const warm = { ...initialFocusState(S1, P1, NOW), ...WARMUP };
    expect(fillPercent(warm, ctx, NOW + 10_000)).toBe(25);
    expect(fillPercent(warm, ctx, NOW + 40_000)).toBe(100);
    const hold = { ...initialFocusState(S1, P1, NOW), ...HOLD };
    expect(fillPercent(hold, ctx, NOW + 3000)).toBe(0);
    expect(fillPercent(hold, ctx, NOW + 53_000)).toBe(100);
    expect(fillPercent({ ...hold, phase: "rest" }, ctx, NOW)).toBeNull();
  });

  it("a view without the fill (UF-09.3) has no drain class and no --wl-drain", async () => {
    seedFocus(NOW, { phase: "set" });
    await renderLoaded();
    expect(screenId()).toBe("UF-09.3");
    expect(root().classList.contains("wl-drain")).toBe(false);
    expect(drain()).toBe("");
  });

  it("Restart sets the fill back down for one render (an instant jump), then clears the mark", async () => {
    seedFocus(NOW, WARMUP);
    await renderLoaded();
    await advance(10_000);
    expect(drain()).toBe("25%");
    expect(root().getAttribute("data-drain-reset")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Restart" }));
    await flushReal();
    await advance(1000);
    expect(drain()).toBe("2.5%");
    await advance(1000);
    expect(root().getAttribute("data-drain-reset")).toBeNull();
  });
});

describe("T-0596 AC2 and AC3 no ring, the state named in text", () => {
  it.each([
    ["UF-09.2", WARMUP, /^Warm-up · move 1 of \d+$/],
    ["UF-09.7", HOLD, /^Timed set · 1 of \d+$/],
  ])("%s: no ring, the caption is visible", async (id, seed, caption) => {
    seedFocus(NOW, seed);
    await renderLoaded();
    expect(screenId()).toBe(id);
    expect(document.querySelector(".wl-uf09__ring, [data-field='ring-fill']")).toBeNull();
    expect(document.querySelector("svg.wl-uf09__ring-svg")).toBeNull();
    expect(screen.getByText(caption)).toBeVisible();
  });
});

describe("T-0596 roles: hero number, countdown, session outline buttons", () => {
  it("UF-09.2: the time is the hero number; Restart and Next move are session outline", async () => {
    seedFocus(NOW, WARMUP);
    await renderLoaded();
    const time = screen.getByRole("timer");
    expect(time.classList.contains("wl-type-hero-number")).toBe(true);
    expect(time.textContent).toBe("0:40");
    for (const name of ["Restart", "Next move"]) {
      expect(
        screen.getByRole("button", { name }).classList.contains("wl-button--session-outline"),
      ).toBe(true);
    }
  });

  it("UF-09.7: a single digit is the countdown role, the hold is the hero number", async () => {
    seedFocus(NOW, HOLD);
    await renderLoaded();
    expect(screen.getByRole("timer").classList.contains("wl-type-countdown")).toBe(true);
    expect(screen.getByRole("timer").textContent).toBe("3");
    await advance(3000);
    expect(screen.getByRole("timer").classList.contains("wl-type-hero-number")).toBe(true);
    expect(screen.getByRole("timer").classList.contains("wl-type-countdown")).toBe(false);
    expect(
      screen
        .getByRole("button", { name: "Pause timer" })
        .classList.contains("wl-button--session-outline"),
    ).toBe(true);
  });
});

describe("T-0596 AC7 pausing the timer freezes the fill, resuming continues it", () => {
  it("UF-09.7", async () => {
    seedFocus(NOW, HOLD);
    await renderLoaded();
    await advance(13_000);
    expect(drain()).toBe("20%");
    fireEvent.click(screen.getByRole("button", { name: "Pause timer" }));
    await flushReal();
    const frozen = drain();
    await advance(5000);
    expect(drain()).toBe(frozen);
    expect(timerText()).toBe("0:40");
    fireEvent.click(screen.getByRole("button", { name: "Resume timer" }));
    await flushReal();
    await advance(5000);
    expect(drain()).toBe("30%");
    expect(timerText()).toBe("0:35");
  });
});

describe("T-0596 AC4 contrast of white on the two fill colours, from the tokens", () => {
  const tokens = JSON.parse(
    readFileSync(
      resolve(__dirname, "../../../../../../packages/design-tokens/src/tokens.json"),
      "utf8",
    ),
  ) as { color: { lift: Record<string, string> } };
  const lum = (hex: string) => {
    const ch = (i: number) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * ch(1) + 0.7152 * ch(3) + 0.0722 * ch(5);
  };
  const ratio = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi! + 0.05) / (lo! + 0.05);
  };

  it("white on lift.bg-deep is 6.1 or more, on lift.bg 4.8 or more", () => {
    const { ink, bg } = tokens.color.lift;
    expect(Number(ratio(ink!, tokens.color.lift["bg-deep"]!).toFixed(1))).toBeGreaterThanOrEqual(
      6.1,
    );
    expect(Number(ratio(ink!, bg!).toFixed(1))).toBeGreaterThanOrEqual(4.8);
  });
});
