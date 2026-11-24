// T-0996 UF-08.2 Today's plan, by area: AC1-AC13 through the host (docs/tickets/T-0996, UF-08.2.md,
// D-0274 to D-0276, D-0280 §8, D-0286, D-0287). Loaders mocked; the real engine runs behind spies
// (`suggest`, `orderItems`), so the AC12 count of `suggest` calls is the engine's. Fixtures: zero
// history (the default cache), a balanced week, returning after 10 days off, a 15-minute budget, and
// `navigator.onLine` false and true. AC14 (the deliberate test updates) is in the ticket log.
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { useEffect } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router";
import {
  areaGroups,
  orderItems,
  suggest,
  type Area,
  type HistorySet,
  type Workout,
} from "@workoutlab/engine";
import { upsertSession } from "../../../lib/offline/queue.js";
import { SessionSetup, type SessionSetupProps } from "../SessionSetup.js";
import { LOCALE, NOW, TZ, fLibrary } from "./fixtures.js";
import {
  fCache,
  fitLine,
  screenIds,
  serveCache,
  setOnline,
  settle,
  type CacheContent,
} from "./harness.js";

const auth = vi.hoisted(() => ({ status: "signed-in" as const }));
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
vi.mock("../../../lib/offline/queue.js", () => ({ upsertSession: vi.fn() }));
vi.mock("@workoutlab/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workoutlab/engine")>();
  return {
    ...actual,
    suggest: vi.fn(actual.suggest),
    orderItems: vi.fn(actual.orderItems),
  };
});

const suggestSpy = vi.mocked(suggest);
const orderSpy = vi.mocked(orderItems);
const upsert = vi.mocked(upsertSession);

// 10:00 UTC is 12:00 in Stockholm; "Done by" adds the plan's minutes to this (D-0280 §3).
const CLOCK = () => new Date("2026-09-27T10:00:00Z");
const PROPS: SessionSetupProps = { now: NOW, locale: LOCALE, timeZone: TZ, clock: CLOCK };
const AREA_NAME: Record<string, string> = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  arms: "Arms",
  core: "Core",
  glutes: "Glutes",
  quads: "Quads",
  hamstrings: "Hamstrings",
  calves: "Calves",
};

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
        <Route path="/session/:id" element={<span data-testid="focus-mode" />} />
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
  upsert.mockReset();
  upsert.mockImplementation(async (row) => ({
    id: row.id as string,
    userId: "u",
    row,
    finished: false,
    pending: true,
  }));
  trail = [];
  setOnline(false);
  serveCache();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ---- fixtures ----

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

/** A balanced week: every area trained on day -3, so nothing is recovering. */
function balancedHistory(): HistorySet[] {
  return [
    "bench-press",
    "barbell-row",
    "overhead-press",
    "biceps-curl",
    "plank",
    "hip-thrust",
    "back-squat",
    "leg-curl",
    "calf-raise",
  ].flatMap((id) => hardSets(id, 4, hoursBefore(72)));
}

/** Returning after 10 days off: only chest and quads were trained, 11 days ago, well above target. */
function returningHistory(): HistorySet[] {
  return [
    ...hardSets("bench-press", 24, hoursBefore(11 * 24)),
    ...hardSets("back-squat", 24, hoursBefore(11 * 24)),
  ];
}

// ---- readers ----

const button = (name: string | RegExp) => screen.getByRole("button", { name });
const queryButton = (name: string | RegExp) => screen.queryByRole("button", { name });
const rows = () => Array.from(document.querySelectorAll<HTMLElement>('[data-part="area-row"]'));
const rowAreas = () => rows().map((r) => r.getAttribute("data-area")!);
const row = (area: string) =>
  document.querySelector<HTMLElement>(`[data-part="area-row"][data-area="${area}"]`)!;
const setsOf = (area: string) => row(area).querySelector('[data-part="sets-value"]')!.textContent;
const minus = (area: string) => row(area).querySelector<HTMLElement>('[data-part="minus"]')!;
const plus = (area: string) => row(area).querySelector<HTMLElement>('[data-part="plus"]')!;
const status = () => document.querySelector<HTMLElement>('[data-part="status"]')!;
const candidate = (area: string) =>
  document.querySelector<HTMLElement>(`[data-part="candidate"][data-area="${area}"]`);
const addButton = (area: string) => button(`Add ${AREA_NAME[area]}`);
const lastWorkout = () => suggestSpy.mock.results.at(-1)!.value as Workout;
const lastInput = () => suggestSpy.mock.lastCall![4];
const title = () => document.querySelector("h1")!.textContent;
const startBtn = () => button("Start workout");
const attr = (el: Element, name: string) => el.getAttribute(name);

