// T-0619 (D-0212 §1.2): the state captions on UF-09.2, .3, .4 and .6. The caption is the first
// line of the view, above the h1, and is neither a heading nor a live region (AC6).
import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { en } from "../../../lib/i18n/en.js";
import * as offline from "../../../lib/offline/index.js";
import { BENCH, P1, ROW, STARTED_AT_MS, USER_A, planWith } from "./fixtures.js";
import { freshDb, screenId, seedSession, signIn, useFakeClock } from "./helpers.js";
import { renderSession } from "./session-helpers.js";
import { L2, defaultDetail } from "./set-loop-fixtures.js";
import { findScreen, seedFocus } from "./set-loop-helpers.js";
import { dispatched, stores } from "./store-spy.js";

vi.mock("../../../lib/offline/index.js", (orig) =>
  import("./set-loop-mock.js").then((m) => m.setLoopMock(orig)),
);
vi.mock("../store.js", (orig) => import("./store-spy.js").then((m) => m.storeSpy(orig)));

const NOW = STARTED_AT_MS + 10 * 60_000;

beforeEach(() => {
  window.localStorage.clear();
  dispatched.length = 0;
  stores.length = 0;
  vi.mocked(offline.loadLibrary).mockImplementation(async () => L2);
  vi.mocked(offline.loadExerciseDetail).mockImplementation(defaultDetail);
  freshDb();
  useFakeClock(NOW);
  signIn(USER_A);
});

afterEach(() => {
  vi.useRealTimers();
});

const caption = () => document.querySelector(".wl-uf09__state") as HTMLElement;

/** The caption is the view's first element, directly above the h1, and is not announced. */
function expectCaption(text: string, h1: string): void {
  const view = document.querySelector(".wl-uf09__view")!;
  expect(view.firstElementChild).toBe(caption());
  expect(caption().textContent).toBe(text);
  expect(caption().nextElementSibling).toBe(screen.getByRole("heading", { level: 1 }));
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(h1);
  expect(screen.getAllByRole("heading").map((h) => h.textContent)).toEqual([h1]);
  expect(caption().closest("h1,h2,[aria-live],[role=status],[role=alert],[role=timer]")).toBeNull();
  expect(document.querySelectorAll(".wl-uf09__state")).toHaveLength(1);
}

const BACKOFF = planWith({ items: [{ ...BENCH, backoff: { weightKg: 70, reps: 6 } }, ROW] });

async function show(id: string, plan = P1, patch: Parameters<typeof seedFocus>[1] = {}) {
  await seedSession({ plan });
  seedFocus(NOW, patch, plan);
  await renderSession({ locale: "en-GB" });
  await findScreen(id);
}

describe("T-0619 AC1 UF-09.3", () => {
  it("set 2 of 4: 'Lifting · set 2 of 4' above the exercise name", async () => {
    await show("UF-09.3", P1, { phase: "set", setIndex: 1 });
    expectCaption(en.uf09.liftingCaption(2, 4), "Bench press");
    expect(caption().textContent).toBe("Lifting · set 2 of 4");
  });

  it("a back-off set: 'Lifting · back-off set'", async () => {
    await show("UF-09.3", BACKOFF, { phase: "set", setIndex: 4 });
    expectCaption(en.uf09.liftingBackoff, "Bench press");
    expect(caption().textContent).toBe("Lifting · back-off set");
  });
});

describe("T-0619 AC2 UF-09.4", () => {
  it("set 2 of 4: the same caption above the h1", async () => {
    await show("UF-09.4", P1, { phase: "confirm", setIndex: 1 });
    expectCaption(en.uf09.liftingCaption(2, 4), "Bench press");
  });

  it("a back-off set: 'Lifting · back-off set'", async () => {
    await show("UF-09.4", BACKOFF, { phase: "confirm", setIndex: 4 });
    expectCaption(en.uf09.liftingBackoff, "Bench press");
  });
});

describe("T-0619 AC3 UF-09.2", () => {
  it("move 1 of 4: 'Warm-up · move 1 of 4'; 'Move 1 of 4' no longer renders", async () => {
    await show("UF-09.2", P1, {
      phase: "warmup",
      warmupIndex: 0,
      timer: { startedAtMs: NOW, durationS: 40, pausedMs: 0 },
    });
    expect(caption().textContent).toBe(en.uf09.warmupCaption(1, 4));
    expect(caption().nextElementSibling).toBe(screen.getByRole("heading", { level: 1 }));
    expect(screen.queryByText("Move 1 of 4")).toBeNull();
    expect(caption().closest("[aria-live],[role=status],[role=timer]")).toBeNull();
    expect(screen.getAllByRole("heading")).toHaveLength(1);
  });
});

describe("T-0619 AC4 UF-09.6", () => {
  it("'Next exercise' above the exercise name", async () => {
    await show("UF-09.6", P1, {
      phase: "next",
      itemIndex: 1,
      timer: { startedAtMs: NOW, durationS: 60, pausedMs: 0 },
    });
    expect(screenId()).toBe("UF-09.6");
    expectCaption(en.uf09.titles.next, "Barbell row");
  });
});
