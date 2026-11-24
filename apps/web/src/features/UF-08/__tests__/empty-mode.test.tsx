// T-0940 UF-08.1/UF-08.2 "Start empty" (D-0236, D-0237, D-0239 §1; D-0274 §6). Loaders mocked; the
// real engine runs behind a spy with the F-web fixtures (L1, zero history, energy normal, warm-up
// on). T-0998: the empty-mode exercise list (budget line, Suggestions, per-row actions, Add by pins,
// the push-out refusals) is retired; what stays is the entry, the plan call's inputs and that a
// visit is per visit. The area plan's own Start empty cases are in area-plan.test.tsx.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Dexie from "dexie";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { suggest, type SessionInput } from "@workoutlab/engine";
import { offlineDb } from "../../../lib/offline/db.js";
import { fitLine, renderSetup, screenIds, serveCache, setOnline, settle } from "./harness.js";

const auth = vi.hoisted(() => ({ status: "signed-in" as const, userId: "u-t0940" }));
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
vi.mock("@workoutlab/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workoutlab/engine")>();
  return { ...actual, suggest: vi.fn(actual.suggest) };
});

const spy = vi.mocked(suggest);
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  const actual = await vi.importActual<typeof import("@workoutlab/engine")>("@workoutlab/engine");
  spy.mockReset();
  spy.mockImplementation(actual.suggest);
  fetchSpy = vi.fn(() => new Promise<Response>(() => {}));
  vi.stubGlobal("fetch", fetchSpy);
  setOnline(false);
  serveCache();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---- helpers ----

const button = (name: string) => screen.getByRole("button", { name });
const lastInput = (): SessionInput => spy.mock.lastCall![4];
const areaRows = () =>
  Array.from(document.querySelectorAll('[data-part="area-row"]')).map((r) =>
    r.getAttribute("data-area"),
  );

/** UF-08.1 at `minutes` (warm-up as given) → "Start empty" or "Suggest my workout". */
async function open(
  minutes: number,
  how: "Start empty" | "Suggest my workout" = "Start empty",
  warmup = true,
): Promise<void> {
  renderSetup();
  await waitFor(() => expect(fitLine().textContent).toMatch(/^Fits/));
  fireEvent.click(button(`${minutes} minutes`));
  if (!warmup) fireEvent.click(screen.getByRole("checkbox", { name: /Warm-up counts/ }));
  await settle();
  fireEvent.click(button(how));
  expect(screenIds()).toEqual(["UF-08.2"]);
}

// ---- Entry and record ----

describe("AC1 (B1) Start empty at 30 min", () => {
  it("opens UF-08.2 with no area rows and Start workout disabled", async () => {
    await open(30);
    expect(areaRows()).toEqual([]);
    expect(button("Start workout")).toHaveAttribute("aria-disabled", "true");
    // T-0998: no exercise list, no Shuffle, no Suggestions on the empty screen.
    expect(screen.queryByRole("button", { name: "Shuffle" })).toBeNull();
    expect(screen.queryByText("Suggestions")).toBeNull();
  });

  it("UF-08.1: Start empty is the secondary button under Suggest my workout", async () => {
    renderSetup();
    await waitFor(() => expect(fitLine().textContent).toMatch(/^Fits/));
    const primary = button("Suggest my workout");
    const secondary = button("Start empty");
    expect(secondary).toHaveClass("wl-button--secondary");
    expect(secondary).toHaveAttribute("aria-disabled", "false");
    expect(primary.nextElementSibling).toBe(secondary);
  });
});

describe("AC2 (B1 sibling) Suggest my workout is unchanged", () => {
  it("opens the area plan: Chest, Back, Quads, and an enabled Start workout", async () => {
    await open(30, "Suggest my workout");
    expect(areaRows()).toEqual(["chest", "back", "quads"]);
    expect(button("Start workout")).not.toHaveAttribute("aria-disabled", "true");
  });
});

describe("AC4 the empty-mode plan call", () => {
  it("autoMainLift false, fill false, no pins, no main lift, shuffle 0, plus the usual inputs", async () => {
    await open(30);
    expect(lastInput()).toEqual({
      budgetMin: 30,
      warmupInBudget: true,
      energy: "normal",
      shuffle: 0,
      mainLiftId: null,
      pinnedIds: [],
      excludeIds: [],
      favoriteIds: [],
      autoMainLift: false,
      fill: false,
    });
  });

  it("a time chip keeps fill and autoMainLift off and shuffle at 0", async () => {
    await open(30);
    fireEvent.click(button("45 minutes"));
    expect(lastInput()).toMatchObject({ autoMainLift: false, fill: false, shuffle: 0 });
    expect(areaRows()).toEqual([]);
  });
});

describe("AC5 (B19) the mode is per visit", () => {
  it("Back, then Suggest my workout: suggested mode, no pins, no main pick", async () => {
    await open(30);
    fireEvent.click(screen.getByRole("link", { name: "Back" }));
    await waitFor(() => expect(screenIds()).toEqual(["UF-08.1"]));
    await settle();
    fireEvent.click(button("Suggest my workout"));
    expect(screenIds()).toEqual(["UF-08.2"]);
    expect(lastInput().pinnedIds).toEqual([]);
    expect(lastInput().mainLiftId).toBeNull();
    expect(lastInput()).not.toHaveProperty("fill");
    expect(lastInput()).not.toHaveProperty("autoMainLift");
    expect(areaRows()).toEqual(["chest", "back", "quads"]);
    fireEvent.click(button("45 minutes"));
    expect(lastInput().mainLiftId).toBe("bench-press");
    expect(lastInput().pinnedIds).toEqual([]);
  });
});

describe("Review: Start empty while UF-08.1 is still checking what fits", () => {
  it("does nothing until the stored list has answered", async () => {
    const table = offlineDb().excludedCache;
    const realWhere = table.where.bind(table);
    let release!: () => void;
    const gate = new Dexie.Promise<void>((r) => (release = r));
    vi.spyOn(table, "where").mockImplementation(((...args: unknown[]) => {
      if (typeof args[0] !== "object") return (realWhere as (...a: unknown[]) => unknown)(...args);
      const collection = (realWhere as (...a: unknown[]) => ReturnType<typeof realWhere>)(...args);
      return { toArray: () => gate.then(() => collection.toArray()) };
    }) as never);
    renderSetup();
    await settle(100);
    expect(screen.getByText("Checking what fits…")).toBeInTheDocument();
    fireEvent.click(document.querySelector('[data-part="start-empty"]')!);
    await settle();
    expect(screenIds()).toEqual(["UF-08.1"]);
    expect(spy).not.toHaveBeenCalled();
    await act(async () => release());
  });
});