async function loaded(): Promise<void> {
  await waitFor(() => expect(fitLine().textContent).toMatch(/^(Fits|Nothing)/));
}

interface Open {
  budget?: number;
  /** "Start empty" instead of "Suggest my workout". */
  empty?: boolean;
  cache?: () => CacheContent;
  skip?: string[];
  props?: SessionSetupProps;
}

/** UF-08.1 (budget in the URL, like the Quick 20-min link) → Suggest my workout or Start empty. */
async function toPlan(o: Open = {}): Promise<void> {
  if (o.cache !== undefined) serveCache(o.cache);
  mount(`/session/setup?budget=${o.budget ?? 45}`, o.props ?? PROPS);
  await loaded();
  for (const area of o.skip ?? []) {
    fireEvent.click(
      within(screen.getByRole("group", { name: "Skip today" })).getByRole("button", { name: area }),
    );
  }
  await settle();
  await loaded();
  fireEvent.click(button(o.empty === true ? "Start empty" : "Suggest my workout"));
  await settle();
  expect(screenIds()).toEqual(["UF-08.2"]);
}

/** − until the area's control reads Remove, then Remove. */
function removeArea(area: string): void {
  while (attr(minus(area), "aria-label") !== `Remove ${AREA_NAME[area]}`)
    fireEvent.click(minus(area));
  fireEvent.click(minus(area));
}

// =====================================================================================

describe("T-0996 AC1 title, done-by and the time line", () => {
  it("T-0996 AC1 the default 45-min plan: the h1 lists the areas in the engine's order, Done by, About m of 45", async () => {
    await toPlan();
    const groups = areaGroups(lastWorkout());
    expect(groups.length).toBeGreaterThan(1);
    expect(title()).toBe(`Today: ${groups.map((g) => AREA_NAME[g.area]).join(" · ")}`);
    expect(rowAreas()).toEqual(groups.map((g) => g.area));
    // totalS 2655 s → 45 min after 12:00.
    expect(document.querySelector('[data-part="done-by"]')).toHaveTextContent(/^Done by 12:45$/);
    expect(document.querySelector('[data-part="budget-text"]')).toHaveTextContent(
      /^About 45 of 45 min$/,
    );
  });

  it("T-0996 AC1 Done by follows an edit and the clock is read once at mount", async () => {
    const clock = vi.fn(CLOCK);
    await toPlan({ props: { ...PROPS, clock } });
    const calls = clock.mock.calls.length;
    removeArea("calves");
    expect(document.querySelector('[data-part="done-by"]')).toHaveTextContent(/^Done by 12:\d\d$/);
    expect(document.querySelector('[data-part="done-by"]')!.textContent).not.toBe("Done by 12:45");
    expect(clock.mock.calls.length).toBe(calls);
  });

  it("T-0996 AC1 Start empty: Today: pick your areas, 45 min to fill", async () => {
    await toPlan({ empty: true });
    expect(title()).toBe("Today: pick your areas");
    expect(document.querySelector('[data-part="done-by"]')).toHaveTextContent(/^45 min to fill$/);
    expect(document.querySelector('[data-part="budget-text"]')!.textContent).toMatch(/of 45 min$/);
  });
});

describe("T-0996 AC2 one row per area, no exercise name", () => {
  it("T-0996 AC2 zero history: name, ~m min, − k sets +, history line and exercise count; no exercise names", async () => {
    await toPlan({ budget: 90 });
    const groups = areaGroups(lastWorkout());
    expect(rows()).toHaveLength(groups.length);
    const names = fLibrary().map((e) => e.name);
    groups.forEach((g, i) => {
      const r = rows()[i]!;
      const name = AREA_NAME[g.area]!;
      expect(r.querySelector('[data-part="area-name"]')).toHaveTextContent(name);
      expect(r.querySelector('[data-part="area-minutes"]')).toHaveTextContent(
        `~${Math.ceil(g.costS / 60)} min`,
      );
      expect(r.querySelector('[data-part="area-count"]')).toHaveTextContent(
        g.itemIds.length === 1 ? "1 exercise" : `${g.itemIds.length} exercises`,
      );
      expect(within(r).getByRole("group", { name: `Sets for ${name}` })).toBeInTheDocument();
      expect(setsOf(g.area)).toBe(`${g.sets} sets`);
      expect(r.querySelector('[data-part="area-history"]')!.textContent).toMatch(
        /^Last 14 days: 0 of \d+ sets$/,
      );
      expect(
        attr(
          within(r).getByRole("button", {
            name: /^Chest|^Back|^Shoulders|^Arms|^Core|^Glutes|^Quads|^Hamstrings|^Calves/,
          }),
          "aria-label",
        ),
      ).toBe(
        `${name}, ~${Math.ceil(g.costS / 60)} min, ${g.itemIds.length === 1 ? "1 exercise" : `${g.itemIds.length} exercises`}`,
      );
      for (const exercise of names) expect(r.textContent).not.toContain(exercise);
    });
  });

  it("T-0996 AC2 the open button goes to ?step=area&area=… (UF-08.6 since T-0997); a cold step lands on UF-08.1", async () => {
    await toPlan();
    const first = rows()[0]!.getAttribute("data-area")!;
    fireEvent.click(within(rows()[0]!).getAllByRole("button")[0]!);
    expect(trail).toContain(`/session/setup?step=area&area=${first}`);
    // T-0997 AC11: UF-08.6 exists now, so the open button lands on it (it was UF-08.1 before).
    expect(screenIds()).toEqual(["UF-08.6"]);
    cleanup();
    trail = [];
    mount("/session/setup?step=area&area=chest");
    await waitFor(() => expect(screenIds()).toEqual(["UF-08.1"]));
    expect(trail.at(-1)).toBe("/session/setup");
  });
});

