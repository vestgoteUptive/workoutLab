// T-0621 UF-09.4 / UF-09.6 / UF-09.1 (D-0212 §1.4): "Target hit.", "{name} done · n sets", the
// "Set-up time" label on the countdown, and "First up" with the first step.
import { cleanup, fireEvent, screen } from "@testing-library/react";
import type { SessionPlan } from "@workoutlab/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as offline from "../../../lib/offline/index.js";
import { en } from "../../../lib/i18n/en.js";
import { BENCH, P1, PLANK, ROW, STARTED_AT_MS, USER_A, planWith } from "./fixtures.js";
import { advance, freshDb, screenId, seedSession, signIn, useFakeClock } from "./helpers.js";
import { renderSession } from "./session-helpers.js";
import { L2, defaultDetail } from "./set-loop-fixtures.js";
import { findScreen, press, seedFocus } from "./set-loop-helpers.js";
import { loggedSets, seedRest } from "./countdown-helpers.js";
import { dispatched } from "./store-spy.js";

vi.mock("../../../lib/offline/index.js", (orig) =>
  import("./set-loop-mock.js").then((m) => m.setLoopMock(orig)),
);
vi.mock("../store.js", (orig) => import("./store-spy.js").then((m) => m.storeSpy(orig)));

const NOW = STARTED_AT_MS + 20 * 60_000;
const field = (name: string) => document.querySelector(`[data-field="${name}"]`);
const hit = () => screen.queryByText("Target hit.");

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
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** UF-09.4 for set `setIndex` of item 0 of `plan`, recorded with `reps`. */
async function confirm(plan: SessionPlan, reps: number, setIndex = 0) {
  await seedSession({ plan });
  const item = plan.items[0]!;
  seedFocus(
    NOW,
    {
      phase: "confirm",
      itemIndex: 0,
      setIndex,
      loggedSets: [...loggedSets(0, setIndex + 1, plan, { reps })],
    },
    plan,
  );
  void item;
  await renderSession({ locale: "en-GB" });
  await findScreen("UF-09.4");
}

describe("AC1 Target hit on UF-09.4", () => {
  it("repsMax 8: hidden at 7, shown at 8 and 9, and it follows the stepper", async () => {
    await confirm(planWith({ warmup: [], items: [BENCH, ROW] }), 7);
    expect(hit()).toBeNull();
    press("More reps");
    expect(hit()).toBeInTheDocument();
    press("More reps");
    expect(hit()).toBeInTheDocument();
    press("Fewer reps", 2);
    expect(hit()).toBeNull();
  });

  it("it is plain text: not a live region, button, link or focusable", async () => {
    await confirm(planWith({ warmup: [], items: [BENCH, ROW] }), 8);
    const el = hit()!;
    expect(el.closest("[aria-live], [role=status], [role=alert]")).toBeNull();
    expect(el.closest("button, a, [tabindex]")).toBeNull();
  });

  it("never on a back-off set", async () => {
    const plan = planWith({
      warmup: [],
      items: [{ ...BENCH, backoff: { weightKg: 70, reps: 6 } }, ROW],
    });
    await confirm(plan, 8, BENCH.sets);
    expect(screen.getByText(en.uf09.liftingBackoff)).toBeInTheDocument();
    expect(hit()).toBeNull();
  });

  it("never on a timed item", async () => {
    await confirm(planWith({ warmup: [], items: [{ ...PLANK, repsMin: 6, repsMax: 8 }, ROW] }), 9);
    expect(hit()).toBeNull();
  });

  it("never when repsMax is null", async () => {
    await confirm(planWith({ warmup: [], items: [{ ...BENCH, repsMax: null }, ROW] }), 12);
    expect(hit()).toBeNull();
  });
});

