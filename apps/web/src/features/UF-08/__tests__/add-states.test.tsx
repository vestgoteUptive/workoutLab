// T-0574 UF-08.5 Add exercise (part 2), AC1-AC3 (docs/tickets/T-0574): disabled row states with
// the right reason and the area cap refusal, through UF-08.6 (T-0998). AC4-AC7 (8-item cap by pins,
// Remove of an added item, re-add, removed main lift) pinned the exercise list and re-suggest pins.
// Loaders mocked; the real engine runs behind spies.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { suggest, type HistorySet } from "@workoutlab/engine";
import { NOW } from "./fixtures.js";
import { fProfile } from "./fixtures.js";
import {
  fCache,
  fitLine,
  openAddSheetFromArea,
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
  return { ...actual, suggest: vi.fn(actual.suggest) };
});

const spy = vi.mocked(suggest);

beforeEach(async () => {
  const actual = await vi.importActual<typeof import("@workoutlab/engine")>("@workoutlab/engine");
  spy.mockReset();
  spy.mockImplementation(actual.suggest);
  stored.ids = [];
  setOnline(false);
  serveCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const button = (name: string) => screen.getByRole("button", { name });
const dialog = () => screen.getByRole("dialog");
const sheetStatus = () => document.querySelector('[data-part="sheet-status"]')!;

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

// T-0998: the sheet opens from UF-08.6 (Chest first), the only way to it since the list is gone.
function openSheet(): void {
  openAddSheetFromArea("chest");
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
      expect(document.querySelector('[data-part="area-row"][data-area="chest"]')).not.toBeNull();
      openSheet();
      search("Bench press");
      const bench = pickRow("Bench press");
      expect(within(bench).getByText("In this workout")).toBeInTheDocument();
      expect(within(bench).queryByRole("button")).toBeNull();
      expectDisabled("Dead bug", "Excluded. Include it again in Plan › Excluded exercises.");
      expectDisabled("Pull up", "Above your level. Change it in Plan › Edit plan.");
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

/** On UF-08.2: take the trailing areas out, so the plan has minutes left for an Add. */
function freeTime(): void {
  for (const area of ["calves", "shoulders", "hamstrings", "arms", "core", "glutes"]) {
    const row = document.querySelector<HTMLElement>(`[data-part="area-row"][data-area="${area}"]`);
    if (row === null) continue;
    const minus = () => row.querySelector('[data-part="minus"]')!;
    while (minus().getAttribute("data-remove") !== "true") fireEvent.click(minus());
    fireEvent.click(minus());
  }
}

describe("AC3 area cap", () => {
  it("main bench press + added DB bench press at 90 min: push-up is refused for Chest", async () => {
    await toPlan({ minutes: 90 });
    freeTime();
    await addVia("Db bench press");
    spy.mockClear();
    fireEvent.click(button("Add exercise"));
    search("Push up");
    fireEvent.click(within(pickRow("Push up")).getByRole("button", { name: "Add Push up" }));
    expect(sheetStatus()).toHaveTextContent("This workout already has two Chest exercises.");
    expect(sheetStatus().textContent).not.toMatch(/fit in/);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // T-0998: an Add is local (D-0274 §5), so the refusal is by `insertItem`, never a `suggest` call.
    expect(spy).not.toHaveBeenCalled();
  });
});