describe("T-0996 AC3 + with room and time, without room, without time", () => {
  it("T-0996 AC3 room and time: + raises the area by one set and the status line says so", async () => {
    await toPlan();
    expect(setsOf("hamstrings")).toBe("2 sets");
    expect(attr(plus("hamstrings"), "aria-disabled")).toBe("true");
    removeArea("calves");
    expect(plus("hamstrings")).not.toHaveAttribute("aria-disabled");
    fireEvent.click(plus("hamstrings"));
    expect(setsOf("hamstrings")).toBe("3 sets");
    expect(status()).toHaveTextContent(/^Hamstrings: 3 sets, \d+ min left\.$/);
    expect(suggestSpy).toHaveBeenCalledTimes(1);
  });

  it("T-0996 AC3 no time: aria-disabled, focusable, a tap changes nothing and the row says why", async () => {
    await toPlan();
    const p = plus("hamstrings");
    expect(attr(p, "aria-disabled")).toBe("true");
    expect(p).not.toBeDisabled();
    p.focus();
    const before = rows().map((r) => r.textContent);
    fireEvent.click(p);
    expect(setsOf("hamstrings")).toBe("2 sets");
    const line = row("hamstrings").querySelector('[data-part="refusal"]')!;
    expect(line).toHaveTextContent(
      "No time for another set. Pick more time or remove a set elsewhere.",
    );
    expect(attr(p, "aria-describedby")).toBe(line.id);
    expect(status()).toHaveTextContent(
      "No time for another set. Pick more time or remove a set elsewhere.",
    );
    expect(document.activeElement).toBe(p);
    expect(rows().map((r) => r.textContent)).toEqual(
      before.map((t, i) => (i === rowAreas().indexOf("hamstrings") ? rows()[i]!.textContent : t)),
    );
  });

  it("T-0996 AC3 no room (the area holds the most it can): the cap line, nothing changes", async () => {
    await toPlan({ budget: 90 });
    expect(setsOf("back")).toBe("6 sets");
    const p = plus("back");
    expect(attr(p, "aria-disabled")).toBe("true");
    fireEvent.click(p);
    expect(setsOf("back")).toBe("6 sets");
    expect(row("back").querySelector('[data-part="refusal"]')).toHaveTextContent(
      "Back already has the most sets it can hold.",
    );
    expect(status()).toHaveTextContent("Back already has the most sets it can hold.");
  });

  it("T-0996 AC3 the aria-disabled look clears without a tap when time frees up", async () => {
    await toPlan();
    expect(attr(plus("hamstrings"), "aria-disabled")).toBe("true");
    removeArea("calves");
    expect(plus("hamstrings")).not.toHaveAttribute("aria-disabled");
  });
});

