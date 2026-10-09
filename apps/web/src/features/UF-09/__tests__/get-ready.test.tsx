// T-0304f AC-1 (UF-09.1 Get ready, parent AC-B1, D-0111 §4 §8): the 5 s wall-clock countdown,
// the first item, Start now and Skip warm-up, through the real host and store.
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET_READY_S } from "../machine.js";
import { P1, STARTED_AT_MS, USER_A, planWith } from "./fixtures.js";
import {
  advance,
  freshDb,
  screenId,
  seedSession,
  signIn,
  storedFocus,
  timerText,
  useFakeClock,
} from "./helpers.js";
import { renderSession } from "./session-helpers.js";
import { L2, defaultDetail } from "./set-loop-fixtures.js";
import { findScreen, setLineText } from "./set-loop-helpers.js";
import * as offline from "../../../lib/offline/index.js";
import { countOf, dispatched } from "./store-spy.js";
import { en } from "../../../lib/i18n/en.js";

vi.mock("../../../lib/offline/index.js", (orig) =>
  import("./set-loop-mock.js").then((m) => m.setLoopMock(orig)),
);
vi.mock("../store.js", (orig) => import("./store-spy.js").then((m) => m.storeSpy(orig)));

const NOW = STARTED_AT_MS + 60_000;
const NO_WARMUP = planWith({ warmup: [] });
const firstItem = () => document.querySelector('[data-field="first-item"]')?.textContent ?? null;

beforeEach(() => {
  window.localStorage.clear();
  dispatched.length = 0;
  vi.mocked(offline.loadLibrary).mockImplementation(async () => L2);
  vi.mocked(offline.loadExerciseDetail).mockImplementation(defaultDetail);
  freshDb();
  useFakeClock(NOW);
  signIn(USER_A);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function show(plan = P1) {
  await seedSession({ plan });
  await renderSession({ locale: "en-GB" });
  expect(screenId()).toBe("UF-09.1");
}

describe("AC-1 UF-09.1 with a warm-up (P1)", () => {
  it("'Get ready', a role=timer reading 5, 4, 3, 2, 1, and 'Warm-up' as the first item", async () => {
    await show();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^Get ready$/);
    expect(GET_READY_S).toBe(5);
    expect(timerText()).toBe("5");
    for (const left of ["4", "3", "2", "1"]) {
      await advance(1000);
      expect(screenId()).toBe("UF-09.1");
      expect(timerText()).toBe(left);
    }
    expect(firstItem()).toBe("Warm-up");
    expect(screen.getByRole("button", { name: "Skip warm-up" })).toBeInTheDocument();
  });

  it("at 5 s the host dispatches COUNTDOWN_END once: UF-09.2", async () => {
    await show();
    await advance(4999);
    expect(screenId()).toBe("UF-09.1");
    expect(countOf("COUNTDOWN_END")).toBe(0);
    await advance(1);
    expect(screenId()).toBe("UF-09.2");
    expect(countOf("COUNTDOWN_END")).toBe(1);
  });

  it("Start now dispatches COUNTDOWN_END at once: UF-09.2", async () => {
    await show();
    fireEvent.click(screen.getByRole("button", { name: "Start now" }));
    await findScreen("UF-09.2");
    expect(countOf("COUNTDOWN_END")).toBe(1);
    expect(storedFocus()).toMatchObject({ phase: "warmup", warmupIndex: 0 });
  });

  it("Skip warm-up dispatches SKIP_WARMUP: UF-09.3 for bench-press set 1", async () => {
    await show();
    fireEvent.click(screen.getByRole("button", { name: "Skip warm-up" }));
    await findScreen("UF-09.3");
    expect(countOf("SKIP_WARMUP")).toBe(1);
    expect(countOf("COUNTDOWN_END")).toBe(0);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Bench press");
    expect(setLineText()).toBe(en.uf09.liftingCaption(1, 4));
    expect(storedFocus()).toMatchObject({ phase: "set", itemIndex: 0, setIndex: 0 });
  });

  it("on mount, focus is on Start now", async () => {
    await show();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Start now" }));
  });
});

describe("AC-1 the pair: no warm-up", () => {
  it("the first item reads 'Bench press', and there is no Skip warm-up button", async () => {
    await show(NO_WARMUP);
    expect(firstItem()).toBe("Bench press");
    expect(screen.queryByRole("button", { name: "Skip warm-up" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start now" })).toBeInTheDocument();
  });

  it("at 5 s COUNTDOWN_END gives UF-09.3", async () => {
    await show(NO_WARMUP);
    await advance(4999);
    expect(screenId()).toBe("UF-09.1");
    await advance(1);
    expect(screenId()).toBe("UF-09.3");
    expect(countOf("COUNTDOWN_END")).toBe(1);
  });

  it("Start now gives UF-09.3 at once", async () => {
    await show(NO_WARMUP);
    fireEvent.click(screen.getByRole("button", { name: "Start now" }));
    await findScreen("UF-09.3");
    expect(countOf("COUNTDOWN_END")).toBe(1);
    expect(setLineText()).toBe(en.uf09.liftingCaption(1, 4));
  });

  it("a first exercise missing from the library reads its id (D-0118 §8)", async () => {
    vi.mocked(offline.loadLibrary).mockImplementation(async () =>
      L2.filter((e) => e.id !== "bench-press"),
    );
    await show(NO_WARMUP);
    expect(firstItem()).toBe("bench-press");
  });
});
