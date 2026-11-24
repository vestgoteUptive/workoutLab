// T-1004 UF-09.9 (D-0277, D-0281): a swap confirmed from the paused screen is counted in the edit
// ledger. The UF-05.1 sheet is a stub that applies a swap with a chosen reason; the ledger is the
// real one over fake-indexeddb.
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { offlineDb } from "../../../lib/offline/db.js";
import { entries } from "../../../lib/offline/edit-ledger.js";
import { STARTED_AT_MS, USER_A } from "./fixtures.js";
import { flushReal, freshDb, screenId, seedSession, signIn, useFakeClock } from "./helpers.js";
import { renderSession } from "./session-helpers.js";
import { findEl, seedFocus } from "./set-loop-helpers.js";

interface Props {
  workout: { plan: { items: Array<Record<string, unknown>> } };
  itemIndex: number;
  onApply(result: unknown, o: { exclusionFailed: boolean }): Promise<void>;
  onClose(): void;
}
vi.mock("../../UF-05/index.js", () => ({
  SwapSheet: (p: Props) => {
    const apply = (to: string, reason: string | null) => {
      const items = p.workout.plan.items.map((it, i) =>
        i === p.itemIndex ? { ...it, exerciseId: to, reasons: [{ code: "swap", reason }] } : it,
      );
      void p.onApply(
        { ...p.workout, plan: { ...p.workout.plan, items } },
        { exclusionFailed: false },
      );
    };
    return (
      <div data-testid="swap-stub">
        {[null, "discomfort", "equipment_taken", "variety", "short_on_time"].map((r) => (
          <button key={String(r)} onClick={() => apply("cable-row", r)}>
            {`use:${r}`}
          </button>
        ))}
        <button
          onClick={() =>
            apply(
              p.workout.plan.items[p.itemIndex]!.exerciseId === "barbell-row"
                ? "cable-row"
                : "barbell-row",
              null,
            )
          }
        >
          use:toggle
        </button>
        <button onClick={p.onClose}>cancel</button>
      </div>
    );
  },
}));

const NOW = STARTED_AT_MS + 20 * 60_000;

beforeEach(async () => {
  window.localStorage.clear();
  freshDb();
  useFakeClock(NOW);
  signIn(USER_A);
  await seedSession();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
});

let baseline = 0;
async function openSheet(): Promise<void> {
  seedFocus(NOW, { phase: "paused", resumePhase: "set", pausedAtMs: NOW, itemIndex: 1 });
  await renderSession({ locale: "en-GB" });
  expect(screenId()).toBe("UF-09.9");
  baseline = live();
  fireEvent.click(screen.getByRole("button", { name: "Swap" }));
  await flushReal();
  await findEl(() => screen.queryByTestId("swap-stub"));
}
const press = async (name: string) => {
  fireEvent.click(screen.getByRole("button", { name }));
  await flushReal(100);
};
const setLearning = (learnFromEdits: boolean) =>
  offlineDb().profileCache.put({
    userId: USER_A,
    profile: {} as never,
    learning: { learnFromEdits, learnResetAt: null },
  });
const live = () => document.querySelectorAll("[aria-live],[role=status],[role=alert]").length;

describe("T-1004 AC1 counted and uncounted reasons", () => {
  it.each(["use:null", "use:discomfort"])(
    "%s records one signal with the workout id",
    async (n) => {
      await openSheet();
      await press(n);
      const rows = await entries();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        kind: "swap",
        exerciseId: "barbell-row",
        toExerciseId: "cable-row",
        count: 1,
      });
      expect(rows[0]!.visits).toHaveLength(1);
    },
  );
  it.each(["use:equipment_taken", "use:variety", "use:short_on_time"])(
    "%s records nothing (the pair)",
    async (n) => {
      await openSheet();
      await press(n);
      expect(await entries()).toHaveLength(0);
      expect(screen.queryByTestId("swap-stub")).toBeNull(); // the swap itself still applied
    },
  );
});

describe("T-1004 AC2 once per workout", () => {
  it("A to B, B to A, A to B in one workout: each pair counts once", async () => {
    await openSheet();
    for (let i = 0; i < 3; i++) {
      if (i > 0) {
        fireEvent.click(screen.getByRole("button", { name: "Swap" }));
        await flushReal();
        await findEl(() => screen.queryByTestId("swap-stub"));
      }
      await press("use:toggle");
    }
    const rows = await entries();
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r.count]));
    expect(byKey).toEqual({
      "swap:barbell-row:cable-row": 1,
      "swap:cable-row:barbell-row": 1,
    });
  });
});

describe("T-1004 AC3 learning on / off", () => {
  it("on: one signal", async () => {
    await setLearning(true);
    await openSheet();
    await press("use:null");
    expect(await offlineDb().editLedger.count()).toBe(1);
  });
  it("off: nothing is written", async () => {
    await setLearning(false);
    await openSheet();
    await press("use:null");
    expect(await offlineDb().editLedger.count()).toBe(0);
  });
});

describe("T-1004 AC4 offline and online are the same, with no network call", () => {
  it.each([true, false])("online=%s: one signal, no fetch", async (online) => {
    Object.defineProperty(window.navigator, "onLine", { value: online, configurable: true });
    await openSheet();
    const spy = vi.spyOn(globalThis, "fetch");
    await press("use:null");
    expect(await offlineDb().editLedger.count()).toBe(1);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("T-1004 AC5 no new DOM", () => {
  it("the screen after a counted swap equals the one after an uncounted swap, with learning on or off", async () => {
    const after: string[] = [];
    for (const [learn, btn] of [
      [true, "use:null"],
      [false, "use:null"],
      [true, "use:variety"],
    ] as const) {
      cleanup();
      freshDb();
      await seedSession();
      await setLearning(learn);
      await openSheet();
      await press(btn);
      expect(live()).toBe(baseline);
      expect(screen.queryByTestId("swap-stub")).toBeNull();
      after.push(document.body.innerHTML);
    }
    expect(after[1]).toBe(after[0]);
    expect(after[2]).toBe(after[0]);
  });
});

describe("T-1004 AC6 a cancelled sheet", () => {
  it("records nothing", async () => {
    await openSheet();
    await press("cancel");
    expect(screen.queryByTestId("swap-stub")).toBeNull();
    expect(await offlineDb().editLedger.count()).toBe(0);
  });
});