describe("T-0996 AC4 − and Remove", () => {
  it("T-0996 AC4 3 sets: one set less; 2 sets: the control reads Remove and its name is Remove {Area}", async () => {
    await toPlan();
    expect(setsOf("calves")).toBe("3 sets");
    expect(attr(minus("calves"), "aria-label")).toBe("One set less for Calves");
    fireEvent.click(minus("calves"));
    expect(setsOf("calves")).toBe("2 sets");
    expect(status()).toHaveTextContent(/^Calves: 2 sets, \d+ min left\.$/);
    expect(attr(minus("calves"), "aria-label")).toBe("Remove Calves");
    expect(minus("calves")).toHaveTextContent("Remove");
  });

  it("T-0996 AC4 Remove takes the area out, skips it, lists it under Add an area, and focus moves to the row in its place", async () => {
    await toPlan();
    const order = rowAreas();
    const at = order.indexOf("calves");
    removeArea("calves");
    expect(rowAreas()).toEqual(order.filter((a) => a !== "calves"));
    expect(status()).toHaveTextContent("Calves removed. Add it back below.");
    expect(document.querySelector('[data-part="skipping"]')).toHaveTextContent(
      "Skipping today: Calves",
    );
    expect(candidate("calves")).not.toBeNull();
    expect(addButton("calves")).not.toHaveAttribute("aria-disabled");
    const next = rowAreas()[at]!;
    expect(document.activeElement).toBe(row(next).querySelector('[data-part="area-open"]'));
    expect(title()).not.toContain("Calves");
  });

  it("T-0996 AC4 Remove of the last row: focus goes to the Add an area summary, never body", async () => {
    await toPlan({ budget: 15 });
    expect(rowAreas()).toEqual(["chest"]);
    removeArea("chest");
    expect(rowAreas()).toEqual([]);
    expect(title()).toBe("Today: pick your areas");
    expect(document.activeElement).toBe(screen.getByText("Add an area").closest("summary"));
    expect(document.activeElement).not.toBe(document.body);
  });

  it("T-0996 AC4 the last row of several removed: focus goes to the new last row", async () => {
    await toPlan();
    const order = rowAreas();
    const last = order.at(-1)!;
    removeArea(last);
    expect(document.activeElement).toBe(
      row(order.at(-2)!).querySelector('[data-part="area-open"]'),
    );
  });

  it("T-0996 AC4 D-0287: − that takes an area's second exercise says so and the control still reads − at 3 sets", async () => {
    await toPlan({ budget: 90 });
    expect(setsOf("back")).toBe("6 sets");
    fireEvent.click(minus("back"));
    expect(setsOf("back")).toBe("5 sets");
    expect(status()).toHaveTextContent(/^Back: 5 sets, \d+ min left\.$/);
    fireEvent.click(minus("back"));
    expect(setsOf("back")).toBe("3 sets");
    expect(status()).toHaveTextContent(/^Back: 3 sets, second exercise removed\. \d+ min left\.$/);
    expect(attr(minus("back"), "aria-label")).toBe("One set less for Back");
    expect(row("back").querySelector('[data-part="area-count"]')).toHaveTextContent("1 exercise");
  });
});

describe("T-0996 AC5 Add an area", () => {
  it("T-0996 AC5 Add joins the area with its engine default, the status line says so, focus goes to its +", async () => {
    await toPlan();
    removeArea("calves");
    suggestSpy.mockClear();
    fireEvent.click(addButton("calves"));
    expect(rowAreas()).toContain("calves");
    expect(rowAreas().at(-1)).toBe("calves");
    expect(["2 sets", "3 sets"]).toContain(setsOf("calves"));
    // T-1023 (D-0290): an area removed on this visit comes back as it was.
    expect(status()).toHaveTextContent(/^Calves added back\.$/);
    expect(document.activeElement).toBe(plus("calves"));
    expect(candidate("calves")).toBeNull();
    expect(document.querySelector('[data-part="skipping"]')).toBeNull();
    expect(suggestSpy).not.toHaveBeenCalled();
  });

  /** The reason line, the disabled Add and a tap that adds nothing. */
  function expectRefused(area: string, reason: string): void {
    const li = candidate(area)!;
    const reasonEl = within(li).getByText(reason);
    const add = addButton(area);
    expect(attr(add, "aria-disabled")).toBe("true");
    expect(attr(add, "aria-describedby")).toBe(reasonEl.id);
    expect(add).not.toBeDisabled();
    const before = rowAreas();
    fireEvent.click(add);
    expect(rowAreas()).toEqual(before);
  }

  it("T-0996 AC5 Recovering", async () => {
    await toPlan({
      budget: 45,
      cache: () => fCache({ history: hardSets("leg-curl", 6, hoursBefore(24)) }),
    });
    expect(rowAreas()).not.toContain("hamstrings");
    expectRefused("hamstrings", "Recovering");
  });

  it("T-0996 AC5 Skipping today (skipped on UF-08.1: Add is disabled)", async () => {
    await toPlan({ budget: 60, skip: ["Shoulders"] });
    expect(document.querySelector('[data-part="skipping"]')).toHaveTextContent(
      "Skipping today: Shoulders",
    );
    expectRefused("shoulders", "Skipping today");
  });

  it("T-0996 AC5 No exercise available", async () => {
    await toPlan({
      budget: 60,
      cache: () =>
        fCache({
          library: fLibrary().filter((e) => e.id !== "overhead-press" && e.id !== "lateral-raise"),
        }),
    });
    expectRefused("shoulders", "No exercise available");
  });

  it("T-0996 AC5 No time left", async () => {
    await toPlan({ budget: 45 });
    expectRefused("shoulders", "No time left");
  });

  it("T-0996 AC5 Workout is full (8 exercises)", async () => {
    await toPlan({ budget: 90 });
    expectRefused("core", "Workout is full");
  });

  it("T-0996 AC5 the areas not in the plan are listed in the engine's order, each with its 14-day line", async () => {
    await toPlan();
    const listed = Array.from(document.querySelectorAll('[data-part="candidate"]')).map((c) =>
      c.getAttribute("data-area"),
    );
    expect(listed.length + rowAreas().length).toBe(9);
    expect(new Set([...listed, ...rowAreas()]).size).toBe(9);
    for (const c of document.querySelectorAll('[data-part="candidate-history"]')) {
      expect(c.textContent).toMatch(/^Last 14 days: 0 of \d+ sets$/);
    }
  });
});

