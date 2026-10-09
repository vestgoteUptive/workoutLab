// T-0304b AC-7 (ask for a null weight, bodyweight, D-0066 §4, D-0118 §2 §6), AC-8 (in-session
// pre-fill and the back-off set, D-0066 §6, D-0118 §7) and AC-9 (no rest after the last set,
// parent AC-B8), through the real views, the real hook and the real queue.
import { act, fireEvent, screen } from "@testing-library/react";
import type { SessionPlan } from "@workoutlab/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as offline from "../../../lib/offline/index.js";
import type { LoggedSet } from "../machine.js";
import { BENCH, CURL, P1, ROW, S1, STARTED_AT_MS, USER_A, planWith } from "./fixtures.js";
import {
  advance,
  flushReal,
  freshDb,
  screenId,
  seedSession,
  signIn,
  useFakeClock,
} from "./helpers.js";
import { deferred, renderSession } from "./session-helpers.js";
import { L2, NBSP, PU, defaultDetail, planOf } from "./set-loop-fixtures.js";
import {
  autosaveText,
  doneButton,
  doneSet,
  findPath,
  findScreen,
  loadText,
  press,
  seedFocus,
  setLineText,
  storedState,
  typeWeight,
  weightInput,
} from "./set-loop-helpers.js";
import { dispatched, stores } from "./store-spy.js";
import { en } from "../../../lib/i18n/en.js";

vi.mock("../../../lib/offline/index.js", (orig) =>
  import("./set-loop-mock.js").then((m) => m.setLoopMock(orig)),
);
vi.mock("../store.js", (orig) => import("./store-spy.js").then((m) => m.storeSpy(orig)));

const NOW = STARTED_AT_MS + 10 * 60_000;
const recordSpy = vi.mocked(offline.recordSet);
const editSpy = vi.mocked(offline.editSet);
const libSpy = vi.mocked(offline.loadLibrary);
const detailSpy = vi.mocked(offline.loadExerciseDetail);

beforeEach(async () => {
  window.localStorage.clear();
  dispatched.length = 0;
  stores.length = 0;
  for (const spy of [recordSpy, editSpy, libSpy, detailSpy]) spy.mockReset();
  libSpy.mockImplementation(async () => L2);
  detailSpy.mockImplementation(defaultDetail);
  freshDb();
  useFakeClock(NOW);
  signIn(USER_A);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function showSet(plan: SessionPlan, patch: Parameters<typeof seedFocus>[1] = {}) {
  await seedSession({ plan });
  seedFocus(NOW, { phase: "set", ...patch }, plan);
  await renderSession({ locale: "en-GB" });
  expect(screenId()).toBe("UF-09.3");
}

const stepText = () => document.querySelector(".wl-uf09__view")?.textContent ?? "";

function logged(itemIndex: number, setIndex: number, plan: SessionPlan = P1): LoggedSet {
  return {
    clientId: `seed-${itemIndex}-${setIndex}`,
    itemIndex,
    setIndex,
    exerciseId: plan.items[itemIndex]!.exerciseId,
    reps: 6,
    weightKg: 80,
    durationS: null,
    rir: null,
    backoff: false,
  };
}

describe("AC-7 a null weight means ask", () => {
  it("leg-curl set 1: 'Set weight' and '10 reps', no kg; Done records weightKg null", async () => {
    await showSet(P1, { itemIndex: 2 });
    expect(screen.getByText("Set weight")).toBeInTheDocument();
    expect(screen.getByText("10 reps")).toBeInTheDocument();
    expect(stepText()).not.toMatch(/kg/);
    await doneSet();
    expect(recordSpy.mock.calls[0]![0]).toMatchObject({
      exerciseId: "leg-curl",
      weightKg: null,
      reps: 10,
    });
  });

  it("leg-curl UF-09.4: empty field, no 'Saving as planned', timer null, still UF-09.4 after 60 s", async () => {
    await showSet(P1, { itemIndex: 2 });
    await doneSet();
    expect(weightInput().value).toBe("");
    expect(document.body.textContent).not.toMatch(/Saving as planned/);
    expect(autosaveText()).toBe("Tap save when ready.");
    expect(storedState().timer).toBeNull();
    await advance(60_000);
    expect(screenId()).toBe("UF-09.4");
  });

  it("leg-curl Save with the field empty: no editSet, moves on", async () => {
    await showSet(P1, { itemIndex: 2 });
    await doneSet();
    press("Save");
    await findScreen("UF-09.5");
    expect(editSpy).not.toHaveBeenCalled();
  });

  it("leg-curl typing '40' then Save: editSet with weightKg 40", async () => {
    await showSet(P1, { itemIndex: 2 });
    await doneSet();
    typeWeight("40");
    press("Save");
    await findScreen("UF-09.5");
    expect(editSpy).toHaveBeenCalledTimes(1);
    expect(editSpy.mock.calls[0]![1]).toEqual({ reps: 10, weightKg: 40, rir: null });
  });

  it("the pair: bench-press (weight 80) gets the auto-save", async () => {
    await showSet(P1);
    await doneSet();
    expect(storedState().timer).not.toBeNull();
    expect(autosaveText()).toMatch(/^Saving as planned in 5 s/);
    await advance(5_000);
    expect(screenId()).toBe("UF-09.5");
  });
});

describe("AC-7 bodyweight PU", () => {
  const PLAN = planOf([PU, BENCH]);

  it("UF-09.3 shows '12 reps' and no weight line; Done records weightKg 0", async () => {
    await showSet(PLAN);
    expect(loadText()).toBe("12 reps");
    expect(stepText()).not.toMatch(/kg|Set weight/);
    await doneSet();
    expect(recordSpy.mock.calls[0]![0]).toMatchObject({
      exerciseId: "push-up",
      weightKg: 0,
      reps: 12,
    });
  });

  it("UF-09.4 has no weight input and no weight steppers (4 buttons); the auto-save runs", async () => {
    await showSet(PLAN);
    await doneSet();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More weight" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Less weight" })).not.toBeInTheDocument();
    const host = document.querySelector("[data-screen-id]") as HTMLElement;
    const names = Array.from(host.querySelectorAll("button")).map(
      (b) => b.getAttribute("aria-label") ?? b.textContent,
    );
    expect(names).toEqual(["Pause workout", "Fewer reps", "More reps", "Save"]);
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(storedState().timer).not.toBeNull();
    await advance(5_000);
    expect(screenId()).toBe("UF-09.5");
  });

  it("PU Save with more reps keeps weightKg 0", async () => {
    await showSet(PLAN);
    await doneSet();
    press("More reps");
    press("Save");
    await findScreen("UF-09.5");
    expect(editSpy.mock.calls[0]![1]).toEqual({ reps: 13, weightKg: 0, rir: null });
  });

  it("the pair: a loaded lift's confirm has exactly 6 buttons plus 3 radios", async () => {
    await showSet(P1);
    await doneSet();
    const host = document.querySelector("[data-screen-id]") as HTMLElement;
    expect(host.querySelectorAll("button")).toHaveLength(6);
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });
});

