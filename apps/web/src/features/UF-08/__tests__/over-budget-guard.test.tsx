// T-0943 UF-08.2/UF-08.3/UF-08.5 (D-0240 §3-§4): in suggested mode, after a UF-08.3 swap confirmed
// with `fitsBudget: false`, Add, Shuffle and Start with this are refused with the over-budget copy,
// and a time chip names a dropped swap-in. AC1-AC6 + addendum (docs/tickets/T-0943). Same harness as
// swap-pins.test.tsx. Loaders mocked; the real engine runs behind a
// spy and the real UF-05.1 sheet does the swap. The 30-min plan (F-web, R7-E4) is Bench press
// (main), Inverted row, Leg extension; the sheet offers Db row for Inverted row and Db bench press
// for Bench press.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { suggest } from "@workoutlab/engine";
import { excludeExercise } from "../../../lib/offline/excluded.js";
import { fitLine, renderSetup, screenIds, serveCache, setOnline, settle } from "./harness.js";

const auth = vi.hoisted(() => ({
  status: "signed-in" as const,
  userId: undefined as string | undefined,
}));
vi.mock("../../../lib/auth/auth-context.js", () => ({
  useAuth: () => ({ status: auth.status, userId: auth.userId }),
}));
vi.mock("../../../lib/offline/history.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/history.js")>();
  return {
    ...actual,
    loadLibrary: vi.fn(),
    loadTargets: vi.fn(),
    loadProfile: vi.fn(),
    refreshAll: vi.fn(async () => {}),
    lastSyncedAt: vi.fn(async () => null),
  };
});
vi.mock("../../../lib/offline/engine-feed.js", () => ({ loadEngineHistory: vi.fn() }));
vi.mock("../../../lib/offline/excluded.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/excluded.js")>();
  return { ...actual, excludeExercise: vi.fn(async () => {}) };
});
vi.mock("@workoutlab/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workoutlab/engine")>();
  return { ...actual, suggest: vi.fn(actual.suggest) };
});

const spy = vi.mocked(suggest);
const storeExclusion = vi.mocked(excludeExercise);

beforeEach(() => {
  auth.userId = undefined;
  spy.mockClear();
  storeExclusion.mockClear();
  setOnline(false);
  serveCache();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const button = (name: string) => screen.getByRole("button", { name });
const lastInput = () => spy.mock.lastCall![4];
const rowIds = () =>
  Array.from(document.querySelectorAll('[data-part="item-row"]')).map((r) =>
    r.getAttribute("data-id"),
  );
const status = () => document.querySelector<HTMLElement>('[data-part="status"]')!;
const sheetStatus = () => document.querySelector<HTMLElement>('[data-part="sheet-status"]')!;
const doesntFit = () => document.querySelector('[data-part="doesnt-fit"]');

/** UF-08.1 → 30 minutes → Suggest my workout → UF-08.2. */
async function toPlan(): Promise<void> {
  renderSetup();
  await waitFor(() => expect(fitLine().textContent).toMatch(/^Fits/));
  fireEvent.click(button("30 minutes"));
  await settle();
  fireEvent.click(button("Suggest my workout"));
  expect(screenIds()).toEqual(["UF-08.2"]);
  expect(rowIds()).toEqual(["bench-press", "inverted-row", "leg-extension"]);
  spy.mockClear();
}

/** UF-08.3: swap Leg extension for the sheet's over-time replacement; returns its id. */
async function overSwap(): Promise<string> {
  fireEvent.click(button("Swap Leg extension"));
  const group = await screen.findByRole("radiogroup", { name: "Replacement" });
  const overRow = group.querySelector<HTMLElement>('[data-tag="over-time"]')!.closest("label")!;
  const id = overRow.closest<HTMLElement>("[data-id]")!.getAttribute("data-id")!;
  fireEvent.click(within(overRow).getByRole("radio"));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Use / }));
  await waitFor(() => expect(screenIds()).toEqual(["UF-08.2"]));
  return id;
}

const overCopy = /^Your workout is (\d+) min over\. Remove or swap an exercise first\.$/;

/** Suggested mode at 30 min over budget through a `fitsBudget: false` swap. */
async function overBudget(): Promise<string> {
  await toPlan();
  const b = await overSwap();
  expect(rowIds()).toContain(b);
  expect(spy).not.toHaveBeenCalled();
  return b;
}

