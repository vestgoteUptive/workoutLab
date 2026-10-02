// T-0304b AC-4 (the persisted auto-save, NFR-TIME-1, D-0118 §2), AC-5 (a touch cancels, D-0118 §3)
// and AC-6 (steppers, RIR, Save, D-0066 §4–§5, D-0118 §4 §6) on UF-09.4.
import { fireEvent, screen, within } from "@testing-library/react";
import type { SessionPlan } from "@workoutlab/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as offline from "../../../lib/offline/index.js";
import { P1, STARTED_AT_MS, USER_A } from "./fixtures.js";
import {
  advance,
  flushReal,
  freshDb,
  screenId,
  seedSession,
  signIn,
  useFakeClock,
} from "./helpers.js";
import { renderSession } from "./session-helpers.js";
import { L2, defaultDetail } from "./set-loop-fixtures.js";
import {
  autosaveText,
  doneSet,
  findScreen,
  press,
  repsValue,
  saveButton,
  seedFocus,
  storedState,
  typeWeight,
  weightInput,
} from "./set-loop-helpers.js";
import { countOf, dispatched, stores } from "./store-spy.js";

vi.mock("../../../lib/offline/index.js", (orig) =>
  import("./set-loop-mock.js").then((m) => m.setLoopMock(orig)),
);
vi.mock("../store.js", (orig) => import("./store-spy.js").then((m) => m.storeSpy(orig)));

const NOW = STARTED_AT_MS + 10 * 60_000;
const recordSpy = vi.mocked(offline.recordSet);
const editSpy = vi.mocked(offline.editSet);
const libSpy = vi.mocked(offline.loadLibrary);
const detailSpy = vi.mocked(offline.loadExerciseDetail);

let unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => unhandled.push(reason);

beforeEach(async () => {
  window.localStorage.clear();
  dispatched.length = 0;
  stores.length = 0;
  for (const spy of [recordSpy, editSpy, libSpy, detailSpy]) spy.mockReset();
  libSpy.mockImplementation(async () => L2);
  detailSpy.mockImplementation(defaultDetail);
  unhandled = [];
  process.on("unhandledRejection", onUnhandled);
  freshDb();
  useFakeClock(NOW);
  signIn(USER_A);
});