describe("T-0996 AC6 Fill the rest for me", () => {
  it("T-0996 AC6 time for more: areas are added until nothing fits, the button goes and focus moves to Start workout", async () => {
    await toPlan({ empty: true });
    expect(rowAreas()).toEqual([]);
    const fill = button("Fill the rest for me");
    fill.focus();
    const calls = suggestSpy.mock.calls.length;
    fireEvent.click(fill);
    expect(rowAreas().length).toBeGreaterThan(1);
    expect(status()).toHaveTextContent(/^\d+ areas added\. \d+ min left\.$/);
    expect(queryButton("Fill the rest for me")).toBeNull();
    expect(document.activeElement).toBe(startBtn());
    expect(suggestSpy).toHaveBeenCalledTimes(calls);
    // Nothing else fits: every Add left is refused for time or the cap.
    for (const add of document.querySelectorAll<HTMLElement>('[data-part="candidate-add"]')) {
      expect(attr(add, "aria-disabled")).toBe("true");
    }
  });

  it("T-0996 AC6 nothing fits (the 15-minute plan): the button is not shown", async () => {
    await toPlan({ budget: 15 });
    expect(queryButton("Fill the rest for me")).toBeNull();
  });

  // T-1023: Fill the rest and a removed area (comes back only as it was; never a fresh add) is
  // covered in restore-area.test.tsx (AC6) and area-plan-engine.test.ts.
});

describe("T-0996 AC7 the order", () => {
  it("T-0996 AC7 accessory first in the engine plan: rows stay in priority order, Start gets orderItems", async () => {
    await toPlan({ empty: true });
    fireEvent.click(addButton("arms"));
    fireEvent.click(addButton("chest"));
    expect(rowAreas()).toEqual(["arms", "chest"]);
    fireEvent.click(startBtn());
    // The plan the host holds has the isolation exercise first; `orderItems` puts the compound first.
    const given = orderSpy.mock.calls.at(-1)![0] as Workout;
    expect(given.plan.items.map((i) => i.exerciseId)).toEqual(["biceps-curl", "bench-press"]);
    const ordered = orderSpy.mock.results.at(-1)!.value as Workout;
    expect(ordered.plan.items.map((i) => i.exerciseId)).toEqual(["bench-press", "biceps-curl"]);
    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    const row0 = upsert.mock.calls[0]![0] as { plan: Workout["plan"] };
    expect(row0.plan.items.map((i) => i.exerciseId)).toEqual(
      ordered.plan.items.map((i) => i.exerciseId),
    );
    await waitFor(() => expect(screen.getByTestId("focus-mode")).toBeInTheDocument());
  });
});

