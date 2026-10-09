// T-0304b AC-1 (UF-09.3 renders the pre-fill, principle 3, D-0118 §8 §9), AC-2 (Done set feedback
// < 100 ms, NFR-PERF-4) and AC-3 (the write before moving on, NFR-OFF-2, NFR-SYNC-1, D-0118 §5).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, fireEvent, screen } from "@testing-library/react";
import Dexie from "dexie";
import type { SessionPlan } from "@workoutlab/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as offline from "../../../lib/offline/index.js";
import { BENCH, P1, S1, STARTED_AT_MS, USER_A, planWith } from "./fixtures.js";
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
import { BENCH_CUE, L2, NBSP, defaultDetail } from "./set-loop-fixtures.js";
import {
  doneButton,
  findCue,
  findScreen,
  loadText,
  seedFocus,
  setLineText,
  storedState,
} from "./set-loop-helpers.js";
import { dispatched, lastStore, stores } from "./store-spy.js";
import { en } from "../../../lib/i18n/en.js";

vi.mock("../../../lib/offline/index.js", (orig) =>
  import("./set-loop-mock.js").then((m) => m.setLoopMock(orig)),
);
vi.mock("../store.js", (orig) => import("./store-spy.js").then((m) => m.storeSpy(orig)));

const NOW = STARTED_AT_MS + 10 * 60_000;
const recordSpy = vi.mocked(offline.recordSet);
const libSpy = vi.mocked(offline.loadLibrary);
const detailSpy = vi.mocked(offline.loadExerciseDetail);

let unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => unhandled.push(reason);
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  window.localStorage.clear();
  dispatched.length = 0;
  stores.length = 0;
  for (const spy of [recordSpy, libSpy, detailSpy]) spy.mockReset();
  libSpy.mockImplementation(async () => L2);
  detailSpy.mockImplementation(defaultDetail);
  unhandled = [];
  process.on("unhandledRejection", onUnhandled);
  consoleError = vi.spyOn(console, "error");
  freshDb();
  useFakeClock(NOW);
  signIn(USER_A);
});

