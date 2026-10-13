// T-0679 UF-05.1: while a swap is pending the candidate radios are aria-disabled, not native
// disabled, so a focused radio keeps focus inside the dialog's focus trap and input is ignored.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { w5 } from "./fixtures.js";
import { freezeClock, mountSheet, rowIds, rowRadio, seedCache, signOut } from "./harness.js";

beforeEach(async () => {
  freezeClock();
  await seedCache();
});
afterEach(() => {
  signOut();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function pendingSheet() {
  const m = mountSheet(w5(), 1, { onApply: () => new Promise<void>(() => {}) });
  const ids = await rowIds();
  const other = ids.find((id) => id !== "lat-pulldown") ?? ids[0]!;
  const focused = rowRadio("lat-pulldown");
  fireEvent.click(focused);
  focused.focus();
  expect(focused).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "Use Lat pulldown" }));
  await waitFor(() => expect(focused).toHaveAttribute("aria-disabled", "true"));
  return { m, focused, other };
}

describe("candidate radios while pending", () => {
  it("a focused radio keeps focus inside the dialog, and is not natively disabled", async () => {
    const { focused } = await pendingSheet();
    expect(focused).not.toHaveAttribute("disabled");
    expect(focused).toHaveFocus();
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
  });

  it("a change (click or arrow key) while pending selects nothing", async () => {
    const { focused, other } = await pendingSheet();
    const target = rowRadio(other);
    fireEvent.click(target);
    expect(target).not.toBeChecked();
    expect(focused).toBeChecked();
    fireEvent.keyDown(focused, { key: "ArrowDown" });
    fireEvent.click(target);
    expect(focused).toBeChecked();
  });
});

describe("contrast: not pending", () => {
  it("radios are not aria-disabled and a change selects", async () => {
    mountSheet(w5(), 1);
    await rowIds();
    const r = rowRadio("lat-pulldown");
    expect(r).not.toHaveAttribute("aria-disabled");
    fireEvent.click(r);
    expect(r).toBeChecked();
  });
});