describe("T-0996 AC8 a time chip rebuilds", () => {
  it("T-0996 AC8 set edits and added areas are dropped; the swap and the removed area stay; the status line says so", async () => {
    await toPlan({ budget: 60 });
    const defaultChest = setsOf("chest");
    // A swap (UF-08.3, which T-0997 reaches from UF-08.6): the main lift becomes Db bench press.
    act(() => void navigateTo("/session/setup?step=swap&item=0"));
    await screen.findByRole("radiogroup", { name: "Replacement" });
    const first = screen
      .getByRole("radiogroup", { name: "Replacement" })
      .querySelector<HTMLElement>("[data-id]")!;
    const swapIn = first.getAttribute("data-id")!;
    fireEvent.click(within(first).getByRole("radio"));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Use / }));
    await waitFor(() => expect(screenIds()).toEqual(["UF-08.2"]));
    // A set edit, a removed area and an added one.
    fireEvent.click(minus("chest"));
    expect(setsOf("chest")).not.toBe(defaultChest);
    removeArea("shoulders");
    const added = ["core", "arms", "quads"].find(
      (a) => candidate(a) !== null && addButton(a).getAttribute("aria-disabled") === null,
    )!;
    expect(added).toBeDefined();
    fireEvent.click(addButton(added));
    expect(rowAreas()).toContain(added);
    suggestSpy.mockClear();
    fireEvent.click(button("30 minutes"));
    expect(suggestSpy).toHaveBeenCalledTimes(1);
    expect(status()).toHaveTextContent(
      /^Plan rebuilt for 30 min\. Your set changes were cleared\./,
    );
    // Dropped: the set edit and the added area.
    expect(setsOf("chest")).toBe(areaSetsOfLast("chest"));
    expect(rowAreas()).not.toContain(added);
    // Kept: the removed area, and the swap (the engine call carries both).
    expect(rowAreas()).not.toContain("shoulders");
    expect(document.querySelector('[data-part="skipping"]')).toHaveTextContent("Shoulders");
    expect(lastInput().avoidAreas).toContain("shoulders");
    expect(lastInput().mainLiftId).toBe(swapIn);
    expect(lastInput().excludeIds).toContain("bench-press");
    expect(lastInput().budgetMin).toBe(30);
  });

  function areaSetsOfLast(area: Area): string {
    const group = areaGroups(lastWorkout()).find((g) => g.area === area);
    return `${group?.sets} sets`;
  }

  it("T-0996 AC8 the active chip changes nothing and makes no engine call", async () => {
    await toPlan({ budget: 45 });
    suggestSpy.mockClear();
    fireEvent.click(button("45 minutes"));
    expect(suggestSpy).not.toHaveBeenCalled();
    expect(status()).toHaveTextContent("");
  });
});

describe("T-0996 AC9 Start empty and Suggest, both entries", () => {
  it("T-0996 AC9 Start empty: no rows, Add an area open, Start workout disabled with its reason, a tap does nothing, one area enables it", async () => {
    await toPlan({ empty: true });
    expect(rows()).toHaveLength(0);
    expect(document.querySelector<HTMLDetailsElement>('[data-part="add-area"]')!.open).toBe(true);
    const lg = startBtn();
    expect(attr(lg, "aria-disabled")).toBe("true");
    expect(lg).not.toBeDisabled();
    const reason = screen.getByText("Add at least one area.");
    expect(attr(lg, "aria-describedby")).toBe(reason.id);
    fireEvent.click(lg);
    expect(screenIds()).toEqual(["UF-08.2"]);
    expect(trail.at(-1)).toBe("/session/setup?step=suggested");
    fireEvent.click(addButton("chest"));
    expect(startBtn()).not.toHaveAttribute("aria-disabled");
    expect(screen.queryByText("Add at least one area.")).toBeNull();
    fireEvent.click(startBtn());
    await waitFor(() => expect(screen.getByTestId("focus-mode")).toBeInTheDocument());
  });

  it("T-0996 AC9 Suggest my workout: the default plan shows, Start workout is enabled, Add an area is collapsed", async () => {
    await toPlan();
    expect(rows().length).toBeGreaterThan(0);
    expect(startBtn()).not.toHaveAttribute("aria-disabled");
    expect(document.querySelector<HTMLDetailsElement>('[data-part="add-area"]')!.open).toBe(false);
    fireEvent.click(startBtn());
    await waitFor(() => expect(screen.getByTestId("focus-mode")).toBeInTheDocument());
  });
});