afterEach(() => {
  process.off("unhandledRejection", onUnhandled);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function showSet(plan: SessionPlan = P1, itemIndex = 0, locale = "en-GB") {
  await seedSession({ plan });
  seedFocus(NOW, { phase: "set", itemIndex }, plan);
  await renderSession({ locale });
  expect(screenId()).toBe("UF-09.3");
}

const benchCall = {
  sessionId: S1,
  itemIndex: 0,
  exerciseId: "bench-press",
  setIndex: 0,
  kind: "reps",
  reps: 6,
  weightKg: 80,
  isWarmup: false,
  backoff: false,
};

describe("AC-1 UF-09.3 renders the pre-fill", () => {
  it("P1 bench-press set 1: heading, 'Set 1 of 4', '80 kg × 6', the cue", async () => {
    await showSet();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^Bench press$/);
    expect(setLineText()).toBe(en.uf09.liftingCaption(1, 4));
    expect(loadText()).toBe(`80${NBSP}kg × 6`);
    expect(await findCue()).toHaveTextContent(new RegExp(`^${BENCH_CUE}$`));
  });

  it("the pair, no cue: leg-curl (detail null) has no cue element", async () => {
    await showSet(P1, 2);
    await flushReal();
    expect(detailSpy).toHaveBeenCalledWith("leg-curl");
    expect(document.querySelector('[data-field="cue"]')).toBeNull();
  });

  it("the pair, no library entry: the heading is the id and the load line is unchanged", async () => {
    libSpy.mockImplementation(async () => L2.filter((e) => e.id !== "bench-press"));
    await showSet();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^bench-press$/);
    expect(loadText()).toBe(`80${NBSP}kg × 6`);
  });

  it("locale pair: prefill 77.5 with sv-SE reads '77,5 kg × 6'; en-GB reads '77.5 kg × 6'", async () => {
    const plan = planWith({ items: [{ ...BENCH, prefill: { ...BENCH.prefill, weightKg: 77.5 } }] });
    await showSet(plan, 0, "sv-SE");
    expect(loadText()).toBe(`77,5${NBSP}kg × 6`);
  });

  it("locale pair, en-GB: '77.5 kg × 6'", async () => {
    const plan = planWith({ items: [{ ...BENCH, prefill: { ...BENCH.prefill, weightKg: 77.5 } }] });
    await showSet(plan, 0, "en-GB");
    expect(loadText()).toBe(`77.5${NBSP}kg × 6`);
  });

  it.each(["reentry", "hold_after_break"] as const)(
    "a %s pre-fill renders its values with no 'last time' text",
    async (kind) => {
      const plan = planWith({
        items: [{ ...BENCH, prefill: { weightKg: 70, reps: 6, durationS: null, kind } }],
      });
      await showSet(plan);
      expect(loadText()).toBe(`70${NBSP}kg × 6`);
      expect(document.body.textContent).not.toMatch(/last time|break|welcome back/i);
    },
  );

  it("Done set is the view's primary button, its class sets min-height: 200px", async () => {
    await showSet();
    const done = doneButton();
    expect(done.tagName).toBe("BUTTON");
    expect(done).toHaveAttribute("data-action", "primary");
    expect(done).toHaveClass("wl-uf09__done");
    const css = readFileSync(resolve(__dirname, "../uf-09.css"), "utf8");
    const rule = /\.wl-uf09__done\s*\{([^}]*)\}/.exec(css);
    expect(rule?.[1]).toMatch(/min-height:\s*200px;/);
  });

  it("focus: from a rest end, Done set is document.activeElement", async () => {
    await seedSession();
    seedFocus(NOW, { phase: "rest", timer: { startedAtMs: NOW, durationS: 120, pausedMs: 0 } });
    await renderSession({ locale: "en-GB" });
    expect(screenId()).toBe("UF-09.5");
    await advance(120_000);
    expect(screenId()).toBe("UF-09.3");
    expect(document.activeElement).toBe(doneButton());
  });

  it("focus: from READY (UF-09.6 expiry), Done set is document.activeElement", async () => {
    await seedSession();
    seedFocus(NOW, {
      phase: "next",
      itemIndex: 1,
      timer: { startedAtMs: NOW, durationS: 60, pausedMs: 0 },
    });
    await renderSession({ locale: "en-GB" });
    expect(screenId()).toBe("UF-09.6");
    await advance(60_000);
    expect(screenId()).toBe("UF-09.3");
    expect(document.activeElement).toBe(doneButton());
  });

  it("focus: from SKIP_WARMUP, Done set is document.activeElement", async () => {
    await seedSession();
    seedFocus(NOW, { phase: "getReady", timer: { startedAtMs: NOW, durationS: 5, pausedMs: 0 } });
    await renderSession({ locale: "en-GB" });
    expect(screenId()).toBe("UF-09.1");
    act(() => lastStore().dispatch({ type: "SKIP_WARMUP", atMs: Date.now() }));
    await flushReal();
    expect(screenId()).toBe("UF-09.3");
    expect(document.activeElement).toBe(doneButton());
  });
});

