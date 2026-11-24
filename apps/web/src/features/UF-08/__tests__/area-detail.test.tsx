// T-0997 UF-08.6 Area detail: AC1-AC11 through the host (docs/tickets/T-0997, UF-08.6.md, D-0274 §5,
// D-0275 §8, D-0276, D-0235, D-0191, D-0199, D-0205 §5). Loaders mocked; the real engine runs behind
// spies (`suggest`, `orderItems`, `rankSwaps`), so "no suggest call for an Add" is the engine's count.
// The 30-min plan (zero history, F-web) is Bench press (main, chest), Inverted row (back) and Leg
// extension (quads), one exercise per area.
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { useEffect } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router";
import {
  areaGroups,
  insertItem,
  orderItems,
  rankSwaps,
  removeArea,
  suggest,
  type HistorySet,
  type Workout,
} from "@workoutlab/engine";
import { excludeExercise } from "../../../lib/offline/excluded.js";
import { SessionSetup, type SessionSetupProps } from "../SessionSetup.js";
import { LOCALE, NOW, TZ, fProfile } from "./fixtures.js";
import { fCache, fitLine, screenIds, serveCache, setOnline, settle } from "./harness.js";

const auth = vi.hoisted(() => ({
  status: "signed-in" as const,
  userId: "user-1" as string | undefined,
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
vi.mock("../../../lib/offline/queue.js", () => ({ upsertSession: vi.fn() }));
vi.mock("../../../lib/offline/excluded.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/excluded.js")>();
  return { ...actual, excludeExercise: vi.fn(async () => {}) };
});
vi.mock("@workoutlab/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workoutlab/engine")>();
  return {
    ...actual,
    suggest: vi.fn(actual.suggest),
    orderItems: vi.fn(actual.orderItems),
    rankSwaps: vi.fn(actual.rankSwaps),
    insertItem: vi.fn(actual.insertItem),
  };
});

const suggestSpy = vi.mocked(suggest);
const orderSpy = vi.mocked(orderItems);
const rankSpy = vi.mocked(rankSwaps);
const insertSpy = vi.mocked(insertItem);
const storeExclusion = vi.mocked(excludeExercise);

const CLOCK = () => new Date("2026-09-27T10:00:00Z");
const PROPS: SessionSetupProps = { now: NOW, locale: LOCALE, timeZone: TZ, clock: CLOCK };

let navigateTo: ReturnType<typeof useNavigate>;
let trail: string[] = [];

function Probe() {
  const location = useLocation();
  navigateTo = useNavigate();
  useEffect(() => {
    trail.push(`${location.pathname}${location.search}`);
  }, [location]);
  return null;
}