afterEach(() => {
  expect(unhandled).toEqual([]);
  process.off("unhandledRejection", onUnhandled);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Mounts set `itemIndex` of `plan` on UF-09.3, taps Done set, and returns `t0'` (the
 *  `SET_RECORDED` dispatch time). */
async function toConfirm(plan: SessionPlan = P1, itemIndex = 0): Promise<number> {
  await seedSession({ plan });
  seedFocus(NOW, { phase: "set", itemIndex }, plan);
  const view = await renderSession({ locale: "en-GB" });
  current = view;
  await doneSet();
  const recorded = dispatched.find((e) => e.type === "SET_RECORDED");
  expect(recorded).toBeDefined();
  return recorded!.atMs;
}

let current: Awaited<ReturnType<typeof renderSession>> | null = null;

async function remount(): Promise<void> {
  current = await renderSession({ locale: "en-GB" });
}

/** Moves the fake clock to `t0 + ms` (absolute), inside act, then flushes. */
async function at(t0: number, ms: number): Promise<void> {
  await advance(t0 + ms - Date.now());
}

const autosaveIn = (s: number) => `Saving as planned in ${s} s… tap anything to edit`;

describe("AC-4 the persisted auto-save", () => {
  it("persisted right after the write: phase confirm, timer {t0', 5, 0}", async () => {
    const t0 = await toConfirm();
    expect(storedState()).toMatchObject({
      phase: "confirm",
      timer: { startedAtMs: t0, durationS: 5, pausedMs: 0 },
    });
  });

  it("the countdown reads 5, 4, 3, 2, 1 s", async () => {
    const t0 = await toConfirm();
    expect(autosaveText()).toBe(autosaveIn(5));
    for (const left of [4, 3, 2, 1]) {
      await at(t0, (5 - left) * 1000);
      expect(autosaveText()).toBe(autosaveIn(left));
    }
  });

  it("at t0' + 4 999 still UF-09.4; at + 5 000 UF-09.5, no editSet, the entry unchanged", async () => {
    const t0 = await toConfirm();
    const before = storedState().loggedSets;
    await at(t0, 4_999);
    expect(screenId()).toBe("UF-09.4");
    await at(t0, 5_000);
    expect(screenId()).toBe("UF-09.5");
    expect(countOf("SAVED")).toBe(1);
    expect(editSpy).not.toHaveBeenCalled();
    expect(storedState().loggedSets).toEqual(before);
  });

  it("restore mid-countdown: unmount at + 2 000, remount at + 3 000 → 'in 2 s'", async () => {
    const t0 = await toConfirm();
    await at(t0, 2_000);
    current!.unmount();
    await at(t0, 3_000);
    await remount();
    expect(screenId()).toBe("UF-09.4");
    expect(autosaveText()).toBe(autosaveIn(2));
    // The pair: it still saves at + 5 000.
    await at(t0, 5_000);
    expect(screenId()).toBe("UF-09.5");
  });

  it("restore expired: remount at + 10 000 → UF-09.5 after exactly one SAVED; rest starts then", async () => {
    const t0 = await toConfirm();
    current!.unmount();
    await at(t0, 10_000);
    expect(countOf("SAVED")).toBe(0);
    await remount();
    expect(screenId()).toBe("UF-09.5");
    expect(countOf("SAVED")).toBe(1);
    expect(storedState().timer).toMatchObject({ startedAtMs: t0 + 10_000, pausedMs: 0 });
    await advance(50);
    await flushReal();
    expect(countOf("SAVED")).toBe(1);
    expect(screenId()).toBe("UF-09.5");
  });

  it("Pause at + 2 000, 60 s, Resume → UF-09.4 'in 3 s'; the timer stays non-null while paused", async () => {
    const t0 = await toConfirm();
    await at(t0, 2_000);
    press("Pause workout");
    await flushReal();
    expect(screenId()).toBe("UF-09.9");
    // The pair: Pause doesn't cancel.
    expect(storedState().timer).not.toBeNull();
    await advance(60_000);
    expect(screenId()).toBe("UF-09.9");
    expect(countOf("SAVED")).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    await flushReal();
    expect(screenId()).toBe("UF-09.4");
    expect(autosaveText()).toBe(autosaveIn(3));
    await advance(3_000);
    expect(screenId()).toBe("UF-09.5");
  });
});

describe("AC-5 a touch cancels", () => {
  it("pointerdown on reps '+' → timer null, 'Tap save when ready.', still UF-09.4 after 60 s", async () => {
    await toConfirm();
    fireEvent.pointerDown(screen.getByRole("button", { name: "More reps" }));
    await flushReal();
    expect(storedState().timer).toBeNull();
    expect(autosaveText()).toBe("Tap save when ready.");
    await advance(60_000);
    expect(screenId()).toBe("UF-09.4");
    expect(countOf("AUTOSAVE_CANCEL")).toBe(1);
  });

  it("a keydown inside the step view cancels the same way", async () => {
    await toConfirm();
    fireEvent.keyDown(screen.getByRole("radio", { name: "None" }), { key: "ArrowRight" });
    await flushReal();
    expect(storedState().timer).toBeNull();
    expect(autosaveText()).toBe("Tap save when ready.");
    await advance(60_000);
    expect(screenId()).toBe("UF-09.4");
  });

  it("a remount after a cancel: the recorded values and 'Tap save when ready.', no countdown", async () => {
    await toConfirm();
    press("More reps");
    await flushReal();
    expect(repsValue()).toBe("7");
    current!.unmount();
    await remount();
    expect(screenId()).toBe("UF-09.4");
    expect(repsValue()).toBe("6");
    expect(weightInput().value).toBe("80");
    expect(autosaveText()).toBe("Tap save when ready.");
    await advance(10_000);
    expect(screenId()).toBe("UF-09.4");
  });

  it("the pair: a pointerdown on the chrome's Pause workout doesn't cancel", async () => {
    const t0 = await toConfirm();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Pause workout" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Pause workout" }), { key: "Tab" });
    await flushReal();
    expect(storedState().timer).toEqual({ startedAtMs: t0, durationS: 5, pausedMs: 0 });
    expect(countOf("AUTOSAVE_CANCEL")).toBe(0);
    expect(autosaveText()).toBe(autosaveIn(5));
  });

  it("focus: Save is document.activeElement on entry; that focus doesn't cancel, and it saves at 5 s", async () => {
    const t0 = await toConfirm();
    expect(document.activeElement).toBe(saveButton());
    expect(storedState().timer).not.toBeNull();
    expect(countOf("AUTOSAVE_CANCEL")).toBe(0);
    await at(t0, 5_000);
    expect(screenId()).toBe("UF-09.5");
  });

  it("Pause drops unsaved edits: touch, reps 6 → 5, Pause → Resume shows reps 6, no countdown; Save makes 0 editSet calls", async () => {
    await toConfirm();
    press("Fewer reps");
    await flushReal();
    expect(repsValue()).toBe("5");
    press("Pause workout");
    await flushReal();
    expect(screenId()).toBe("UF-09.9");
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    await flushReal();
    expect(screenId()).toBe("UF-09.4");
    expect(repsValue()).toBe("6");
    expect(autosaveText()).toBe("Tap save when ready.");
    await advance(10_000);
    expect(screenId()).toBe("UF-09.4");
    press("Save");
    await flushReal();
    expect(editSpy).not.toHaveBeenCalled();
    expect(screenId()).toBe("UF-09.5");
    expect(storedState().loggedSets[0]).toMatchObject({ reps: 6, weightKg: 80 });
  });
});

