// T-0943 UF-08.3/UF-08.5/UF-08.6 (D-0240 §3-§4): after a UF-08.3 swap confirmed with
// `fitsBudget: false`, Add and Start with this are refused with the over-budget copy  (T-0998: through UF-08.6; Shuffle and the Doesn't-fit line are retired, and the
// UF-08.2 + / Fill refusals are in area-plan.test.tsx T-0996 AC10). Loaders mocked; the real engine runs behind a
// spy and the real UF-05.1 sheet does the swap. The 30-min plan (F-web, R7-E4) is Bench press
// (main), Inverted row, Leg extension; the sheet offers Db row for Inverted row and Db bench press
// for Bench press.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { suggest } from "@workoutlab/engine";
import { excludeExercise } from "../../../lib/offline/excluded.js";
import {
  fitLine,
  openAddSheetFromArea,
  renderSetup,
  screenIds,
  serveCache,
  setOnline,
  settle,
} from "./harness.js";

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
const status = () => document.querySelector<HTMLElement>('[data-part="status"]')!;
const sheetStatus = () => document.querySelector<HTMLElement>('[data-part="sheet-status"]')!;
const detailIds = () =>
  Array.from(document.querySelectorAll('[data-part="detail-row"]')).map((r) =>
    r.getAttribute("data-id"),
  );
const overCopy = /^Your workout is (\d+) min over\. Remove or swap an exercise first\.$/;

/** UF-08.1 → 30 minutes → Suggest my workout → UF-08.2. */
async function toPlan(): Promise<void> {
  renderSetup();
  await waitFor(() => expect(fitLine().textContent).toMatch(/^Fits/));
  fireEvent.click(button("30 minutes"));
  await settle();
  fireEvent.click(button("Suggest my workout"));
  expect(screenIds()).toEqual(["UF-08.2"]);
  spy.mockClear();
}

function openArea(area: string): void {
  fireEvent.click(
    document.querySelector<HTMLElement>(
      `[data-part="area-row"][data-area="${area}"] [data-part="area-open"]`,
    )!,
  );
}

/** UF-08.2 → UF-08.6 (quads): swap Leg extension for the sheet's over-time replacement; returns its id. */
async function overSwap(): Promise<string> {
  openArea("quads");
  fireEvent.click(button("Swap Leg extension"));
  const group = await screen.findByRole("radiogroup", { name: "Replacement" });
  const overRow = group.querySelector<HTMLElement>('[data-tag="over-time"]')!.closest("label")!;
  const id = overRow.closest<HTMLElement>("[data-id]")!.getAttribute("data-id")!;
  fireEvent.click(within(overRow).getByRole("radio"));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Use / }));
  // The replacement is homed in another area, so Quads is gone and the host shows UF-08.2.
  await waitFor(() => expect(screenIds()).toEqual(["UF-08.2"]));
  return id;
}

describe("AC1 Add after an over-budget swap", () => {
  it("the sheet shows the over-budget copy; B stays; the plan is unchanged; no suggest call", async () => {
    await toPlan();
    await overSwap();
    openAddSheetFromArea("chest");
    const before = detailIds();
    expect(before).toContain("bench-press");
    const s = within(screen.getByRole("dialog"));
    fireEvent.change(s.getByLabelText("Search exercises"), { target: { value: "Leg curl" } });
    fireEvent.click(s.getByRole("button", { name: "Add Leg curl" }));
    expect(sheetStatus().textContent).toMatch(overCopy);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(detailIds()).toEqual(before);
  });
});

describe("AC3 Start with this after an over-budget swap", () => {
  it("nothing changes and the status reads the copy", async () => {
    await toPlan();
    await overSwap();
    openArea("back");
    const before = detailIds();
    fireEvent.click(button("Start with Inverted row"));
    expect(status().textContent).toMatch(overCopy);
    expect(detailIds()).toEqual(before);
    expect(spy).not.toHaveBeenCalled();
    expect(document.querySelectorAll('[data-part="row-main"]')).toHaveLength(0);
  });
});