describe("T-0996 AC10 states", () => {
  it("T-0996 AC10 zero history: 0 of {target}, no attention styling", async () => {
    await toPlan();
    for (const r of rows()) {
      expect(r.querySelector('[data-part="area-history"]')!.textContent).toMatch(
        /^Last 14 days: 0 of \d+ sets$/,
      );
    }
    expect(
      document.querySelector('[class*="attention"], [data-attention], [data-coverage]'),
    ).toBeNull();
  });

  it("T-0996 AC10 balanced week: the lines carry the real load", async () => {
    await toPlan({ cache: () => fCache({ history: balancedHistory() }) });
    expect(rows().length).toBeGreaterThan(0);
    const lines = rows().map((r) => r.querySelector('[data-part="area-history"]')!.textContent);
    expect(lines.some((l) => !/^Last 14 days: 0 of/.test(l!))).toBe(true);
  });

  it("T-0996 AC10 returning after 10 days off: the why chips name the areas furthest below target", async () => {
    await toPlan({ cache: () => fCache({ history: returningHistory() }) });
    const chips = Array.from(document.querySelectorAll('[data-part="session-chips"] > li')).map(
      (c) => c.textContent,
    );
    expect(chips.length).toBeGreaterThan(0);
    // Chest and quads are far above target; the untrained areas come first.
    expect(chips).not.toContain("Chest");
    expect(chips).not.toContain("Quads");
    expect(chips).toEqual(
      lastWorkout()
        .sessionReasons.filter((r) => r.code === "area_deficit")
        .map((r) => (r.code === "area_deficit" ? AREA_NAME[r.area] : "")),
    );
  });

  it("T-0996 AC10 15 minutes: one area, + refused for time, every Add reads No time left", async () => {
    await toPlan({ budget: 15 });
    expect(rowAreas()).toEqual(["chest"]);
    expect(attr(plus("chest"), "aria-disabled")).toBe("true");
    fireEvent.click(plus("chest"));
    expect(row("chest").querySelector('[data-part="refusal"]')!.textContent).toMatch(
      /^(No time for another set|Chest already has)/,
    );
    for (const c of document.querySelectorAll('[data-part="candidate-reason"]')) {
      expect(c.textContent).toBe("No time left");
    }
  });

  it("T-0996 AC10 everything skipped: no rows, the reasons list, Start workout disabled", async () => {
    await toPlan({
      skip: Object.values(AREA_NAME),
    });
    expect(rows()).toHaveLength(0);
    expect(
      screen.getByText("No areas right now. 9 are recovering or skipped today."),
    ).toBeInTheDocument();
    expect(document.querySelector<HTMLDetailsElement>('[data-part="add-area"]')!.open).toBe(true);
    for (const c of document.querySelectorAll('[data-part="candidate-reason"]')) {
      expect(c.textContent).toBe("Skipping today");
    }
    expect(attr(startBtn(), "aria-disabled")).toBe("true");
    expect(queryButton("Fill the rest for me")).toBeNull();
  });

  it("T-0996 AC10 over-budget swap: the line says N min over in words, + Add and Fill are refused with the over copy, − still works", async () => {
    await toPlan({ budget: 30 });
    expect(rowAreas()).toEqual(["chest", "back", "quads"]);
    // UF-08.3: swap Leg extension (item 2) for the sheet's over-time replacement.
    act(() => void navigateTo("/session/setup?step=swap&item=2"));
    const group = await screen.findByRole("radiogroup", { name: "Replacement" });
    const overRow = group.querySelector<HTMLElement>('[data-tag="over-time"]')!.closest("label")!;
    fireEvent.click(within(overRow).getByRole("radio"));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Use / }));
    await waitFor(() => expect(screenIds()).toEqual(["UF-08.2"]));
    const line = document.querySelector('[data-part="budget-text"]')!;
    const over = /^About \d+ of 30 min, (\d+) min over$/.exec(line.textContent!);
    expect(over).not.toBeNull();
    const copy = `Your workout is ${over![1]} min over. Remove or swap an exercise first.`;
    expect(
      document.querySelector('[data-part="budget-text"]')!.closest("[data-over]"),
    ).not.toBeNull();
    for (const area of rowAreas()) {
      expect(attr(plus(area), "aria-disabled")).toBe("true");
    }
    fireEvent.click(plus("chest"));
    expect(row("chest").querySelector('[data-part="refusal"]')).toHaveTextContent(copy);
    expect(status()).toHaveTextContent(copy);
    for (const c of document.querySelectorAll<HTMLElement>('[data-part="candidate-add"]')) {
      expect(attr(c, "aria-disabled")).toBe("true");
    }
    const before = rowAreas();
    fireEvent.click(addButton("core"));
    expect(rowAreas()).toEqual(before);
    expect(status()).toHaveTextContent(copy);
    fireEvent.click(button("Fill the rest for me"));
    expect(rowAreas()).toEqual(before);
    expect(status()).toHaveTextContent(copy);
    // − still works over budget.
    const sets = setsOf("chest");
    fireEvent.click(minus("chest"));
    expect(setsOf("chest")).not.toBe(sets);
  });
});