describe("AC-6 steppers", () => {
  it("reps step by 1 and floor at 0", async () => {
    await toConfirm();
    press("More reps");
    expect(repsValue()).toBe("7");
    press("Fewer reps", 2);
    expect(repsValue()).toBe("5");
    press("Fewer reps", 10);
    expect(repsValue()).toBe("0");
  });

  it("bench-press weight steps by 2.5 and floors at 0", async () => {
    await toConfirm();
    press("More weight");
    expect(weightInput().value).toBe("82.5");
    press("Less weight", 2);
    expect(weightInput().value).toBe("77.5");
    typeWeight("1");
    press("Less weight");
    expect(weightInput().value).toBe("0");
  });

  it("leg-curl weight steps by 5", async () => {
    await toConfirm(P1, 2);
    expect(weightInput().value).toBe("");
    press("More weight", 2);
    expect(weightInput().value).toBe("10");
    press("Less weight");
    expect(weightInput().value).toBe("5");
  });

  it("no library entry: steps by 2.5", async () => {
    libSpy.mockImplementation(async () => L2.filter((e) => e.id !== "leg-curl"));
    await toConfirm(P1, 2);
    press("More weight");
    expect(weightInput().value).toBe("2.5");
  });
});

describe("AC-6 the typed weight", () => {
  it("the input has inputmode=decimal and reads '80'", async () => {
    await toConfirm();
    expect(weightInput()).toHaveAttribute("inputmode", "decimal");
    expect(weightInput().value).toBe("80");
  });

  it.each(["77,5", "77.5"])("typing %j saves 77.5", async (text) => {
    await toConfirm();
    typeWeight(text);
    press("Save");
    await findScreen("UF-09.5");
    expect(editSpy).toHaveBeenCalledTimes(1);
    expect(editSpy.mock.calls[0]![1]).toEqual({ reps: 6, weightKg: 77.5, rir: null });
  });

  it("'abc': Save aria-disabled and the hint; Save does nothing", async () => {
    await toConfirm();
    typeWeight("abc");
    expect(saveButton()).toHaveAttribute("aria-disabled", "true");
    const hint = screen.getByText("Enter a weight like 82.5");
    expect(hint).toHaveAttribute("aria-live", "polite");
    press("Save");
    await flushReal();
    expect(editSpy).not.toHaveBeenCalled();
    expect(screenId()).toBe("UF-09.4");
  });

  it("the pair: a valid weight has no hint and Save isn't aria-disabled", async () => {
    await toConfirm();
    typeWeight("82.5");
    expect(saveButton()).not.toHaveAttribute("aria-disabled");
    expect(screen.queryByText(/Enter a weight like/)).not.toBeInTheDocument();
  });

  it("an empty field saves weightKg null", async () => {
    await toConfirm();
    typeWeight("");
    press("Save");
    await findScreen("UF-09.5");
    expect(editSpy.mock.calls[0]![1]).toEqual({ reps: 6, weightKg: null, rir: null });
  });

  it.each([
    ["More weight", "bench-press", 0, "2.5"],
    ["Less weight", "bench-press", 0, "0"],
    ["More weight", "leg-curl", 2, "5"],
  ] as const)(
    "%s from 'abc' on %s gives %j, clears the hint, enables Save",
    async (name, _, i, out) => {
      await toConfirm(P1, i);
      typeWeight("abc");
      expect(screen.getByText(/Enter a weight like/)).toBeInTheDocument();
      press(name);
      expect(weightInput().value).toBe(out);
      expect(screen.queryByText(/Enter a weight like/)).not.toBeInTheDocument();
      expect(saveButton()).not.toHaveAttribute("aria-disabled");
    },
  );

  it("'More weight' from an empty field counts from 0", async () => {
    await toConfirm();
    typeWeight("");
    press("More weight");
    expect(weightInput().value).toBe("2.5");
  });
});

