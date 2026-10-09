// T-0304f AC-4 (UF-09.6 Next exercise, D-0066 §10, D-0118 §8 §11): reached after the last
// bench-press set and its rest through the default check point; the name, `itemSummary` and
// `formatKg` as siblings, the cue, "I'm ready", the 60 s set-up countdown and the seam order.
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as offline from "../../../lib/offline/index.js";
import type { ExerciseDetail } from "../../../lib/offline/index.js";
import { NEXT_SETUP_S } from "../machine.js";
import type { SeamAction } from "../seams.js";
import { STARTED_AT_MS, USER_A } from "./fixtures.js";
import {
  advance,
  flushReal,
  freshDb,
  screenId,
  seedSession,
  signIn,
  storedFocus,
  timerText,
  useFakeClock,
} from "./helpers.js";
import { renderSession } from "./session-helpers.js";
import { L2, NBSP, defaultDetail } from "./set-loop-fixtures.js";
import { findCue, findScreen, seedFocus, setLineText } from "./set-loop-helpers.js";
import { seedRest } from "./countdown-helpers.js";
import { countOf, dispatched } from "./store-spy.js";
import { en } from "../../../lib/i18n/en.js";

vi.mock("../../../lib/offline/index.js", (orig) =>
  import("./set-loop-mock.js").then((m) => m.setLoopMock(orig)),
);
vi.mock("../store.js", (orig) => import("./store-spy.js").then((m) => m.storeSpy(orig)));

const NOW = STARTED_AT_MS + 20 * 60_000;
const ROW_CUE = "Pull to the hip";
const detailSpy = vi.mocked(offline.loadExerciseDetail);

function withRowCue(id: string): Promise<ExerciseDetail | null> {
  if (id !== "barbell-row") return defaultDetail(id);
  return defaultDetail("bench-press").then((d) => ({ ...d!, id, cue: ROW_CUE }));
}

const swap: SeamAction = {
  id: "swap",
  label: "Swap",
  render: () => null,
  keepsClockRunning: false,
};

beforeEach(async () => {
  window.localStorage.clear();
  dispatched.length = 0;
  vi.mocked(offline.loadLibrary).mockImplementation(async () => L2);
  detailSpy.mockImplementation(withRowCue);
  freshDb();
  useFakeClock(NOW);
  signIn(USER_A);
  await seedSession();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** After the last bench-press set: its rest runs out, and the default check point gives next. */
async function afterBench(props: Parameters<typeof renderSession>[0] = {}) {
  seedRest(NOW, { setIndex: 3 });
  await renderSession({ locale: "en-GB", ...props });
  await advance(120_000);
  expect(screenId()).toBe("UF-09.6");
  expect(storedFocus()).toMatchObject({ phase: "next", itemIndex: 1 });
}

const field = (name: string) => document.querySelector(`[data-field="${name}"]`);
const buttonNames = () =>
  screen.getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? b.textContent);

describe("AC-4 content", () => {
  it("'Barbell row', '3 × 8–12' with a sibling '60 kg', the cue, I'm ready and a 1:00 timer", async () => {
    await afterBench();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^Barbell row$/);
    const summary = field("summary")!;
    const kg = field("kg")!;
    expect(summary.textContent).toBe("3 × 8–12");
    expect(kg.textContent).toBe(`60${NBSP}kg`);
    // Siblings, each whole, with an aria-hidden "·" between them (D-0118 §11).
    expect(summary.parentElement).toBe(kg.parentElement);
    const sep = summary.nextElementSibling!;
    expect(sep).toHaveAttribute("aria-hidden", "true");
    expect(sep.textContent).toBe("·");
    expect(sep.nextElementSibling).toBe(kg);
    expect((await findCue()).textContent).toBe(ROW_CUE);
    expect(screen.getByRole("button", { name: "I'm ready" })).toBeInTheDocument();
    expect(NEXT_SETUP_S).toBe(60);
    expect(timerText()).toBe("1:00");
  });

  it("the pair, no cue: a detail without one renders no cue element", async () => {
    detailSpy.mockImplementation(defaultDetail);
    await afterBench();
    await flushReal(50);
    expect(field("cue")).toBeNull();
    expect(detailSpy).toHaveBeenCalledWith("barbell-row");
  });

  it("a rejected detail read renders no cue and leaves no unhandled rejection", async () => {
    detailSpy.mockImplementation(async () => {
      throw new Error("IDB closed");
    });
    await afterBench();
    await flushReal(50);
    expect(field("cue")).toBeNull();
    expect(screenId()).toBe("UF-09.6");
  });

  it("the pair, a null weight: leg-curl has no kg element and no separator", async () => {
    seedFocus(NOW, {
      phase: "next",
      itemIndex: 2,
      timer: { startedAtMs: NOW, durationS: 60, pausedMs: 0 },
    });
    await renderSession({ locale: "en-GB" });
    expect(screenId()).toBe("UF-09.6");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^Leg curl$/);
    expect(field("summary")!.textContent).toBe("3 × 10–15");
    expect(field("kg")).toBeNull();
    expect(field("detail")!.textContent).not.toMatch(/kg|·/);
  });
});

describe("AC-4 countdown", () => {
  it("at 60 s it dispatches READY once: UF-09.3, barbell-row set 1", async () => {
    await afterBench();
    await advance(59_000);
    expect(screenId()).toBe("UF-09.6");
    expect(timerText()).toBe("0:01");
    expect(countOf("READY")).toBe(0);
    await advance(1000);
    expect(screenId()).toBe("UF-09.3");
    expect(countOf("READY")).toBe(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Barbell row");
    expect(setLineText()).toBe(en.uf09.liftingCaption(1, 3));
  });

  it("I'm ready does that at once", async () => {
    await afterBench();
    fireEvent.click(screen.getByRole("button", { name: "I'm ready" }));
    await findScreen("UF-09.3");
    expect(countOf("READY")).toBe(1);
    expect(storedFocus()).toMatchObject({ phase: "set", itemIndex: 1, setIndex: 0 });
  });

  it("focus lands on I'm ready", async () => {
    await afterBench();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "I'm ready" }));
  });
});

describe("AC-4 seams (T-0304e orderActions)", () => {
  it("with an injected swap entry the actions read I'm ready · Swap", async () => {
    await afterBench({ seams: { next: [swap] } });
    expect(buttonNames()).toEqual(["Pause workout", "I'm ready", "Swap"]);
  });

  // D-0142 §6 (a named change, T-0422): the module's swap seam follows I'm ready.
  it("the pair: with the module arrays I'm ready and the module's Swap are there", async () => {
    await afterBench();
    expect(buttonNames()).toEqual(["Pause workout", "I'm ready", "Swap"]);
    expect(
      Array.from(document.querySelectorAll("[data-seam-id]")).map((b) =>
        b.getAttribute("data-seam-id"),
      ),
    ).toEqual(["swap"]);
  });
});