describe("AC-8 in-session pre-fill", () => {
  it("carry: set 1 saved 77.5 × 5 → after the rest, 'Set 2 of 4' and '77.5 kg × 5'; Done records them", async () => {
    await showSet(P1);
    await doneSet();
    press("Fewer reps");
    typeWeight("77.5");
    press("Save");
    await findScreen("UF-09.5");
    await advance(120_000);
    expect(screenId()).toBe("UF-09.3");
    expect(setLineText()).toBe(en.uf09.liftingCaption(2, 4));
    expect(loadText()).toBe(`77.5${NBSP}kg × 5`);
    fireEvent.click(doneButton());
    await findScreen("UF-09.4");
    expect(recordSpy.mock.calls[1]![0]).toMatchObject({ setIndex: 1, reps: 5, weightKg: 77.5 });
  });

  it("per-field fallback: set 1 saved weight null, reps 5 → set 2 shows '80 kg × 5'", async () => {
    await showSet(P1);
    await doneSet();
    press("Fewer reps");
    typeWeight("");
    press("Save");
    await findScreen("UF-09.5");
    expect(storedState().loggedSets[0]).toMatchObject({ reps: 5, weightKg: null });
    await advance(120_000);
    expect(setLineText()).toBe(en.uf09.liftingCaption(2, 4));
    expect(loadText()).toBe(`80${NBSP}kg × 5`);
  });

  const WITH_BACKOFF = planWith({ items: [{ ...BENCH, backoff: { weightKg: 70, reps: 6 } }, ROW] });

  it("back-off: after set 4 the screen shows the back-off caption and '70 kg × 6'; Done records setIndex 4, backoff true", async () => {
    await showSet(WITH_BACKOFF, {
      setIndex: 3,
      loggedSets: [0, 1, 2].map((i) => logged(0, i, WITH_BACKOFF)),
    });
    expect(setLineText()).toBe(en.uf09.liftingCaption(4, 4));
    await doneSet();
    await advance(5_000);
    expect(screenId()).toBe("UF-09.5");
    await advance(120_000);
    expect(screenId()).toBe("UF-09.3");
    expect(setLineText()).toBe(en.uf09.liftingBackoff);
    expect(loadText()).toBe(`70${NBSP}kg × 6`);
    fireEvent.click(doneButton());
    await findScreen("UF-09.4");
    expect(recordSpy.mock.calls[1]![0]).toMatchObject({
      exerciseId: "bench-press",
      setIndex: 4,
      backoff: true,
      reps: 6,
      weightKg: 70,
    });
  });

  it("the pair: with backoff null, set 4 is the item's last (the rest leads to UF-09.6)", async () => {
    const plan = planWith({ items: [BENCH, ROW] });
    await showSet(plan, { setIndex: 3, loggedSets: [0, 1, 2].map((i) => logged(0, i, plan)) });
    await doneSet();
    await advance(5_000);
    expect(screenId()).toBe("UF-09.5");
    await advance(120_000);
    expect(screenId()).toBe("UF-09.6");
    expect(screen.queryByText(en.uf09.liftingBackoff)).not.toBeInTheDocument();
  });
});

