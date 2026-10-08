// T-0574 UF-08.5 Add exercise (part 2), AC1-AC7 (docs/tickets/T-0574): disabled row states with
// the right reason, the two cap refusals, Remove of an added item and re-adding a removed one.
// Loaders mocked; the real engine runs behind spies.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { removeItem, suggest, type HistorySet, type Workout } from "@workoutlab/engine";
import { NOW } from "./fixtures.js";
import { fProfile } from "./fixtures.js";
import {
  fCache,
  fitLine,
  renderSetup,
  screenIds,
  serveCache,
  setOnline,
  settle,
} from "./harness.js";

const stored = vi.hoisted(() => ({ ids: [] as string[] }));
vi.mock("../../../lib/auth/auth-context.js", () => ({
  useAuth: () => ({ status: "signed-in", userId: "A" }),
}));
vi.mock("../../../lib/offline/excluded-hooks.js", () => ({
  useExcludedList: () => ({ ids: stored.ids, loaded: true }),
  useOnline: () => false,
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
  return { ...actual, suggest: vi.fn(actual.suggest), removeItem: vi.fn(actual.removeItem) };
});

const spy = vi.mocked(suggest);
const removeSpy = vi.mocked(removeItem);

beforeEach(async () => {
  const actual = await vi.importActual<typeof import("@workoutlab/engine")>("@workoutlab/engine");
  spy.mockReset();
  spy.mockImplementation(actual.suggest);
  removeSpy.mockReset();
  removeSpy.mockImplementation(actual.removeItem);
  stored.ids = [];
  setOnline(false);
  serveCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const button = (name: string) => screen.getByRole("button", { name });
const lastInput = () => spy.mock.lastCall![4];
const lastWorkout = () => spy.mock.results.at(-1)!.value as Workout;
const rowNames = () =>
  Array.from(document.querySelectorAll('[data-part="item-row"] [data-part="row-name"]')).map(
    (n) => n.textContent,
  );
const dialog = () => screen.getByRole("dialog");
const sheetStatus = () => document.querySelector('[data-part="sheet-status"]')!;
const removedLine = () =>
  screen.getAllByRole("status").find((el) => el.matches('[data-part="removed-line"]'))!;

async function loaded(): Promise<void> {
  await waitFor(() => expect(fitLine().textContent).toMatch(/^(Fits|Nothing)/));
}

interface PlanOptions {
  minutes?: number;
  skip?: string[];
}

/** UF-08.1 → minutes (a chip, then the stepper for 120) → Skip today chips → Suggest. */
async function toPlan({ minutes = 30, skip = [] }: PlanOptions = {}): Promise<void> {
  renderSetup();
  await loaded();
  fireEvent.click(button(`${Math.min(minutes, 90)} minutes`));
  for (let m = 90; m < minutes; m += 5) fireEvent.click(button("5 minutes more"));
  for (const area of skip) fireEvent.click(screen.getByRole("button", { name: area }));
  await settle();
  fireEvent.click(button("Suggest my workout"));
  expect(screenIds()).toEqual(["UF-08.2"]);
  spy.mockClear();
}

function openSheet(): void {
  fireEvent.click(button("Add exercise"));
}

function search(text: string): void {
  fireEvent.change(within(dialog()).getByLabelText("Search exercises"), {
    target: { value: text },
  });
}

/** The sheet's row for exactly `name`. */
function pickRow(name: string): HTMLElement {
  const row = Array.from(dialog().querySelectorAll<HTMLElement>('[data-part="pick-row"]')).find(
    (r) => r.querySelector(".wl-uf08__pick-name")?.textContent === name,
  );
  if (row === undefined) throw new Error(`no row ${name}`);
  return row;
}

async function addVia(name: string): Promise<void> {
  openSheet();
  search(name);
  fireEvent.click(within(pickRow(name)).getByRole("button", { name: `Add ${name}` }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}

function hardSets(exerciseId: string, count: number, at: string): HistorySet[] {
  return Array.from({ length: count }, (_, i) => ({
    clientId: `${exerciseId}-${i}`,
    sessionId: "S0",
    exerciseId,
    isWarmup: false,
    completedAt: at,
    editedAt: at,
    deletedAt: null,
    reps: 8,
    weightKg: 40,
    durationS: null,
  }));
}

const hoursBefore = (h: number) => new Date(new Date(NOW).getTime() - h * 3_600_000).toISOString();

/** The disabled-row assertions of AC1 for `name`. */
function expectDisabled(name: string, line: string): void {
  search(name);
  const row = pickRow(name);
  const reason = within(row).getByText(line);
  expect(reason.id).not.toBe("");
  const add = within(row).getByRole("button", { name: `Add ${name}` });
  expect(add).toHaveAttribute("aria-disabled", "true");
  expect(add).toHaveAttribute("aria-describedby", reason.id);
  const before = spy.mock.calls.length;
  fireEvent.click(add);
  expect(spy.mock.calls.length).toBe(before);
  expect(screen.getByRole("dialog")).toBeInTheDocument();
}

describe("AC1 disabled reasons", () => {
  it("In this workout, Excluded, Above your level, Skipping, Recovering; a tap calls nothing; offline", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchSpy);
    try {
      stored.ids = ["dead-bug"];
      serveCache(() => fCache({ history: hardSets("leg-curl", 6, hoursBefore(24)) }));
      await toPlan({ skip: ["Calves"] });
      expect(rowNames()).toContain("Bench press");
      openSheet();
      search("Bench press");
      const bench = pickRow("Bench press");
      expect(within(bench).getByText("In this workout")).toBeInTheDocument();
      expect(within(bench).queryByRole("button")).toBeNull();
      expectDisabled("Dead bug", "Excluded. Include it again in Plan › Excluded exercises.");
      expectDisabled("Pull up", "Above your level");
      expectDisabled("Calf raise", "Skipping Calves today");
      expectDisabled("Leg curl", "Hamstrings is recovering");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("with equipment [] Back squat says Not available with your equipment", async () => {
    serveCache(() => fCache({ profile: fProfile({ equipment: [] }) }));
    await toPlan();
    openSheet();
    expectDisabled("Back squat", "Not available with your equipment");
  });

  it("an exercise that is both above level and short of equipment says equipment (first match)", async () => {
    serveCache(() => fCache({ profile: fProfile({ equipment: [] }) }));
    await toPlan();
    openSheet();
    expectDisabled("Pull up", "Not available with your equipment");
  });
});

describe("AC2 no history, or 10 days off", () => {
  it.each([
    ["empty history", []],
    ["6 leg-curl sets 10 days ago", hardSets("leg-curl", 6, hoursBefore(240))],
  ])("%s: Leg curl has Add enabled and no reason line", async (_name, history) => {
    serveCache(() => fCache({ history }));
    await toPlan();
    openSheet();
    search("Leg curl");
    const row = pickRow("Leg curl");
    expect(within(row).getByRole("button", { name: "Add Leg curl" })).not.toHaveAttribute(
      "aria-disabled",
    );
    expect(row.querySelector('[data-part="pick-reason"]')).toBeNull();
  });
});

describe("AC3 area cap", () => {
  it("main bench press + added DB bench press at 90 min: push-up is refused for Chest", async () => {
    await toPlan({ minutes: 90 });
    await addVia("Db bench press");
    const before = rowNames();
    spy.mockClear();
    openSheet();
    search("Push up");
    fireEvent.click(within(pickRow("Push up")).getByRole("button", { name: "Add Push up" }));
    expect(sheetStatus()).toHaveTextContent("This workout already has two Chest exercises.");
    expect(sheetStatus().textContent).not.toMatch(/fit in/);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(rowNames()).toEqual(before);
  });
});

describe("AC4 8-item cap", () => {
  it("main + 7 added at 120 min: a ninth is refused with the 8-exercise copy", async () => {
    await toPlan({ minutes: 120 });
    // The greedy fill may already hold some of these, so each add takes the first pool entry
    // that is not in the plan and keeps every primary area at two or fewer pins.
    const pool: [string, string[]][] = [
      ["Db bench press", ["chest"]],
      ["Barbell row", ["back"]],
      ["Db row", ["back"]],
      ["Lateral raise", ["shoulders"]],
      ["Overhead press", ["shoulders"]],
      ["Biceps curl", ["arms"]],
      ["Plank", ["core"]],
      ["Dead bug", ["core"]],
      ["Hip thrust", ["glutes"]],
      ["Leg extension", ["quads"]],
      ["Calf raise", ["calves"]],
      ["Romanian deadlift", ["hamstrings"]],
      ["Leg curl", ["hamstrings"]],
    ];
    const held = new Map<string, number>([["chest", 1]]);
    for (let added = 0; added < 7; added += 1) {
      const inPlan = new Set(rowNames());
      const pick = pool.find(
        ([n, areas]) => !inPlan.has(n) && areas.every((a) => (held.get(a) ?? 0) < 2),
      )!;
      await addVia(pick[0]);
      for (const a of pick[1]) held.set(a, (held.get(a) ?? 0) + 1);
    }
    expect(rowNames()).toHaveLength(8);
    const before = rowNames();
    openSheet();
    const ninth = pool.find(
      ([n, areas]) => !rowNames().includes(n) && areas.every((a) => (held.get(a) ?? 0) < 2),
    )![0];
    search(ninth);
    fireEvent.click(within(pickRow(ninth)).getByRole("button", { name: `Add ${ninth}` }));
    expect(sheetStatus()).toHaveTextContent("This workout has 8 exercises, the most it can hold.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(rowNames()).toEqual(before);
  });
});

describe("AC5 remove an added item", () => {
  it("removeItem, no suggest, bench x4 + pulldown x2, Removed line, addedIds empty, chip keeps it out", async () => {
    await toPlan();
    await addVia("Back squat");
    spy.mockClear();
    removeSpy.mockClear();
    fireEvent.click(button("Remove Back squat"));
    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(spy).not.toHaveBeenCalled();
    expect(rowNames()).toEqual(["Bench press", "Straight arm pulldown"]);
    const details = Array.from(
      document.querySelectorAll('[data-part="item-row"] [data-part="row-detail"]'),
    ).map((n) => n.textContent);
    expect(details[0]).toMatch(/^4 /);
    expect(details[1]).toMatch(/^2 /);
    expect(removedLine()).toHaveTextContent("Back squat");
    expect(
      within(removedLine()).getByRole("button", { name: "Never suggest Back squat" }),
    ).toBeInTheDocument();
    fireEvent.click(button("45 minutes"));
    expect(lastInput().pinnedIds).toEqual([]);
    expect(rowNames()).not.toContain("Back squat");
  });
});

describe("AC6 re-add", () => {
  it("adding Back squat again: excludeIds lacks it, it is in the plan, gone from Removed", async () => {
    await toPlan();
    await addVia("Back squat");
    fireEvent.click(button("Remove Back squat"));
    expect(removedLine()).toHaveTextContent("Back squat");
    spy.mockClear();
    openSheet();
    search("Back squat");
    expect(
      within(pickRow("Back squat")).getByRole("button", { name: "Add Back squat" }),
    ).not.toHaveAttribute("aria-disabled");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await addVia("Back squat");
    expect(lastInput().excludeIds).not.toContain("back-squat");
    expect(rowNames()).toContain("Back squat");
    expect(removedLine()).not.toHaveTextContent("Back squat");
  });

  it("an exercise removed on this visit is listed with Add enabled", async () => {
    await toPlan();
    fireEvent.click(button("Remove Leg extension"));
    openSheet();
    search("Leg extension");
    const row = pickRow("Leg extension");
    expect(within(row).getByRole("button", { name: "Add Leg extension" })).not.toHaveAttribute(
      "aria-disabled",
    );
    expect(row.querySelector('[data-part="pick-reason"]')).toBeNull();
  });

  it("a stored exclusion shows Excluded, never a time refusal", async () => {
    stored.ids = ["leg-extension"];
    await toPlan();
    openSheet();
    expectDisabled("Leg extension", "Excluded. Include it again in Plan › Excluded exercises.");
    expect(sheetStatus()).toBeEmptyDOMElement();
  });
});

describe("AC7 removed main lift", () => {
  it("removing an added main lift leaves mainLiftId null; the next chip re-suggests one", async () => {
    await toPlan();
    // T-0575 adds the UI; here the engine's answer to the add is edited so Back squat is main.
    const actual = await vi.importActual<typeof import("@workoutlab/engine")>("@workoutlab/engine");
    spy.mockImplementationOnce((...args) => {
      const w = actual.suggest(...args);
      return {
        ...w,
        plan: {
          ...w.plan,
          mainLiftId: "back-squat",
          items: w.plan.items.map((i) => ({ ...i, isMain: i.exerciseId === "back-squat" })),
        },
      };
    });
    await addVia("Back squat");
    fireEvent.click(button("Remove Back squat"));
    expect(removeSpy.mock.results.at(-1)!.value.plan.mainLiftId).toBeNull();
    spy.mockClear();
    fireEvent.click(button("45 minutes"));
    expect(lastInput().mainLiftId).toBeNull();
    expect(lastWorkout().plan.mainLiftId).not.toBeNull();
  });
});