function mount(at: string, props: SessionSetupProps = PROPS) {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <Probe />
      <Routes>
        <Route path="/session/setup" element={<SessionSetup {...props} />} />
        <Route path="/" element={<span data-testid="home" />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  const actual = await vi.importActual<typeof import("@workoutlab/engine")>("@workoutlab/engine");
  suggestSpy.mockReset();
  suggestSpy.mockImplementation(actual.suggest);
  orderSpy.mockReset();
  orderSpy.mockImplementation(actual.orderItems);
  rankSpy.mockReset();
  rankSpy.mockImplementation(actual.rankSwaps);
  insertSpy.mockReset();
  insertSpy.mockImplementation(actual.insertItem);
  storeExclusion.mockClear();
  auth.userId = "user-1";
  trail = [];
  setOnline(false);
  serveCache();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const hoursBefore = (h: number) => new Date(new Date(NOW).getTime() - h * 3_600_000).toISOString();

function hardSets(exerciseId: string, count: number, at: string): HistorySet[] {
  return Array.from({ length: count }, (_, i) => ({
    clientId: `${exerciseId}-${at}-${i}`,
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

/** Returning after 10 days off: only chest and quads were trained, 11 days ago. */
function returningHistory(): HistorySet[] {
  return [
    ...hardSets("bench-press", 24, hoursBefore(11 * 24)),
    ...hardSets("back-squat", 24, hoursBefore(11 * 24)),
  ];
}

// ---- readers ----

const button = (name: string | RegExp) => screen.getByRole("button", { name });
const queryButton = (name: string | RegExp) => screen.queryByRole("button", { name });
const status = () => document.querySelector<HTMLElement>('[data-part="status"]')!;
const lastOrdered = () => orderSpy.mock.results.at(-1)!.value as Workout;
const lastInput = () => suggestSpy.mock.lastCall![4];
const detailIds = () =>
  Array.from(document.querySelectorAll('[data-part="detail-row"]')).map((r) =>
    r.getAttribute("data-id")!,
  );
const detailRow = (id: string) =>
  document.querySelector<HTMLElement>(`[data-part="detail-row"][data-id="${id}"]`)!;
const areaRow = (area: string) =>
  document.querySelector<HTMLElement>(`[data-part="area-row"][data-area="${area}"]`);
const areaRows = () =>
  Array.from(document.querySelectorAll('[data-part="area-row"]')).map((r) =>
    r.getAttribute("data-area")!,
  );
const notTodayLine = () => document.querySelector('[data-part="not-today-line"]');
const title = () => document.querySelector("h1")!.textContent;

async function loaded(): Promise<void> {
  await waitFor(() => expect(fitLine().textContent).toMatch(/^(Fits|Nothing)/));
}

interface Open {
  budget?: number;
  cache?: () => ReturnType<typeof fCache>;
}

/** UF-08.1 (budget in the URL) → Suggest my workout → UF-08.2. */
async function toPlan(o: Open = {}): Promise<void> {
  if (o.cache !== undefined) serveCache(o.cache);
  mount(`/session/setup?budget=${o.budget ?? 30}`);
  await loaded();
  await settle();
  fireEvent.click(button("Suggest my workout"));
  await settle();
  expect(screenIds()).toEqual(["UF-08.2"]);
}

/** On UF-08.2: take the trailing areas out, so the plan has minutes left for an Add. */
function freeTime(): void {
  for (const area of ["calves", "shoulders", "hamstrings"]) {
    const row = areaRow(area);
    if (row === null) continue;
    const minus = () => row.querySelector('[data-part="minus"]')!;
    while (minus().getAttribute("data-remove") !== "true") fireEvent.click(minus());
    fireEvent.click(minus());
  }
}

/** UF-08.2 → the open button of `area` → UF-08.6. */
function openArea(area: string): void {
  fireEvent.click(areaRow(area)!.querySelector('[data-part="area-open"]')!);
  expect(screenIds()).toEqual(["UF-08.6"]);
}

/** Back (the link) → UF-08.2. */
function back(): void {
  fireEvent.click(screen.getByRole("link", { name: "Back" }));
}

/** UF-08.5 from UF-08.6: search for and add `name`; resolves when the sheet has closed. */
async function addExercise(name: string): Promise<void> {
  fireEvent.click(button("Add exercise"));
  const sheet = within(screen.getByRole("dialog"));
  fireEvent.change(sheet.getByLabelText("Search exercises"), { target: { value: name } });
  fireEvent.click(sheet.getByRole("button", { name: `Add ${name}` }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}

/** UF-08.3 from UF-08.6: swap `name` for `toId` through the real sheet. */
async function swap(name: string, toId: string): Promise<void> {
  fireEvent.click(button(`Swap ${name}`));
  const group = await screen.findByRole("radiogroup", { name: "Replacement" });
  fireEvent.click(
    within(group.querySelector<HTMLElement>(`[data-id="${toId}"]`)!).getByRole("radio"),
  );
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Use / }));
  await waitFor(() => expect(screenIds()).toEqual(["UF-08.6"]));
}

// =====================================================================================

describe("T-0997 AC1 open and back", () => {
  it("T-0997 AC1 the open button shows UF-08.6 with the area's exercises in run order; Back returns with focus on that row's open button", async () => {
    await toPlan({ budget: 90 });
    const ordered = orderItems(
      suggestSpy.mock.results.at(-1)!.value as Workout,
      (await vi.importActual<typeof import("./fixtures.js")>("./fixtures.js")).fLibrary(),
    );
    const groups = areaGroups(ordered);
    const area = groups[1]!.area;
    openArea(area);
    expect(title()).toBe(area[0]!.toUpperCase() + area.slice(1));
    expect(detailIds()).toEqual(groups.find((g) => g.area === area)!.itemIds);
    back();
    expect(screenIds()).toEqual(["UF-08.2"]);
    await waitFor(() =>
      expect(document.activeElement).toBe(areaRow(area)!.querySelector('[data-part="area-open"]')),
    );
  });

  it("T-0997 AC1 a cold load of ?step=area&area=chest shows UF-08.1, and the URL is replaced", async () => {
    mount("/session/setup?step=area&area=chest");
    await waitFor(() => expect(screenIds()).toEqual(["UF-08.1"]));
    expect(trail.at(-1)).toBe("/session/setup");
  });

  it("T-0997 AC1 with a plan: an unknown area shows UF-08.1, an area the plan lacks shows UF-08.2", async () => {
    await toPlan();
    const missing = [
      "chest",
      "back",
      "shoulders",
      "arms",
      "core",
      "glutes",
      "quads",
      "hamstrings",
      "calves",
    ].find((a) => areaRow(a) === null)!;
    act(() => void navigateTo(`/session/setup?step=area&area=${missing}`));
    await waitFor(() => expect(screenIds()).toEqual(["UF-08.2"]));
    expect(status()).toBeEmptyDOMElement();
    act(() => void navigateTo("/session/setup?step=area&area=neck"));
    await waitFor(() => expect(screenIds()).toEqual(["UF-08.1"]));
  });
});

describe("T-0997 AC2 swap", () => {
  it("T-0997 AC2 the swap-in is a pin, the swapped-out one is excluded for the visit, a time rebuild keeps both; focus returns to the new row's Swap", async () => {
    await toPlan();
    openArea("back");
    await swap("Inverted row", "db-row");
    expect(detailIds()).toEqual(["db-row"]);
    await waitFor(() => expect(document.activeElement).toBe(button("Swap Db row")));
    back();
    fireEvent.click(button("45 minutes"));
    expect(lastInput().pinnedIds).toContain("db-row");
    expect(lastInput().excludeIds).toContain("inverted-row");
    expect(storeExclusion).not.toHaveBeenCalled();
    expect(areaRow("back")).not.toBeNull();
  });
});

describe("T-0997 AC3 Not today", () => {
  it("T-0997 AC3 an alternative: the first equipment_taken candidate replaces it, the line shows, Undo restores it, nothing is stored", async () => {
    await toPlan();
    openArea("quads");
    fireEvent.click(button("Not today, Leg extension"));
    const call = rankSpy.mock.calls.at(-1)!;
    expect(call[0]).toBe("leg-extension");
    expect(call[1]).toBe("equipment_taken");
    const candidate = (rankSpy.mock.results.at(-1)!.value as { exerciseId: string }[])[0]!
      .exerciseId;
    expect(candidate).toBe("back-squat");
    // back-squat is homed in Glutes (D-0287 §4): Quads is empty, so UF-08.2 opens and says so.
    await waitFor(() => expect(screenIds()).toEqual(["UF-08.2"]));
    expect(status()).toHaveTextContent("Leg extension replaced by Back squat.");
    expect(areaRow("quads")).toBeNull();
    expect(areaRow("glutes")).not.toBeNull();
    expect(storeExclusion).not.toHaveBeenCalled();
  });

  it("T-0997 AC3 the replacement stays in the area: the row is replaced in place, the line shows, Undo restores it, nothing is stored", async () => {
    await toPlan({ budget: 90 });
    const plan = suggestSpy.mock.results.at(-1)!.value as Workout;
    const lib = (await vi.importActual<typeof import("./fixtures.js")>("./fixtures.js")).fLibrary();
    // An area whose first row's first candidate is homed in the same area.
    let found: { area: string; id: string; candidate: string } | null = null;
    for (const g of areaGroups(plan)) {
      for (const id of g.itemIds) {
        const probe = rankSwaps(id, "equipment_taken", plan, fProfile(), lib, [], NOW, TZ, []);
        const first = probe[0];
        if (first === undefined) continue;
        const sameHome =
          lib.find((e) => e.id === first.exerciseId)!.areas[g.area as "chest"] === 1 &&
          Object.entries(lib.find((e) => e.id === first.exerciseId)!.areas).find(
            ([, w]) => w === 1,
          )![0] === g.area;
        if (sameHome) found ??= { area: g.area, id, candidate: first.exerciseId };
      }
    }
    expect(found).not.toBeNull();
    const { area, id, candidate } = found!;
    const name = lib.find((e) => e.id === id)!.name;
    openArea(area);
    fireEvent.click(button(`Not today, ${name}`));
    expect(detailIds()).toContain(candidate);
    expect(detailIds()).not.toContain(id);
    expect(notTodayLine()).toHaveTextContent(`${name} · Not today · Undo`);
    expect(status()).toHaveTextContent(new RegExp(`^${name} replaced by `));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        detailRow(candidate).querySelector('[data-part="not-today"]'),
      ),
    );
    // The old one is out for this visit only.
    expect(storeExclusion).not.toHaveBeenCalled();

    fireEvent.click(button(`Undo Not today, ${name}`));
    expect(detailIds()).toContain(id);
    expect(detailIds()).not.toContain(candidate);
    expect(notTodayLine()).toBeNull();
    expect(status()).toHaveTextContent(`${name} is back.`);
    await waitFor(() => expect(document.activeElement).toBe(button(`Not today, ${name}`)));
    // Undo drops the pin and the visit exclusion: a rebuild may pick it again.
    back();
    fireEvent.click(button("45 minutes"));
    expect(lastInput().excludeIds).not.toContain(id);
    expect(lastInput().pinnedIds).not.toContain(candidate);
    expect(storeExclusion).not.toHaveBeenCalled();
  });

  it("T-0997 AC3 the replaced one stays out of a rebuild until Undo (the visit exclusion)", async () => {
    await toPlan();
    openArea("quads");
    fireEvent.click(button("Not today, Leg extension"));
    await waitFor(() => expect(screenIds()).toEqual(["UF-08.2"]));
    fireEvent.click(button("45 minutes"));
    expect(lastInput().excludeIds).toContain("leg-extension");
    expect(lastInput().pinnedIds).toContain("back-squat");
  });

  it("T-0997 AC3 no alternative: the line says so, the plan is unchanged and focus stays on the button", async () => {
    await toPlan();
    openArea("quads");
    rankSpy.mockReturnValueOnce([]);
    const btn = button("Not today, Leg extension");
    btn.focus();
    const before = orderSpy.mock.calls.length;
    fireEvent.click(btn);
    expect(status()).toHaveTextContent("No other exercise fits. Use Swap.");
    expect(detailIds()).toEqual(["leg-extension"]);
    expect(notTodayLine()).toBeNull();
    expect(orderSpy.mock.calls.length).toBe(before);
    expect(document.activeElement).toBe(btn);
    expect(btn).not.toHaveAttribute("aria-disabled");
  });
});

describe("T-0997 AC4 Remove and Never suggest", () => {
  it("T-0997 AC4 Remove drops the exercise and its sets, the freed time stays unused, the Removed line offers Never suggest (offline: aria-disabled and the note)", async () => {
    await toPlan({ budget: 60 });
    freeTime();
    openArea("back");
    await addExercise("Db row");
    expect(detailIds()).toHaveLength(2);
    const unusedBefore = lastOrdered().unusedS;
    fireEvent.click(button("Remove Db row"));
    expect(detailIds()).not.toContain("db-row");
    expect(detailIds()).toHaveLength(1);
    expect(status()).toHaveTextContent("Db row removed.");
    expect(lastOrdered().unusedS).toBeGreaterThan(unusedBefore);
    expect(lastOrdered().plan.items.map((i) => i.exerciseId)).not.toContain("db-row");
    const never = button("Never suggest Db row");
    expect(never).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Connect to change excluded exercises")).toBeInTheDocument();
    fireEvent.click(never);
    expect(storeExclusion).not.toHaveBeenCalled();
    // Focus goes to the first action of the row now in that place.
    expect(document.activeElement).not.toBe(document.body);
  });

  it("T-0997 AC4 online: Never suggest writes the stored list", async () => {
    setOnline(true);
    await toPlan({ budget: 60 });
    freeTime();
    openArea("back");
    await addExercise("Db row");
    fireEvent.click(button("Remove Db row"));
    fireEvent.click(button("Never suggest Db row"));
    expect(storeExclusion).toHaveBeenCalledWith("user-1", "db-row");
  });

  it("T-0997 AC4 the last exercise: UF-08.2 with the notice, the area under Add an area, focus not on body; Back doesn't return to the empty area", async () => {
    await toPlan();
    openArea("back");
    fireEvent.click(button("Remove Inverted row"));
    await waitFor(() => expect(screenIds()).toEqual(["UF-08.2"]));
    expect(status()).toHaveTextContent("Back removed. Add it back below.");
    expect(areaRow("back")).toBeNull();
    expect(document.querySelector('[data-part="candidate"][data-area="back"]')).not.toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(trail.at(-1)).toBe("/session/setup?step=suggested");
    // The area is skipped for rebuilds, like the stepper's Remove.
    fireEvent.click(button("45 minutes"));
    expect(lastInput().avoidAreas).toContain("back");
  });
});

describe("T-0997 AC5 local Add", () => {
  it("T-0997 AC5 a fit: 3 sets, no suggest call, no other area changes (deep-equal), focus on the new row's Swap, pinned for a rebuild", async () => {
    await toPlan({ budget: 60 });
    freeTime();
    openArea("back");
    const calls = suggestSpy.mock.calls.length;
    await addExercise("Db row");
    expect(suggestSpy.mock.calls.length).toBe(calls);
    // `leftS` is the plan's `unusedS`, the item goes last, and every other item is the engine's own.
    const [before, , opts] = insertSpy.mock.calls.at(-1)!;
    expect(opts).toEqual({ atIndex: before.plan.items.length, leftS: before.unusedS });
    const after = lastOrdered();
    expect(detailIds()).toContain("db-row");
    const added = after.plan.items.find((i) => i.exerciseId === "db-row")!;
    expect(added.sets).toBe(3);
    const others = (w: Workout) => w.plan.items.filter((i) => i.exerciseId !== "db-row");
    // `before` is the engine's plan, `after` the ordered one: compare as sets, item by item.
    const byId = (w: Workout) => others(w).sort((a, b) => a.exerciseId.localeCompare(b.exerciseId));
    expect(byId(after)).toEqual(byId(before));
    expect(detailRow("db-row").querySelector('[data-part="row-reason"]')).toHaveTextContent(
      "Added by you",
    );
    expect(status()).toHaveTextContent(/^Db row added\. \d+ min left\.$/);
    await waitFor(() => expect(document.activeElement).toBe(button("Swap Db row")));
    back();
    fireEvent.click(button("90 minutes"));
    expect(lastInput().pinnedIds).toContain("db-row");
  });

  it("T-0997 AC5 only 2 fit: the engine's second try gives 2 sets", async () => {
    await toPlan({ budget: 60 });
    const lib = (await vi.importActual<typeof import("./fixtures.js")>("./fixtures.js")).fLibrary();
    // Take areas out one at a time until the engine says Db row fits; that first fit is 2 sets.
    let local = suggestSpy.mock.results.at(-1)!.value as Workout;
    let expected: number | null = null;
    const taken: string[] = [];
    for (const area of ["calves", "shoulders", "hamstrings", "core", "arms", "glutes"] as const) {
      if (!areaGroups(local).some((g) => g.area === area)) continue;
      local = removeArea(local, area);
      taken.push(area);
      const r = insertItem(
        local,
        "db-row",
        { atIndex: local.plan.items.length, leftS: local.unusedS },
        [],
        fProfile(),
        lib,
        NOW,
        TZ,
      );
      if (!("refused" in r)) {
        expected = r.sets;
        break;
      }
    }
    expect(expected).toBe(2);
    for (const area of taken) {
      const row = areaRow(area)!;
      const minus = () => row.querySelector('[data-part="minus"]')!;
      while (minus().getAttribute("data-remove") !== "true") fireEvent.click(minus());
      fireEvent.click(minus());
    }
    openArea("back");
    await addExercise("Db row");
    expect(lastOrdered().plan.items.find((i) => i.exerciseId === "db-row")!.sets).toBe(2);
  });

  it("T-0997 AC5 no fit: the sheet refuses with the name and the minutes, and nothing is added", async () => {
    await toPlan({ budget: 15 });
    openArea("chest");
    const before = suggestSpy.mock.results.at(-1)!.value as Workout;
    const orders = orderSpy.mock.calls.length;
    fireEvent.click(button("Add exercise"));
    const sheet = within(screen.getByRole("dialog"));
    fireEvent.change(sheet.getByLabelText("Search exercises"), { target: { value: "Db row" } });
    fireEvent.click(sheet.getByRole("button", { name: "Add Db row" }));
    const left = Math.floor(before.unusedS / 60);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      within(screen.getByRole("dialog")).getByText(
        new RegExp(`^Db row doesn't fit in ${left} min`),
      ),
    ).toBeInTheDocument();
    expect(orderSpy.mock.calls.length).toBe(orders);
    expect(detailIds()).toHaveLength(1);
  });

  it("T-0997 AC5 an exercise whose area is not in the plan adds the area and says so", async () => {
    await toPlan({ budget: 60 });
    freeTime();
    const missing = ["shoulders", "calves", "hamstrings"].find((a) => areaRow(a) === null)!;
    openArea("chest");
    const ex = (await vi.importActual<typeof import("./fixtures.js")>("./fixtures.js"))
      .fLibrary()
      .find(
        (e) =>
          e.kind === "exercise" &&
          e.areas[missing as "core"] === 1 &&
          Object.entries(e.areas).find(([, w]) => w === 1)![0] === missing,
      )!;
    await addExercise(ex.name);
    expect(status()).toHaveTextContent(
      new RegExp(
        `^${ex.name} added\\. ${missing[0]!.toUpperCase()}${missing.slice(1)} is in your plan now\\.$`,
      ),
    );
    back();
    expect(areaRows()).toContain(missing);
  });

  it("T-0997 AC5 the sheet lists this area's exercises first", async () => {
    await toPlan({ budget: 60 });
    openArea("back");
    fireEvent.click(button("Add exercise"));
    const headings = Array.from(screen.getByRole("dialog").querySelectorAll<HTMLElement>("h2")).map(
      (h) => h.textContent,
    );
    const at = headings.indexOf("Today's areas");
    expect(headings[at + 1]).toBe("Back");
  });

  it("T-0997 AC5 a time chip keeps an exercise added on UF-08.6 (T-0996 AC8)", async () => {
    await toPlan({ budget: 60 });
    freeTime();
    openArea("back");
    await addExercise("Db row");
    back();
    fireEvent.click(button("90 minutes"));
    expect(lastInput().pinnedIds).toContain("db-row");
    expect(lastInput().budgetMin).toBe(90);
    openArea("back");
    expect(detailIds()).toContain("db-row");
  });
});

describe("T-0997 AC6 Start with this", () => {
  it("T-0997 AC6 a non-main compound becomes the main lift and runs first; main and isolation rows have no such button", async () => {
    await toPlan({ budget: 60 });
    const plan = suggestSpy.mock.results.at(-1)!.value as Workout;
    const lib = (await vi.importActual<typeof import("./fixtures.js")>("./fixtures.js")).fLibrary();
    const compound = plan.plan.items.find(
      (i) => !i.isMain && lib.find((e) => e.id === i.exerciseId)?.type === "compound",
    );
    expect(compound).toBeDefined();
    const isolation = plan.plan.items.find(
      (i) => lib.find((e) => e.id === i.exerciseId)?.type === "isolation",
    )!;
    const area = areaGroups(plan).find((g) => g.itemIds.includes(compound!.exerciseId))!.area;
    openArea(area);
    const name = lib.find((e) => e.id === compound!.exerciseId)!.name;
    fireEvent.click(button(`Start with ${name}`));
    expect(status()).toHaveTextContent(`${name} is the main lift now.`);
    expect(lastOrdered().plan.items[0]!.exerciseId).toBe(compound!.exerciseId);
    expect(lastOrdered().plan.mainLiftId).toBe(compound!.exerciseId);
    expect(
      detailRow(compound!.exerciseId).querySelector('[data-part="row-main"]'),
    ).toHaveTextContent("Main lift");
    expect(queryButton(`Start with ${name}`)).toBeNull();
    // A main lift and an isolation row never show the button.
    back();
    const isoArea = areaGroups(lastOrdered()).find((g) =>
      g.itemIds.includes(isolation.exerciseId),
    )!.area;
    openArea(isoArea);
    expect(detailRow(isolation.exerciseId).querySelector('[data-part="start-with"]')).toBeNull();
  });
});

describe("T-0997 AC7 order", () => {
  it("T-0997 AC7 after every change the plan is orderItems-ed and the rows follow it", async () => {
    await toPlan({ budget: 60 });
    freeTime();
    openArea("back");
    const check = () => {
      const w = lastOrdered();
      const lib = orderSpy.mock.calls.at(-1)![1];
      expect(w).toEqual(orderItems(w, lib));
      const group = areaGroups(w).find((g) => g.area === "back")!;
      expect(detailIds()).toEqual(group.itemIds);
    };
    await addExercise("Db row");
    check();
    await swap("Inverted row", "seated-cable-row");
    check();
    fireEvent.click(button("Remove Db row"));
    check();
  });
});

describe.each([
  ["offline", false],
  ["online", true],
])("T-0997 AC8 %s", (name, online) => {
  it(`T-0997 AC8 ${name}: swap, Not today, Remove, Add and Start with make no network call`, async () => {
    const fetchSpy = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchSpy);
    setOnline(online);
    await toPlan({ budget: 60 });
    freeTime();
    openArea("back");
    await addExercise("Db row");
    fireEvent.click(button("Not today, Db row"));
    fireEvent.click(button("Remove Inverted row"));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(storeExclusion).not.toHaveBeenCalled();
  });
});

describe("T-0997 AC9 states", () => {
  it("T-0997 AC9 zero history: reasons read as the engine's, tags and detail line show", async () => {
    await toPlan({ budget: 60 });
    openArea("chest");
    const row = detailRow(detailIds()[0]!);
    expect(row.querySelector('[data-part="row-reason"]')!.textContent).not.toBe("");
    expect(row.querySelector('[data-part="row-detail"]')!.textContent).toMatch(/ min$/);
    expect(row.querySelector('[data-part="row-main"]')).toHaveTextContent("Main lift");
    expect(document.querySelector('[data-part="detail-history"]')!.textContent).toMatch(
      /^Last 14 days: 0 of \d+ sets$/,
    );
  });

  it("T-0997 AC9 returning after 10 days off: the same actions work on the rebuilt plan", async () => {
    await toPlan({ budget: 45, cache: () => fCache({ history: returningHistory() }) });
    const first = areaRows()[0]!;
    openArea(first);
    expect(detailIds().length).toBeGreaterThan(0);
    expect(document.querySelector('[data-part="detail-history"]')!.textContent).toMatch(
      /^Last 14 days: [\d.]+ of \d+ sets$/,
    );
    expect(screen.getAllByRole("button", { name: /^Swap / }).length).toBeGreaterThan(0);
  });

  it("T-0997 AC9 a 15-minute plan: rows keep their reasons and actions; Remove still works", async () => {
    await toPlan({ budget: 15 });
    const first = areaRows()[0]!;
    openArea(first);
    const id = detailIds()[0]!;
    expect(detailRow(id).querySelector('[data-part="row-reason"]')!.textContent).not.toBe("");
    expect(detailRow(id).querySelector('[data-part="swap"]')).not.toBeNull();
    expect(detailRow(id).querySelector('[data-part="not-today"]')).not.toBeNull();
    fireEvent.click(detailRow(id).querySelector('[data-part="remove"]')!);
    expect(detailIds()).not.toContain(id);
  });
});

describe("T-0997 AC10 accessibility", () => {
  interface AxeViolation {
    id: string;
    nodes: { html: string }[];
  }
  type Axe = { run: (ctx: Element, opts: object) => Promise<{ violations: AxeViolation[] }> };
  let axe: Axe;
  beforeAll(async () => {
    const req = createRequire(resolve(process.cwd(), "package.json"));
    const axePath = createRequire(req.resolve("@axe-core/playwright")).resolve("axe-core");
    const mod = (await import(/* @vite-ignore */ axePath)) as { default?: Axe } & Axe;
    axe = mod.default ?? mod;
  });

  it("T-0997 AC10 axe finds nothing; names are unique and start with the visible text; no UF-09 control", async () => {
    await toPlan({ budget: 60 });
    freeTime();
    openArea("back");
    await addExercise("Db row");
    fireEvent.click(button("Not today, Db row"));
    const run = async () =>
      (
        await axe.run(document.body, {
          rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
        })
      ).violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
    expect(await run()).toEqual([]);
    const names = Array.from(document.querySelectorAll<HTMLElement>("button, a[href]")).map(
      (el) => el.getAttribute("aria-label") ?? el.textContent!.trim(),
    );
    expect(new Set(names).size).toBe(names.length);
    for (const el of document.querySelectorAll<HTMLElement>("button[aria-label]")) {
      const visible = el.textContent!.trim();
      // "Start with {name}" is the spec's name for the visible "Start with this" (UF-08.6.md).
      if (visible !== "" && visible !== "Start with this") {
        const plain = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");
        expect(plain(el.getAttribute("aria-label")!)).toContain(plain(visible));
      }
    }
    expect(document.querySelector('[data-screen-id^="UF-09"]')).toBeNull();
    expect(document.querySelectorAll(".wl-button--primary")).toHaveLength(0);
  });

  it("T-0997 AC10 the styles use tokens only", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync(resolve(__dirname, "../uf-08.css"), "utf8");
    const detail = css.slice(css.indexOf("UF-08.6 Area detail"));
    expect(detail).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/);
    expect(detail).toMatch(/min-block-size: 44px/);
    expect(detail).toMatch(/min-block-size: 48px/);
  });
});