describe("AC-9 no rest after the last set", () => {
  /** Every screen id that ever appears, in order. */
  function recordScreens(): { ids: string[]; stop: () => void } {
    const ids: string[] = [];
    const note = () => {
      for (const el of document.querySelectorAll("[data-screen-id]")) {
        const id = el.getAttribute("data-screen-id")!;
        if (ids[ids.length - 1] !== id) ids.push(id);
      }
    };
    const observer = new MutationObserver(note);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true });
    note();
    return { ids, stop: () => observer.disconnect() };
  }

  it("P1 without the plank: saving leg-curl set 3 → done → finish(), /session/S1/summary, no UF-09.5", async () => {
    const plan = planWith({ items: [BENCH, ROW, CURL] });
    await showSet(plan, {
      itemIndex: 2,
      setIndex: 2,
      loggedSets: [
        ...[0, 1, 2, 3].map((i) => logged(0, i, plan)),
        ...[0, 1, 2].map((i) => logged(1, i, plan)),
        ...[0, 1].map((i) => logged(2, i, plan)),
      ],
    });
    const seen = recordScreens();
    await doneSet();
    press("Save");
    await findPath(`/session/${S1}/summary`);
    seen.stop();
    expect(seen.ids).toContain("UF-09.4");
    expect(seen.ids).not.toContain("UF-09.5");
    expect(dispatched.filter((e) => e.type === "SAVED")).toHaveLength(1);
  });

  it("the pair: saving bench-press set 4 → UF-09.5", async () => {
    await showSet(P1, { setIndex: 3, loggedSets: [0, 1, 2].map((i) => logged(0, i)) });
    await doneSet();
    press("Save");
    await findScreen("UF-09.5");
    expect(storedState()).toMatchObject({ phase: "rest", setIndex: 3 });
  });
});

// T-0304b rework (QA): Done set → Pause while recordSet is pending must not let the same set be
// written twice (NFR-SYNC-1, D-0118 §5).
describe("a Done set write that lands while paused", () => {
  type Queued = Awaited<ReturnType<typeof offline.recordSet>>;
  const benchInput = {
    sessionId: S1,
    itemIndex: 0,
    exerciseId: "bench-press",
    setIndex: 0,
    kind: "reps" as const,
    reps: 6,
    weightKg: 80,
    isWarmup: false,
    backoff: false,
  };

  async function rowsAt0(): Promise<number> {
    const rows = await offline.offlineDb().sets.toArray();
    return rows.filter((r) => r.sessionId === S1 && r.setIndex === 0).length;
  }

  it("Done set → Pause → the write resolves → Resume: one entry, one row, the screen moved on", async () => {
    await showSet(P1);
    const held = deferred<Queued>();
    recordSpy.mockImplementationOnce(() => held.promise);
    fireEvent.click(doneButton());
    press("Pause workout");
    await flushReal();
    expect(screenId()).toBe("UF-09.9");
    const real = await vi.importActual<typeof offline>("../../../lib/offline/index.js");
    await act(async () => {
      held.resolve(await real.recordSet(benchInput));
    });
    await flushReal();
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    await flushReal();
    expect(screenId()).toBe("UF-09.4");
    expect(storedState().loggedSets).toHaveLength(1);
    expect(await rowsAt0()).toBe(1);
    // The auto-save runs from Resume, and the walk goes on to the rest.
    await advance(5_000);
    expect(screenId()).toBe("UF-09.5");
    expect(storedState().loggedSets).toHaveLength(1);
    expect(recordSpy).toHaveBeenCalledTimes(1);
  });

  it("Done set → Pause → Resume with the write still pending → Done set again: one write", async () => {
    await showSet(P1);
    const held = deferred<Queued>();
    recordSpy.mockImplementationOnce(() => held.promise);
    fireEvent.click(doneButton());
    press("Pause workout");
    await flushReal();
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    await flushReal();
    expect(screenId()).toBe("UF-09.3");
    fireEvent.click(doneButton());
    await flushReal();
    expect(recordSpy).toHaveBeenCalledTimes(1);
    const real = await vi.importActual<typeof offline>("../../../lib/offline/index.js");
    await act(async () => {
      held.resolve(await real.recordSet(benchInput));
    });
    await findScreen("UF-09.4");
    expect(storedState().loggedSets).toHaveLength(1);
    expect(await rowsAt0()).toBe(1);
  });

  it("the pair: Pause with no pending write, then Resume, stays on the same set", async () => {
    await showSet(P1);
    press("Pause workout");
    await flushReal();
    expect(screenId()).toBe("UF-09.9");
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    await flushReal();
    expect(screenId()).toBe("UF-09.3");
    expect(setLineText()).toBe(en.uf09.liftingCaption(1, 4));
    expect(storedState().loggedSets).toHaveLength(0);
    expect(recordSpy).not.toHaveBeenCalled();
  });
});