describe("AC-1 rejected reads are caught (D-0104)", () => {
  it("a rejected loadExerciseDetail: no cue, Done set still works", async () => {
    detailSpy.mockImplementation(async () => {
      throw new Error("idb gone");
    });
    await showSet();
    await flushReal();
    expect(detailSpy).toHaveBeenCalled();
    expect(document.querySelector('[data-field="cue"]')).toBeNull();
    fireEvent.click(doneButton());
    await findScreen("UF-09.4");
    expect(unhandled).toEqual([]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("a rejected loadLibrary: the heading is the id, Done set still works", async () => {
    libSpy.mockImplementation(async () => {
      throw new Error("no cache");
    });
    await showSet();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^bench-press$/);
    fireEvent.click(doneButton());
    await findScreen("UF-09.4");
    expect(unhandled).toEqual([]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("the pair, resolved reads: the name and the cue, and nothing logged", async () => {
    await showSet();
    expect(await findCue()).toHaveTextContent(BENCH_CUE);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^Bench press$/);
    expect(unhandled).toEqual([]);
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe("AC-2 Done set feedback < 100 ms", () => {
  it("the pair: before the click, no data-state='saving' and no aria-busy", async () => {
    await showSet();
    expect(document.querySelector('[data-state="saving"]')).toBeNull();
    expect(doneButton()).not.toHaveAttribute("aria-busy");
  });

  it("synchronous: right after the click the button is saving and busy, still UF-09.3; one write; then UF-09.4", async () => {
    await showSet();
    const held = deferred<Awaited<ReturnType<typeof offline.recordSet>>>();
    recordSpy.mockImplementationOnce(() => held.promise);
    fireEvent.click(doneButton());
    // No await, no timer advance.
    expect(doneButton()).toHaveAttribute("data-state", "saving");
    expect(doneButton()).toHaveAttribute("aria-busy", "true");
    expect(screenId()).toBe("UF-09.3");
    // One write per set: a second tap while pending makes no second call.
    fireEvent.click(doneButton());
    await flushReal();
    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(screenId()).toBe("UF-09.3");
    const real = await vi.importActual<typeof offline>("../../../lib/offline/index.js");
    await act(async () => {
      held.resolve(await real.recordSet(benchCall as offline.RecordSetInput));
    });
    await findScreen("UF-09.4");
    expect(storedState().loggedSets).toHaveLength(1);
  });

  it("a double tap with the real write: one recordSet, one loggedSets entry (T-0304e note)", async () => {
    await showSet();
    fireEvent.click(doneButton());
    fireEvent.click(doneButton());
    await findScreen("UF-09.4");
    await flushReal();
    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(storedState().loggedSets).toHaveLength(1);
    expect(storedState().loggedSets[0]).toMatchObject({ setIndex: 0 });
  });
});

describe("AC-3 the write comes before moving on", () => {
  it("Done set calls recordSet once with the set, through the hook", async () => {
    await showSet();
    fireEvent.click(doneButton());
    await findScreen("UF-09.4");
    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(recordSpy).toHaveBeenCalledWith(benchCall);
  });

  it("real queue: a fresh Dexie sees the row with the clientId loggedSets holds", async () => {
    await showSet();
    fireEvent.click(doneButton());
    await findScreen("UF-09.4");
    const [entry] = storedState().loggedSets;
    const fresh = new Dexie(offline.offlineDb().name);
    await fresh.open();
    const rows = await fresh.table("sets").toArray();
    fresh.close();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      clientId: entry!.clientId,
      sessionId: S1,
      exerciseId: "bench-press",
      setIndex: 0,
      kind: "reps",
      reps: 6,
      weightKg: 80,
      isWarmup: false,
      backoff: false,
      status: "queued",
    });
  });

  it("rejection keeps UF-09.3 with polite text, re-enables the button, no transition after 50 ms; a retry moves on", async () => {
    await showSet();
    recordSpy.mockImplementationOnce(async () => {
      throw new Error("quota");
    });
    fireEvent.click(doneButton());
    await flushReal();
    expect(screenId()).toBe("UF-09.3");
    const status = screen.getByText("Couldn't save. Tap Done set again.");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(doneButton()).toBeEnabled();
    expect(doneButton()).not.toHaveAttribute("aria-disabled");
    expect(doneButton()).not.toHaveAttribute("data-state");
    await flushReal(50);
    expect(screenId()).toBe("UF-09.3");
    expect(storedState().phase).toBe("set");
    expect(unhandled).toEqual([]);

    // Retry.
    fireEvent.click(doneButton());
    await findScreen("UF-09.4");
    expect(recordSpy).toHaveBeenCalledTimes(2);
  });

  it("the pair: a resolved write shows no error text", async () => {
    await showSet();
    fireEvent.click(doneButton());
    await findScreen("UF-09.4");
    expect(screen.queryByText("Couldn't save. Tap Done set again.")).not.toBeInTheDocument();
  });
});