function sheetRefused(name: string): void {
  fireEvent.click(button("Add exercise"));
  const s = within(screen.getByRole("dialog"));
  fireEvent.change(s.getByLabelText("Search exercises"), { target: { value: name } });
  fireEvent.click(s.getByRole("button", { name: `Add ${name}` }));
}

describe("AC1 Add after an over-budget swap", () => {
  it("the sheet shows the over-budget copy; B stays; the plan is unchanged; no suggest call", async () => {
    const b = await overBudget();
    const before = rowIds();
    sheetRefused("Lateral raise");
    expect(sheetStatus().textContent).toMatch(overCopy);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(rowIds()).toEqual(before);
    expect(rowIds()).toContain(b);
  });
});

describe("AC2 Shuffle after an over-budget swap", () => {
  it("the plan is unchanged, the status reads the copy, focus stays on Shuffle", async () => {
    await overBudget();
    const before = rowIds();
    const shuffle = button("Shuffle");
    shuffle.focus();
    fireEvent.click(shuffle);
    expect(status().textContent).toMatch(overCopy);
    expect(spy).not.toHaveBeenCalled();
    expect(rowIds()).toEqual(before);
    expect(document.activeElement).toBe(shuffle);
  });
});

describe("AC3 Start with this after an over-budget swap", () => {
  it("nothing changes and the status reads the copy", async () => {
    await overBudget();
    const before = rowIds();
    const tap = button("Start with Inverted row");
    tap.focus();
    fireEvent.click(tap);
    expect(status().textContent).toMatch(overCopy);
    expect(spy).not.toHaveBeenCalled();
    expect(rowIds()).toEqual(before);
    expect(document.querySelectorAll('[data-part="item-row"][data-main="true"]')).toHaveLength(1);
    expect(document.querySelector('[data-main="true"]')!.getAttribute("data-id")).toBe(
      "bench-press",
    );
  });
});

describe("AC4 / addendum a smaller time chip names the dropped swap-in", () => {
  it("B is named in Doesn't fit; the original minutes bring it back", async () => {
    const b = await overBudget();
    const name = document.querySelector(
      `[data-part="item-row"][data-id="${b}"] [data-part="row-name"]`,
    )!.textContent!;
    fireEvent.click(button("20 minutes"));
    expect(lastInput().pinnedIds).toContain(b);
    expect(rowIds()).not.toContain(b);
    expect(doesntFit()!.textContent).toBe(`Doesn't fit in 20 min: ${name}.`);
    fireEvent.click(button("30 minutes"));
    expect(rowIds()).toContain(b);
    expect(doesntFit()).toBeNull();
  });
});

describe("AC5 Add works again once the plan fits", () => {
  it("removing B lifts the guard", async () => {
    const b = await overBudget();
    const name = document.querySelector(
      `[data-part="item-row"][data-id="${b}"] [data-part="row-name"]`,
    )!.textContent!;
    fireEvent.click(button(`Remove ${name}`));
    fireEvent.click(button("Add exercise"));
    const s = within(screen.getByRole("dialog"));
    fireEvent.change(s.getByLabelText("Search exercises"), { target: { value: "Lateral raise" } });
    fireEvent.click(s.getByRole("button", { name: "Add Lateral raise" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(rowIds()).toContain("lateral-raise");
  });
});

describe("AC6 a swap that fits behaves as today", () => {
  it("Add, Shuffle and Start with this are not refused", async () => {
    await toPlan();
    fireEvent.click(button("Swap Inverted row"));
    const group = await screen.findByRole("radiogroup", { name: "Replacement" });
    fireEvent.click(
      within(group.querySelector<HTMLElement>('[data-id="db-row"]')!).getByRole("radio"),
    );
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Use / }));
    await waitFor(() => expect(screenIds()).toEqual(["UF-08.2"]));
    fireEvent.click(button("Shuffle"));
    expect(status().textContent).not.toMatch(/min over/);
    expect(spy).toHaveBeenCalledTimes(1);
    fireEvent.click(button("Start with Db row"));
    expect(status().textContent).not.toMatch(/min over/);
    expect(spy).toHaveBeenCalledTimes(2);
    fireEvent.click(button("Add exercise"));
    const s = within(screen.getByRole("dialog"));
    fireEvent.change(s.getByLabelText("Search exercises"), { target: { value: "Lateral raise" } });
    fireEvent.click(s.getByRole("button", { name: "Add Lateral raise" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(spy).toHaveBeenCalledTimes(3);
  });
});