describe("AC2/AC3/AC5/AC6 UF-09.6", () => {
  it("fresh: after 4 sets of Bench press, 'Bench press done · 4 sets' with an aria-hidden tick", async () => {
    await seedSession();
    seedRest(NOW, { setIndex: 3 });
    await renderSession({ locale: "en-GB" });
    await advance(120_000);
    expect(screenId()).toBe("UF-09.6");
    const line = field("exercise-done")!;
    expect(line.textContent).toBe("Bench press done · 4 sets");
    expect(line.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(line.closest("button, a, [tabindex]")).toBeNull();
  });

  it("one logged set reads '· 1 set'", async () => {
    await seedSession();
    seedFocus(NOW, {
      phase: "next",
      itemIndex: 1,
      timer: { startedAtMs: NOW, durationS: 60, pausedMs: 0 },
      loggedSets: loggedSets(0, 1),
    });
    await renderSession({ locale: "en-GB" });
    expect(field("exercise-done")!.textContent).toBe("Bench press done · 1 set");
  });

  it("resumed from persisted sets after a reload, the line is computed from them", async () => {
    await seedSession();
    seedFocus(NOW, {
      phase: "next",
      itemIndex: 2,
      timer: { startedAtMs: NOW, durationS: 60, pausedMs: 0 },
      loggedSets: [...loggedSets(0, 4), ...loggedSets(1, 3, P1)],
    });
    await renderSession({ locale: "en-GB" });
    expect(field("exercise-done")!.textContent).toBe("Barbell row done · 3 sets");
  });

  it("no line after UF-09.1 / the warm-up (item 0)", async () => {
    await seedSession();
    seedFocus(NOW, {
      phase: "next",
      itemIndex: 0,
      timer: { startedAtMs: NOW, durationS: 60, pausedMs: 0 },
    });
    await renderSession({ locale: "en-GB" });
    expect(screenId()).toBe("UF-09.6");
    expect(field("exercise-done")).toBeNull();
  });

  it("no line after a skipped item with 0 sets", async () => {
    await seedSession();
    seedFocus(NOW, {
      phase: "next",
      itemIndex: 1,
      skippedItems: [0],
      timer: { startedAtMs: NOW, durationS: 60, pausedMs: 0 },
    });
    await renderSession({ locale: "en-GB" });
    expect(screenId()).toBe("UF-09.6");
    expect(field("exercise-done")).toBeNull();
  });

  it("the countdown is found as the 'Set-up time' timer and the label is visible", async () => {
    await seedSession();
    seedFocus(NOW, {
      phase: "next",
      itemIndex: 1,
      timer: { startedAtMs: NOW, durationS: 60, pausedMs: 0 },
      loggedSets: loggedSets(0, 4),
    });
    await renderSession({ locale: "en-GB" });
    expect(screen.getByRole("timer", { name: "Set-up time" })).toHaveTextContent("1:00");
    expect(screen.getByText("Set-up time")).toBeVisible();
    expect(screen.getByText("Set-up time").closest("button, a, [tabindex]")).toBeNull();
  });
});

describe("AC4 First up on UF-09.1", () => {
  it("with a 3-move warm-up at 40 s: 'First up', 'Warm-up', '3 moves · 40 s each'", async () => {
    const plan = planWith({ warmup: P1.warmup.slice(0, 3) });
    await seedSession({ plan });
    await renderSession({ locale: "en-GB" });
    expect(screenId()).toBe("UF-09.1");
    expect(field("first-up")!.textContent).toBe("First up");
    expect(field("first-item")!.textContent).toBe("Warm-up");
    expect(field("first-summary")!.textContent).toBe("3 moves · 40 s each");
  });

  it("one move reads '1 move'", () => {
    expect(en.uf09.warmupSummary(1, 40)).toBe("1 move · 40 s each");
  });

  it("without a warm-up: the first exercise's name and its summary", async () => {
    await seedSession({ plan: planWith({ warmup: [] }) });
    await renderSession({ locale: "en-GB" });
    expect(field("first-up")!.textContent).toBe("First up");
    expect(field("first-item")!.textContent).toBe("Bench press");
    expect(field("first-summary")!.textContent).toBe("4 × 6–8");
    fireEvent.click(screen.getByRole("button", { name: "Start now" }));
  });
});
