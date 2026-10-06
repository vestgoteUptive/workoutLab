// T-0521 UF-08.2 Remove (D-0191 §4-§5, GitHub #33): the row goes through the engine's
// `removeItem`, with zero `suggest` calls, and nothing refills the freed time. Loaders mocked;
// the real engine runs behind spies that wrap it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { removeItem, suggest, type Workout } from "@workoutlab/engine";
import { Suggested } from "../Suggested.js";
import { fitLine, renderSetup, screenIds, serveCache, setOnline, settle } from "./harness.js";

const auth = vi.hoisted(() => ({ status: "signed-in" as "signed-in" | "stale" | "signed-out" }));
vi.mock("../../../lib/auth/auth-context.js", () => ({ useAuth: () => ({ status: auth.status }) }));
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
  return { ...actual, suggest: vi.fn(actual.suggest), removeItem: vi.fn(actual.removeItem) };
});
vi.mock("../Suggested.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../Suggested.js")>();
  return { Suggested: vi.fn(actual.Suggested) };
});

const spy = vi.mocked(suggest);
const removeSpy = vi.mocked(removeItem);
const view = vi.mocked(Suggested);

beforeEach(async () => {
  auth.status = "signed-in";
  const actual = await vi.importActual<typeof import("@workoutlab/engine")>("@workoutlab/engine");
  spy.mockReset();
  spy.mockImplementation(actual.suggest);
  removeSpy.mockReset();
  removeSpy.mockImplementation(actual.removeItem);
  setOnline(false);
  serveCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const button = (name: string) => screen.getByRole("button", { name });
const shown = () => view.mock.lastCall![0].workout as Workout;
const rowNames = () =>
  Array.from(document.querySelectorAll('[data-part="item-row"] [data-part="row-name"]')).map(
    (n) => n.textContent,
  );
const budgetText = () => document.querySelector('[data-part="budget-text"]')!.textContent;
const unusedS = () => shown().unusedS;
const lastInput = () => spy.mock.lastCall![4];
const lastWorkout = () => spy.mock.results.at(-1)!.value as Workout;

async function loaded(): Promise<void> {
  await waitFor(() => expect(fitLine().textContent).toMatch(/^(Fits|Nothing)/));
}

/** UF-08.1 → 30 min → Suggest: W (bench-press × 4 main, inverted-row, leg-extension). */
async function toW(): Promise<void> {
  renderSetup();
  await loaded();
  fireEvent.click(button("30 minutes"));
  await settle();
  fireEvent.click(button("Suggest my workout"));
  expect(screenIds()).toEqual(["UF-08.2"]);
  spy.mockClear();
}

describe("AC1 no refill", () => {
  it("removes the row only; 0 suggest calls, 1 removeItem; the bar shows the freed time", async () => {
    await toW();
    expect(rowNames()).toEqual(["Bench press", "Inverted row", "Leg extension"]);
    const before = unusedS();
    fireEvent.click(button("Remove Leg extension"));
    expect(rowNames()).toEqual(["Bench press", "Inverted row"]);
    expect(spy).toHaveBeenCalledTimes(0);
    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(budgetText()).toBe("About 25 of 30 min");
    expect(unusedS()).toBe(345);
    expect(unusedS()).toBeGreaterThan(before);
    expect(shown()).toBe(removeSpy.mock.results[0]!.value);
    await settle();
    expect(spy).toHaveBeenCalledTimes(0);
    const unused = document.querySelector('[data-segment="unused"]') as HTMLElement;
    expect(unused.style.flexGrow).toBe("345");
  });
});

describe("AC2 excluded later", () => {
  it("Shuffle after a Remove excludes it and keeps the main lift", async () => {
    await toW();
    fireEvent.click(button("Remove Leg extension"));
    fireEvent.click(button("Shuffle"));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(lastInput().excludeIds).toContain("leg-extension");
    expect(lastInput().mainLiftId).toBe("bench-press");
    expect(rowNames()).not.toContain("Leg extension");
  });

  it("a time chip after a Remove also keeps it excluded (removed rows never silently return)", async () => {
    await toW();
    fireEvent.click(button("Remove Leg extension"));
    fireEvent.click(button("45 minutes"));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(lastInput().excludeIds).toEqual(["leg-extension"]);
    expect(lastWorkout().plan.items.map((i) => i.exerciseId)).not.toContain("leg-extension");
  });
});

describe("AC3 main", () => {
  it("removing the main lift leaves no main row; the next Shuffle has mainLiftId null", async () => {
    await toW();
    fireEvent.click(button("Remove Bench press"));
    expect(spy).toHaveBeenCalledTimes(0);
    expect(rowNames()).toEqual(["Inverted row", "Leg extension"]);
    expect(shown().plan.items.some((i) => i.isMain)).toBe(false);
    fireEvent.click(button("Shuffle"));
    expect(lastInput().mainLiftId).toBeNull();
    expect(lastInput().excludeIds).toContain("bench-press");
  });
});

describe("AC4 emptied", () => {
  it("emptied by Remove: 'No exercises left', Looks good enabled", async () => {
    await toW();
    for (const n of ["Leg extension", "Inverted row", "Bench press"]) {
      fireEvent.click(button(`Remove ${n}`));
    }
    const msg = document.querySelector('[data-part="nothing-fits"]')!;
    expect(msg).toHaveTextContent("No exercises left. Pick a time to rebuild.");
    expect(screen.queryByText(/Nothing fits/)).toBeNull();
    expect(button("Looks good")).toBeEnabled();
    expect(spy).toHaveBeenCalledTimes(0);
  });

  it("a time chip rebuilds an emptied plan with the removed ids still excluded", async () => {
    await toW();
    for (const n of ["Leg extension", "Inverted row", "Bench press"]) {
      fireEvent.click(button(`Remove ${n}`));
    }
    fireEvent.click(button("45 minutes"));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(document.body).not.toHaveTextContent("No exercises left");
    expect(rowNames()).not.toContain("Bench press");
  });

  it("empty from the start keeps 'Nothing fits in 30 min'", async () => {
    renderSetup();
    await loaded();
    fireEvent.click(button("30 minutes"));
    const group = screen.getByRole("group", { name: "Skip today" });
    for (const b of within(group).getAllByRole("button")) fireEvent.click(b);
    fireEvent.click(button("Suggest my workout"));
    expect(document.querySelector('[data-part="nothing-fits"]')).toHaveTextContent(
      "Nothing fits in 30 min",
    );
    expect(button("Looks good")).toBeEnabled();
  });
});

describe("AC5 focus (D-0109 §6)", () => {
  it("middle row: focus lands on the Remove of the row now at that index", async () => {
    await toW();
    const b = button("Remove Inverted row");
    b.focus();
    fireEvent.click(b);
    expect(button("Remove Leg extension")).toHaveFocus();
  });

  it("last row: focus lands on the new last row's Remove", async () => {
    await toW();
    fireEvent.click(button("Remove Leg extension"));
    expect(button("Remove Inverted row")).toHaveFocus();
  });

  it("none left: focus lands on Looks good", async () => {
    await toW();
    for (const n of ["Leg extension", "Inverted row", "Bench press"]) {
      fireEvent.click(button(`Remove ${n}`));
    }
    expect(button("Looks good")).toHaveFocus();
  });
});

describe("AC6 with Skip today", () => {
  it("removing an accessory makes no suggest call and the skipping line stays", async () => {
    renderSetup();
    await loaded();
    fireEvent.click(button("30 minutes"));
    fireEvent.click(
      within(screen.getByRole("group", { name: "Skip today" })).getByRole("button", {
        name: "Quads",
      }),
    );
    await settle();
    fireEvent.click(button("Suggest my workout"));
    spy.mockClear();
    const last = rowNames().at(-1)!;
    fireEvent.click(button(`Remove ${last}`));
    expect(spy).toHaveBeenCalledTimes(0);
    expect(document.querySelector('[data-part="skipping"]')).toHaveTextContent("Quads");
    fireEvent.click(button("Shuffle"));
    expect(lastInput()).toMatchObject({ avoidAreas: ["quads"] });
  });
});