describe.each([
  ["offline", false],
  ["online", true],
])("T-0996 AC11 %s", (_name, online) => {
  it(`T-0996 AC11 ${_name}: the whole flow works, no network call, the offline icon follows the state`, async () => {
    const fetchSpy = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchSpy);
    setOnline(online);
    await toPlan();
    const icon = screen.queryByRole("img", { name: "Offline" });
    expect(icon === null).toBe(online);
    fireEvent.click(minus("calves"));
    expect(setsOf("calves")).toBe("2 sets");
    // The set freed on Calves is time enough for one on Hamstrings.
    fireEvent.click(plus("hamstrings"));
    expect(setsOf("hamstrings")).toBe("3 sets");
    fireEvent.click(minus("calves"));
    expect(rowAreas()).not.toContain("calves");
    fireEvent.click(addButton("calves"));
    expect(rowAreas()).toContain("calves");
    removeArea("glutes");
    fireEvent.click(button("Fill the rest for me"));
    fireEvent.click(button("30 minutes"));
    expect(status()).toHaveTextContent(/^Plan rebuilt for 30 min/);
    expect(startBtn()).not.toHaveAttribute("aria-disabled");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("T-0996 AC12 principles", () => {
  it("T-0996 AC12 UF-08.1's minutes control is unchanged and comes first; no UF-09 control; Start workout is the only action fill", async () => {
    mount("/session/setup");
    await loaded();
    expect(screenIds()).toEqual(["UF-08.1"]);
    expect(document.querySelector('[data-part="minutes"]')!.textContent).toBe("45");
    expect(button("5 minutes less")).toBeInTheDocument();
    expect(button("5 minutes more")).toBeInTheDocument();
    fireEvent.click(button("Suggest my workout"));
    await settle();
    expect(screenIds()).toEqual(["UF-08.2"]);
    expect(document.querySelector('[data-screen-id^="UF-09"]')).toBeNull();
    expect(queryButton(/^(Pause|Done|Skip|End workout)/)).toBeNull();
    const primary = document.querySelectorAll(".wl-button--primary");
    expect(primary).toHaveLength(1);
    expect(primary[0]).toBe(startBtn());
  });

  it("T-0996 AC12 no suggest call picks an area for an edit; a time chip is one rebuild", async () => {
    await toPlan({ budget: 60 });
    expect(suggestSpy).toHaveBeenCalledTimes(1);
    fireEvent.click(minus("calves"));
    fireEvent.click(plus("calves"));
    removeArea("shoulders");
    fireEvent.click(addButton("shoulders"));
    removeArea("shoulders");
    const fill = queryButton("Fill the rest for me");
    if (fill !== null) fireEvent.click(fill);
    const before = Array.from(document.querySelectorAll('[data-part="candidate-add"]'));
    expect(before.length).toBeGreaterThan(0);
    expect(suggestSpy).toHaveBeenCalledTimes(1);
    fireEvent.click(button("30 minutes"));
    expect(suggestSpy).toHaveBeenCalledTimes(2);
  });

  it("T-0996 AC12 the web does not pick areas: the plan an edit shows is the engine's (rows equal areaGroups of the plan Start writes)", async () => {
    await toPlan({ budget: 60 });
    removeArea("shoulders");
    fireEvent.click(startBtn());
    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    const ordered = orderSpy.mock.results.at(-1)!.value as Workout;
    const areasWritten = new Set(areaGroups(ordered).map((g) => g.area));
    expect(areasWritten.has("shoulders")).toBe(false);
    expect(areasWritten.size).toBeGreaterThan(1);
  });
});

describe("T-0996 AC13 accessibility", () => {
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

  it("T-0996 AC13 axe finds nothing on the default plan, Start empty and over a removal (layout and contrast run in the e2e spec)", async () => {
    for (const empty of [false, true]) {
      await toPlan({ empty });
      const run = async () =>
        // jsdom has no layout; the shell supplies the `main` landmark the screen sits in.
        (
          await axe.run(document.body, {
            rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
          })
        ).violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
      expect(await run()).toEqual([]);
      if (!empty) {
        removeArea("calves");
        expect(await run()).toEqual([]);
      }
      cleanup();
    }
  });

  it("T-0996 AC13 unique names per row, one polite status line, focus never on body after each edit", async () => {
    await toPlan({ budget: 60 });
    const names = () =>
      Array.from(document.querySelectorAll<HTMLElement>("button, a[href], summary")).map(
        (el) => el.getAttribute("aria-label") ?? el.textContent!.trim(),
      );
    const unique = (list: string[]) => expect(new Set(list).size).toBe(list.length);
    unique(names());
    expect(document.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(document.querySelector('[role="status"]')).toBeEmptyDOMElement();
    // Every control with a visible text starts its accessible name with it (WCAG 2.5.3).
    for (const el of document.querySelectorAll<HTMLElement>("button[aria-label]")) {
      const visible = el.textContent!.trim();
      if (visible !== "" && !/^\d+$/.test(visible)) {
        const plain = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");
        expect(plain(el.getAttribute("aria-label")!)).toContain(plain(visible));
      }
    }
    for (const act of [
      () => fireEvent.click(minus("calves")),
      () => removeArea("calves"),
      () => fireEvent.click(addButton("calves")),
    ]) {
      plus("chest").focus();
      act();
      expect(document.activeElement).not.toBe(document.body);
    }
    unique(names());
  });

  it("T-0996 AC13 no px sizes or colours outside tokens in the area plan's styles", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync(resolve(__dirname, "../uf-08.css"), "utf8");
    const area = css.slice(css.indexOf("UF-08.2 Today's plan, by area"));
    expect(area).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/);
    expect(area).toMatch(/min-block-size: 48px/);
    expect(area).toMatch(/min-block-size: 64px/);
  });
});