describe("AC-6 RIR", () => {
  it("a radio group 'Reps in reserve' with None, 1–2, 3+, none checked", async () => {
    await toConfirm();
    const group = screen.getByRole("radiogroup", { name: "Reps in reserve" });
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((r) => r.closest("label")!.textContent)).toEqual(["None", "1–2", "3+"]);
    for (const r of radios) expect(r).not.toBeChecked();
  });

  it.each([
    ["None", 0],
    ["1–2", 2],
    ["3+", 3],
  ] as const)("%s saves rir %d", async (name, rir) => {
    await toConfirm();
    const radio = screen.getByRole("radio", { name });
    fireEvent.pointerDown(radio);
    fireEvent.click(radio);
    expect(radio).toBeChecked();
    press("Save");
    await findScreen("UF-09.5");
    expect(editSpy.mock.calls[0]![1]).toEqual({ reps: 6, weightKg: 80, rir });
  });
});

describe("AC-6 Save", () => {
  it("with a change: editSet(clientId, {reps 5, weightKg 77.5, rir 2}) once, then UF-09.5 with those values", async () => {
    await toConfirm();
    const { clientId } = storedState().loggedSets[0]!;
    press("Fewer reps");
    typeWeight("77.5");
    const radio = screen.getByRole("radio", { name: "1–2" });
    fireEvent.pointerDown(radio);
    fireEvent.click(radio);
    press("Save");
    await findScreen("UF-09.5");
    expect(editSpy).toHaveBeenCalledTimes(1);
    expect(editSpy).toHaveBeenCalledWith(clientId, { reps: 5, weightKg: 77.5, rir: 2 });
    expect(storedState().loggedSets[0]).toMatchObject({
      clientId,
      reps: 5,
      weightKg: 77.5,
      rir: 2,
    });
    expect(countOf("SAVED")).toBe(1);
  });

  it("the pair, no change: a touch then Save → 0 editSet calls, UF-09.5", async () => {
    await toConfirm();
    fireEvent.pointerDown(screen.getByRole("group", { name: "Reps" }));
    press("Save");
    await findScreen("UF-09.5");
    expect(editSpy).not.toHaveBeenCalled();
  });

  it("a change undone (6 → 7 → 6) is no change: 0 editSet calls", async () => {
    await toConfirm();
    press("More reps");
    press("Fewer reps");
    press("Save");
    await findScreen("UF-09.5");
    expect(editSpy).not.toHaveBeenCalled();
  });

  it("a double tap on Save with a change: one editSet", async () => {
    await toConfirm();
    press("More reps");
    press("Save", 2);
    await findScreen("UF-09.5");
    await flushReal();
    expect(editSpy).toHaveBeenCalledTimes(1);
    expect(countOf("SAVED")).toBe(1);
  });

  it("a rejected editSet keeps UF-09.4 with polite text and no transition; a retry moves on", async () => {
    await toConfirm();
    editSpy.mockImplementationOnce(async () => {
      throw new Error("tombstoned");
    });
    press("More reps");
    press("Save");
    await flushReal();
    const status = screen.getByText("Couldn't save. Tap Save again.");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await flushReal(50);
    expect(screenId()).toBe("UF-09.4");
    expect(countOf("SAVED")).toBe(0);
    expect(saveButton()).not.toHaveAttribute("aria-disabled");
    press("Save");
    await findScreen("UF-09.5");
    expect(editSpy).toHaveBeenCalledTimes(2);
  });
});