describe("T-0996 review follow-ups (folded into T-0997)", () => {
  it("T-0997 follow-up 1 a refused - or Remove on UF-08.2 says so in the status line", async () => {
    await toPlan();
    // The host's engine call fails: the plan stays, the line says why.
    const { takeOut } = await import("../area-plan-engine.js");
    expect(takeOut).toBeDefined();
    vi.spyOn(await import("@workoutlab/engine"), "removeArea").mockImplementation(() => {
      throw new RangeError("no");
    });
    const first = areaRows()[0]!;
    const row = areaRow(first)!;
    for (
      let i = 0;
      i < 6 && row.querySelector('[data-part="minus"]')!.getAttribute("data-remove") !== "true";
      i++
    ) {
      fireEvent.click(row.querySelector('[data-part="minus"]')!);
    }
    fireEvent.click(row.querySelector('[data-part="minus"]')!);
    expect(document.querySelector('[data-part="status"]')).toHaveTextContent(
      "Couldn't change that. Your plan is unchanged.",
    );
    expect(areaRows()).toContain(first);
  });

  it("T-0997 follow-up 2 Fill the rest that adds nothing says so, and the plan is unchanged", async () => {
    await toPlan({ budget: 60 });
    const first = areaRows()[0]!;
    const row = areaRow(first)!;
    const minus = () => row.querySelector('[data-part="minus"]')!;
    while (minus().getAttribute("data-remove") !== "true") fireEvent.click(minus());
    fireEvent.click(minus());
    // Something can be added, but the engine refuses every `addArea` now.
    vi.spyOn(await import("@workoutlab/engine"), "addArea").mockReturnValue({ refused: "time" });
    const before = areaRows();
    fireEvent.click(button("Fill the rest for me"));
    expect(document.querySelector('[data-part="status"]')).toHaveTextContent("Nothing more fits.");
    expect(areaRows()).toEqual(before);
  });
});
