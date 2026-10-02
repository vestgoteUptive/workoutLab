// T-0421 UF-05.1 with `rankSwaps` (and, where an AC says so, `applySwap`) mocked: AC-2 (never
// re-sorted), AC-4 (row content), AC-5 (over budget still pickable), AC-8 (empty list and load
// failure) and AC-9 (pending, rejection, throw). The cache is the real fake-indexeddb one.
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import * as engine from "@workoutlab/engine";
import * as historyModule from "../../../lib/offline/history.js";
import { candidate, w5 } from "./fixtures.js";
import {
  freezeClock,
  mountSheet,
  row,
  rowIds,
  rowRadio,
  seedCache,
  settle,
  signOut,
} from "./harness.js";

let rankSpy: MockInstance<typeof engine.rankSwaps>;
let applySpy: MockInstance<typeof engine.applySwap>;
const rejections: unknown[] = [];
const onRejection = (reason: unknown) => rejections.push(reason);

beforeEach(async () => {
  freezeClock();
  rankSpy = vi.spyOn(engine, "rankSwaps");
  applySpy = vi.spyOn(engine, "applySwap");
  rejections.length = 0;
  process.on("unhandledRejection", onRejection);
  await seedCache();
});

afterEach(() => {
  process.off("unhandledRejection", onRejection);
  signOut();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function rowText(id: string): string {
  return row(id).textContent ?? "";
}

describe("AC-2 the rows are never re-sorted", () => {
  it("renders the mocked order even though muscleMatch says otherwise", async () => {
    rankSpy.mockReturnValue([
      candidate("straight-arm-pulldown", { muscleMatch: 0.667, bestMatch: true }),
      candidate("db-row", { muscleMatch: 1 }),
    ]);
    mountSheet(w5(), 1);
    expect(await rowIds()).toEqual(["straight-arm-pulldown", "db-row"]);
  });

  it("contrast: the reverse mocked order renders reversed", async () => {
    rankSpy.mockReturnValue([
      candidate("db-row", { muscleMatch: 1, bestMatch: true }),
      candidate("straight-arm-pulldown", { muscleMatch: 0.667 }),
    ]);
    mountSheet(w5(), 1);
    expect(await rowIds()).toEqual(["db-row", "straight-arm-pulldown"]);
  });

  it("never filters: a candidate the sheet's own rules might drop is still shown", async () => {
    rankSpy.mockReturnValue([
      candidate("db-row", { bestMatch: true }),
      candidate("pull-up", { equipment: ["pullup-bar"], fitsBudget: false }),
    ]);
    mountSheet(w5(), 1);
    expect(await rowIds()).toEqual(["db-row", "pull-up"]);
  });
});

describe("AC-4 row content (D-0069 §5)", () => {
  it("name, match, minutes (ceil), equipment, and Bodyweight for [] and ['none']", async () => {
    rankSpy.mockReturnValue([
      candidate("straight-arm-pulldown", {
        muscleMatch: 0.667,
        timeCostS: 375,
        equipment: ["cable"],
      }),
      candidate("inverted-row", { muscleMatch: 1, timeCostS: 360, equipment: [] }),
      candidate("db-row", { muscleMatch: 0.994, timeCostS: 361, equipment: ["none"] }),
      candidate("lat-pulldown", { equipment: ["dumbbell", "bench", "sled"] }),
    ]);
    mountSheet(w5(), 1);
    await rowIds();

    const sap = row("straight-arm-pulldown");
    expect(within(sap).getByText("Straight-arm pulldown")).toBeInTheDocument();
    expect(within(sap).getByText("67 % muscle match")).toBeInTheDocument();
    expect(within(sap).getByText("7 min")).toBeInTheDocument();
    expect(within(sap).getByText("Cable")).toBeInTheDocument();

    const inv = row("inverted-row");
    expect(within(inv).getByText("Bodyweight")).toBeInTheDocument();
    expect(within(inv).getByText("6 min")).toBeInTheDocument();
    expect(within(inv).getByText("100 % muscle match")).toBeInTheDocument();

    const dbr = row("db-row");
    expect(within(dbr).getByText("Bodyweight")).toBeInTheDocument();
    expect(within(dbr).getByText("7 min")).toBeInTheDocument();
    expect(within(dbr).getByText("99 % muscle match")).toBeInTheDocument();

    // Several items join with ", "; an unknown value prints as its raw id (D-0079 §5).
    expect(within(row("lat-pulldown")).getByText("Dumbbell, Bench, sled")).toBeInTheDocument();
  });

  it("the Best match tag follows bestMatch, both values", async () => {
    rankSpy.mockReturnValue([
      candidate("db-row", { bestMatch: false }),
      candidate("lat-pulldown", { bestMatch: true }),
    ]);
    mountSheet(w5(), 1);
    await rowIds();
    expect(rowText("db-row")).not.toContain("Best match");
    expect(rowText("lat-pulldown")).toContain("Best match");
  });
});

describe("AC-5 over budget is still pickable (D-0056 §3)", () => {
  it("fitsBudget false shows Over your time, can be selected and applied; true has no tag", async () => {
    rankSpy.mockReturnValue([
      candidate("db-row", { bestMatch: true, fitsBudget: true }),
      candidate("lat-pulldown", { fitsBudget: false }),
    ]);
    const m = mountSheet(w5(), 1);
    await rowIds();

    expect(within(row("lat-pulldown")).getByText("Over your time")).toBeInTheDocument();
    expect(rowText("db-row")).not.toContain("Over your time");

    fireEvent.click(rowRadio("lat-pulldown"));
    expect(rowRadio("lat-pulldown")).toBeChecked();
    expect(rowRadio("lat-pulldown")).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Use Lat pulldown" }));
    await waitFor(() => expect(m.onApply).toHaveBeenCalledTimes(1));
    expect(applySpy).toHaveBeenCalledTimes(1);
    expect(applySpy.mock.calls[0]![2]).toBe("lat-pulldown");
  });
});

describe("AC-8 empty list and load failure", () => {
  it("an empty ranking shows the empty message and Close, which calls onClose", async () => {
    rankSpy.mockReturnValue([]);
    const m = mountSheet(w5(), 1);
    expect(await screen.findByText("No alternatives fit your equipment")).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Replacement" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Use / })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(m.onClose).toHaveBeenCalledTimes(1);
    await settle();
    expect(m.onApply).not.toHaveBeenCalled();
  });

  it("contrast: a non-empty ranking shows no empty message", async () => {
    rankSpy.mockReturnValue([candidate("db-row", { bestMatch: true })]);
    mountSheet(w5(), 1);
    await rowIds();
    expect(screen.queryByText("No alternatives fit your equipment")).toBeNull();
  });

  async function expectLoadFailure(): Promise<void> {
    const m = mountSheet(w5(), 1);
    expect(await screen.findByText("Couldn't load alternatives.")).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Replacement" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(m.onClose).toHaveBeenCalledTimes(1);
    await settle();
    expect(m.onApply).not.toHaveBeenCalled();
    expect(rejections).toEqual([]);
  }

  it("loadProfile() resolving null", async () => {
    await seedCache({ profile: null });
    await expectLoadFailure();
    expect(rankSpy).not.toHaveBeenCalled();
  });

  it("loadLibrary() rejecting", async () => {
    vi.spyOn(historyModule, "loadLibrary").mockRejectedValue(new Error("idb gone"));
    await expectLoadFailure();
  });

  it("rankSwaps throwing (a plan item the library doesn't know, D-0059 (c))", async () => {
    rankSpy.mockImplementation(() => {
      throw new RangeError("not in library");
    });
    await expectLoadFailure();
  });

  it("contrast: a seeded profile and library load", async () => {
    mountSheet(w5(), 1);
    await rowIds();
    expect(screen.queryByText("Couldn't load alternatives.")).toBeNull();
  });
});

describe("AC-9 pending, rejection and throw (D-0142 §5)", () => {
  function held(): { promise: Promise<void>; resolve(): void; reject(e: unknown): void } {
    let resolve!: () => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  it("while onApply's promise is held, Use is aria-disabled and a second click does nothing", async () => {
    const h = held();
    const m = mountSheet(w5(), 1, { onApply: () => h.promise });
    await rowIds();
    const use = screen.getByRole("button", { name: "Use Db row" });
    expect(use).not.toHaveAttribute("aria-disabled");

    fireEvent.click(use);
    await waitFor(() => expect(use).toHaveAttribute("aria-disabled", "true"));
    fireEvent.click(use);
    await settle();
    expect(applySpy).toHaveBeenCalledTimes(1);
    expect(m.onApply).toHaveBeenCalledTimes(1);

    h.resolve();
    await waitFor(() => expect(use).not.toHaveAttribute("aria-disabled"));
    expect(screen.queryByText("Couldn't save the swap. Try again.")).toBeNull();
  });

  it("a void onApply never goes pending", async () => {
    const m = mountSheet(w5(), 1);
    await rowIds();
    const use = screen.getByRole("button", { name: "Use Db row" });
    fireEvent.click(use);
    await waitFor(() => expect(m.onApply).toHaveBeenCalledTimes(1));
    await settle();
    expect(use).not.toHaveAttribute("aria-disabled");
  });

  it("a rejected onApply shows the polite error, keeps the sheet open, and Use works again", async () => {
    let calls = 0;
    const m = mountSheet(w5(), 1, {
      onApply: () => {
        calls += 1;
        return calls === 1 ? Promise.reject(new Error("idb full")) : Promise.resolve();
      },
    });
    await rowIds();
    fireEvent.click(screen.getByRole("button", { name: "Use Db row" }));

    const message = await screen.findByText("Couldn't save the swap. Try again.");
    expect(message.closest('[aria-live="polite"]')).not.toBeNull();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    const use = screen.getByRole("button", { name: "Use Db row" });
    expect(use).not.toHaveAttribute("aria-disabled");

    fireEvent.click(use);
    await waitFor(() => expect(m.onApply).toHaveBeenCalledTimes(2));
    expect(applySpy).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(screen.queryByText("Couldn't save the swap. Try again.")).toBeNull(),
    );
    expect(rejections).toEqual([]);
  });

  it("applySwap throwing a RangeError shows the swap error and never calls onApply", async () => {
    applySpy.mockImplementation(() => {
      throw new RangeError("not a compound");
    });
    const m = mountSheet(w5(), 1);
    await rowIds();
    fireEvent.click(screen.getByRole("button", { name: "Use Db row" }));
    expect(await screen.findByText("Couldn't swap to that exercise.")).toBeInTheDocument();
    await settle();
    expect(m.onApply).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("contrast: a working applySwap shows neither error", async () => {
    const m = mountSheet(w5(), 1);
    await rowIds();
    fireEvent.click(screen.getByRole("button", { name: "Use Db row" }));
    await waitFor(() => expect(m.onApply).toHaveBeenCalledTimes(1));
    await settle();
    expect(screen.queryByText("Couldn't swap to that exercise.")).toBeNull();
    expect(screen.queryByText("Couldn't save the swap. Try again.")).toBeNull();
  });
});
