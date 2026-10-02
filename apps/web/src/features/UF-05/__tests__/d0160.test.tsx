// T-0421 rework: the D-0160 behaviours. (a) a reason chip resets the pick to the first row, (b)
// one `now` per open, (c) Tab and Shift+Tab wrap inside the dialog, (d) a slot change resets
// the sheet while a new `workout` object for the same slot doesn't. Real engine, spied; real
// fake-indexeddb cache.
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import * as engine from "@workoutlab/engine";
import { SwapSheet } from "../index.js";
import { NOW, TZ, w5 } from "./fixtures.js";
import { freezeClock, mountSheet, rowIds, rowRadio, seedCache, signOut } from "./harness.js";

const NOW_ISO = new Date(NOW).toISOString();

let rankSpy: MockInstance<typeof engine.rankSwaps>;
let applySpy: MockInstance<typeof engine.applySwap>;

beforeEach(async () => {
  freezeClock();
  rankSpy = vi.spyOn(engine, "rankSwaps");
  applySpy = vi.spyOn(engine, "applySwap");
  await seedCache();
});

afterEach(() => {
  signOut();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function chip(name: string): HTMLInputElement {
  return within(screen.getByRole("radiogroup", { name: "Reason" })).getByRole("radio", { name });
}

describe("D-0160 §2 a reason chip resets the pick to the first row", () => {
  it("lat-pulldown picked under Best match; Short on time selects straight-arm-pulldown", async () => {
    mountSheet(w5(), 1);
    await rowIds();
    fireEvent.click(rowRadio("lat-pulldown"));
    expect(rowRadio("lat-pulldown")).toBeChecked();

    fireEvent.click(chip("Short on time"));
    // lat-pulldown is in R12-E2 too, but not first.
    await waitFor(async () => expect((await rowIds())[0]).toBe("straight-arm-pulldown"));
    expect(await rowIds()).toContain("lat-pulldown");
    expect(rowRadio("straight-arm-pulldown")).toBeChecked();
    expect(rowRadio("lat-pulldown")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Use Straight-arm pulldown" })).toBeInTheDocument();
  });

  it("contrast: with no chip tap the pick is kept", async () => {
    mountSheet(w5(), 1);
    await rowIds();
    fireEvent.click(rowRadio("lat-pulldown"));
    expect(rowRadio("lat-pulldown")).toBeChecked();
    expect(screen.getByRole("button", { name: "Use Lat pulldown" })).toBeInTheDocument();
  });
});

describe("D-0160 §1 one now per open", () => {
  it("applySwap gets the mount-time now even when the clock moved before Use", async () => {
    const m = mountSheet(w5(), 1);
    await rowIds();
    vi.setSystemTime(new Date(new Date(NOW).getTime() + 10 * 60_000));
    fireEvent.click(chip("Variety"));
    await waitFor(() => expect(rankSpy.mock.calls.at(-1)![1]).toBe("variety"));
    fireEvent.click(screen.getByRole("button", { name: /^Use / }));
    await waitFor(() => expect(m.onApply).toHaveBeenCalledTimes(1));

    for (const call of rankSpy.mock.calls) expect(call[6]).toBe(NOW_ISO);
    expect(applySpy.mock.calls[0]![7]).toBe(NOW_ISO);
    expect(applySpy.mock.calls[0]![7]).toBe(rankSpy.mock.calls[0]![6]);
  });

  it("contrast: a sheet opened after the clock moved uses the new time", async () => {
    const later = new Date(new Date(NOW).getTime() + 10 * 60_000);
    vi.setSystemTime(later);
    mountSheet(w5(), 1);
    await rowIds();
    expect(rankSpy.mock.calls[0]![6]).toBe(later.toISOString());
  });
});

describe("D-0160 / aria-modal: Tab and Shift+Tab wrap inside the dialog", () => {
  it("Tab on the last control goes to the first; Shift+Tab on the first goes to the last", async () => {
    mountSheet(w5(), 1);
    await rowIds();
    const dialog = screen.getByRole("dialog");
    const first = chip("Best match");
    const close = screen.getByRole("button", { name: "Close" });

    close.focus();
    const tabPassed = fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    expect(tabPassed).toBe(false); // the browser's own move was prevented
    expect(document.activeElement).toBe(first);

    const shiftPassed = fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: true });
    expect(shiftPassed).toBe(false);
    expect(document.activeElement).toBe(close);
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("Shift+Tab from the dialog panel itself (focus on mount) goes to the last control", async () => {
    mountSheet(w5(), 1);
    await rowIds();
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
    fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
  });

  it("contrast: Tab from a middle control is left to the browser", async () => {
    mountSheet(w5(), 1);
    await rowIds();
    const use = screen.getByRole("button", { name: /^Use / });
    use.focus();
    expect(fireEvent.keyDown(use, { key: "Tab" })).toBe(true);
    expect(fireEvent.keyDown(use, { key: "Tab", shiftKey: true })).toBe(true);
    expect(document.activeElement).toBe(use);
  });

  it("with only Close (the load failure), Tab and Shift+Tab stay on Close", async () => {
    await seedCache({ profile: null });
    mountSheet(w5(), 1);
    const close = await screen.findByRole("button", { name: "Close" });
    await screen.findByText("Couldn't load alternatives.");
    close.focus();
    fireEvent.keyDown(close, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(close);
  });
});

describe("D-0160 a slot change while mounted resets the sheet", () => {
  function tree(workout: ReturnType<typeof w5>, itemIndex: number) {
    return (
      <SwapSheet
        workout={workout}
        itemIndex={itemIndex}
        onApply={() => undefined}
        onClose={() => undefined}
        timeZone={TZ}
      />
    );
  }

  it("a new itemIndex goes back to Best match with the first row", async () => {
    const workout = w5();
    const { rerender } = render(tree(workout, 1));
    await rowIds();
    fireEvent.click(chip("Short on time"));
    await waitFor(() => expect(chip("Short on time")).toBeChecked());

    rerender(tree(workout, 2));
    await waitFor(() => expect(chip("Best match")).toBeChecked());
    expect(rankSpy.mock.calls.at(-1)!.slice(0, 2)).toEqual(["leg-extension", null]);
    const ids = await rowIds();
    expect(rowRadio(ids[0]!)).toBeChecked();
    expect(screen.getByRole("dialog", { name: "Replace Leg extension" })).toBeInTheDocument();
  });

  it("contrast: a new workout object for the same slot keeps the reason and the pick", async () => {
    const { rerender } = render(tree(w5(), 1));
    await rowIds();
    fireEvent.click(chip("Short on time"));
    await waitFor(() => expect(chip("Short on time")).toBeChecked());
    fireEvent.click(rowRadio("lat-pulldown"));

    const next = w5();
    rerender(tree(next, 1));
    await waitFor(() => expect(rankSpy.mock.calls.at(-1)![2]).toBe(next));
    expect(chip("Short on time")).toBeChecked();
    expect(rowRadio("lat-pulldown")).toBeChecked();
  });
});
