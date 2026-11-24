// T-1023 UF-08.2: adding back an area removed in the same visit restores its removed exercises (D-0290).
// Same loaders and engine spies as area-plan.test.tsx; the real engine runs (T-1022 ctx.restore).
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { useEffect } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router";
import { areaGroups, orderItems, suggest, type HistorySet, type Workout } from "@workoutlab/engine";
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

// ---- T-1023 helpers ----

function openArea(area: string): void {
  fireEvent.click(row(area).querySelector('[data-part="area-open"]')!);
  expect(screenIds()).toEqual(["UF-08.6"]);
}
function back(): void {
  fireEvent.click(screen.getByRole("link", { name: "Back" }));
}
const minutesOfRow = (area: string) =>
  row(area).querySelector('[data-part="area-minutes"]')!.textContent;
const skipping = () => document.querySelector('[data-part="skipping"]');
const itemsIn = (plan: Workout["plan"], area: string) =>
  plan.items.filter(
    (i) => areaGroups({ ...lastWorkout(), plan: { ...plan, items: [i] } })[0]?.area === area,
  );

/** Start workout and read the plan the session row carries. */
async function started(): Promise<Workout["plan"]> {
  fireEvent.click(startBtn());
  await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
  return upsert.mock.calls[0]![0].plan as Workout["plan"];
}
const keyOf = (i: Workout["plan"]["items"][number]) => JSON.stringify(i);

describe("T-1023 AC1 restore", () => {
  it("T-1023 AC1 Remove Hamstrings then Add Hamstrings puts Leg curl x 2 back as it was", async () => {
    await toPlan();
    const before = itemsIn(orderedBefore(), "hamstrings");
    expect(before.map((i) => i.exerciseId)).toEqual(["leg-curl"]);
    const sets = setsOf("hamstrings");
    const mins = minutesOfRow("hamstrings");
    const order = rowAreas();
    removeArea("hamstrings");
    expect(rowAreas()).not.toContain("hamstrings");
    suggestSpy.mockClear();
    fireEvent.click(addButton("hamstrings"));
    expect(rowAreas()).toContain("hamstrings");
    expect(setsOf("hamstrings")).toBe(sets);
    expect(sets).toBe("2 sets");
    expect(minutesOfRow("hamstrings")).toBe(mins);
    expect(status()).toHaveTextContent(/^Hamstrings added back\.$/);
    expect(document.activeElement).toBe(plus("hamstrings"));
    expect(skipping()).toBeNull();
    expect(candidate("hamstrings")).toBeNull();
    expect(suggestSpy).not.toHaveBeenCalled();
    expect(rowAreas().slice().sort()).toEqual(order.slice().sort());
    const written = await started();
    const after = written.items.filter((i) => i.exerciseId === "leg-curl");
    expect(after).toHaveLength(1);
    expect(keyOf(after[0]!)).toBe(keyOf(before[0]!));
  });

  function orderedBefore(): Workout["plan"] {
    return orderSpy.mock.results.length > 0
      ? (orderSpy.mock.results.at(-1)!.value as Workout).plan
      : lastWorkout().plan;
  }

  it("T-1023 AC3 removing the last exercise on UF-08.6 is not remembered (D-0191: its id is out for the visit), so Add is a fresh suggestion", async () => {
    await toPlan({ budget: 90 });
    openArea("hamstrings");
    const gone = areaGroups(lastWorkout()).find((g) => g.area === "hamstrings")!.itemIds;
    expect(gone).toHaveLength(1);
    fireEvent.click(button(/^Remove /));
    await waitFor(() => expect(screenIds()).toEqual(["UF-08.2"]));
    expect(status()).toHaveTextContent("Hamstrings removed. Add it back below.");
    fireEvent.click(addButton("hamstrings"));
    expect(rowAreas()).toContain("hamstrings");
    expect(status()).toHaveTextContent(/^Hamstrings added\. \d+ min left\.$/);
    expect(skipping()).toBeNull();
    const written = await started();
    expect(written.items.map((i) => i.exerciseId)).not.toContain(gone[0]);
  });
});

describe("T-1023 re-entry by another route drops the memory", () => {
  it("T-1023 AC1 an area that re-enters through Add exercise forgets its old items: removed again, it returns as it was last", async () => {
    await toPlan({ budget: 90 });
    const first = areaGroups(lastWorkout()).find((g) => g.area === "hamstrings")!.itemIds[0]!;
    const [oldId, newId, newName] =
      first === "leg-curl"
        ? [first, "romanian-deadlift", "Romanian deadlift"]
        : [first, "leg-curl", "Leg curl"];
    removeArea("hamstrings");
    openArea("glutes");
    fireEvent.click(button("Add exercise"));
    const sheet = within(screen.getByRole("dialog"));
    fireEvent.change(sheet.getByLabelText("Search exercises"), { target: { value: newName } });
    fireEvent.click(sheet.getByRole("button", { name: `Add ${newName}` }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    back();
    expect(rowAreas()).toContain("hamstrings");
    removeArea("hamstrings");
    fireEvent.click(addButton("hamstrings"));
    expect(status()).toHaveTextContent(/^Hamstrings added back\.$/);
    const written = await started();
    const ids = written.items.map((i) => i.exerciseId);
    expect(ids).toContain(newId);
    expect(ids).not.toContain(oldId);
  });
});

describe("T-1023 AC2 Add an area lists it", () => {
  it("T-1023 AC2 the removed area's Add is enabled with Fill the rest shown, not No time left", async () => {
    await toPlan();
    expect(queryButton("Fill the rest for me")).toBeNull();
    removeArea("hamstrings");
    const li = candidate("hamstrings")!;
    expect(attr(addButton("hamstrings"), "aria-disabled")).toBeNull();
    expect(within(li).queryByText("No time left")).toBeNull();
    expect(queryButton("Fill the rest for me")).not.toBeNull();
  });

  it("T-1023 AC2 neither the restore nor the top suggestion fits: the row reads No time left", async () => {
    await toPlan();
    removeArea("hamstrings");
    for (let round = 0; round < 12; round += 1) {
      for (const a of rowAreas()) fireEvent.click(plus(a));
      const more = Array.from(document.querySelectorAll<HTMLElement>('[data-part="candidate"]'))
        .map((c) => c.getAttribute("data-area")!)
        .find((a) => a !== "hamstrings" && attr(addButton(a), "aria-disabled") === null);
      if (more !== undefined) fireEvent.click(addButton(more));
    }
    // Free no time: now the old items (and the top suggestion) cost more than is left.
    const li = candidate("hamstrings")!;
    expect(attr(addButton("hamstrings"), "aria-disabled")).toBe("true");
    expect(within(li).getByText("No time left")).toBeInTheDocument();
    const before = rowAreas();
    fireEvent.click(addButton("hamstrings"));
    expect(rowAreas()).toEqual(before);
  });
});

describe("T-1023 AC4 main lift", () => {
  it("T-1023 AC4 the area that held the main lift gets it back, first in the order", async () => {
    await toPlan({ budget: 60 });
    const w = lastWorkout();
    const mainId = w.plan.mainLiftId!;
    const area = areaGroups(w).find((g) => g.itemIds.includes(mainId))!.area;
    removeArea(area);
    fireEvent.click(addButton(area));
    expect(rowAreas()).toContain(area);
    const written = await started();
    expect(written.mainLiftId).toBe(mainId);
    expect(written.items[0]!.exerciseId).toBe(mainId);
    expect(written.items[0]!.isMain).toBe(true);
  });

  it("T-1023 AC4 another lift became main in between: the old main lift returns as a normal exercise of at most 3 sets", async () => {
    await toPlan({ budget: 60 });
    const w = lastWorkout();
    const mainId = w.plan.mainLiftId!;
    const lib = fLibrary();
    const other = w.plan.items.find(
      (i) => !i.isMain && lib.find((e) => e.id === i.exerciseId)?.type === "compound",
    );
    expect(other).toBeDefined();
    const mainArea = areaGroups(w).find((g) => g.itemIds.includes(mainId))!.area;
    const otherArea = areaGroups(w).find((g) => g.itemIds.includes(other!.exerciseId))!.area;
    expect(otherArea).not.toBe(mainArea);
    removeArea(mainArea);
    openArea(otherArea);
    const name = lib.find((e) => e.id === other!.exerciseId)!.name;
    fireEvent.click(button(`Start with ${name}`));
    back();
    fireEvent.click(addButton(mainArea));
    expect(rowAreas()).toContain(mainArea);
    const written = await started();
    expect(written.mainLiftId).toBe(other!.exerciseId);
    const returned = written.items.find((i) => i.exerciseId === mainId);
    expect(returned).toBeDefined();
    expect(returned!.isMain).toBeFalsy();
    expect(returned!.sets).toBeLessThanOrEqual(3);
  });
});

describe("T-1023 AC5 time and other resets", () => {
  it("T-1023 AC5 a time chip clears the memory: the Add is a fresh suggestion and the rebuild line shows", async () => {
    await toPlan();
    removeArea("hamstrings");
    fireEvent.click(button("30 minutes"));
    expect(status()).toHaveTextContent(
      /^Plan rebuilt for 30 min\. Your set changes were cleared\./,
    );
    expect(rowAreas()).not.toContain("hamstrings");
    // The rebuild fills the 30 minutes: free some by taking the first area out.
    removeArea(rowAreas()[0]!);
    expect(attr(addButton("hamstrings"), "aria-disabled")).toBeNull();
    fireEvent.click(addButton("hamstrings"));
    expect(rowAreas()).toContain("hamstrings");
    expect(status()).toHaveTextContent(/^Hamstrings added\. \d+ min left\.$/);
  });

  it("T-1023 AC5 Start workout, then back: the memory is gone", async () => {
    await toPlan();
    removeArea("hamstrings");
    await started();
    cleanup();
    await toPlan();
    removeArea("hamstrings");
    fireEvent.click(addButton("hamstrings"));
    expect(status()).toHaveTextContent(/^Hamstrings added back\.$/);
  });
});

describe("T-1023 AC6 Skipping today and Fill the rest", () => {
  it("T-1023 AC6 Skipping today shows while the only removed area is out and is gone after Add back", async () => {
    await toPlan();
    removeArea("hamstrings");
    expect(skipping()).toHaveTextContent("Skipping today: Hamstrings");
    fireEvent.click(addButton("hamstrings"));
    expect(skipping()).toBeNull();
  });

  it("T-1023 AC6 Fill the rest brings a removed area back as it was, the status says so", async () => {
    await toPlan();
    const mins = minutesOfRow("hamstrings");
    removeArea("hamstrings");
    fireEvent.click(button("Fill the rest for me"));
    expect(rowAreas()).toContain("hamstrings");
    expect(minutesOfRow("hamstrings")).toBe(mins);
    expect(setsOf("hamstrings")).toBe("2 sets");
    expect(status()).toHaveTextContent(/^Hamstrings added back\.$/);
    expect(skipping()).toBeNull();
  });

  it("T-1023 AC6 Fill the rest never makes a fresh suggestion of a removed area whose memory is gone", async () => {
    await toPlan({ budget: 60 });
    removeArea("shoulders");
    fireEvent.click(button("30 minutes"));
    fireEvent.click(button("60 minutes"));
    const fill = queryButton("Fill the rest for me");
    if (fill !== null) fireEvent.click(fill);
    expect(rowAreas()).not.toContain("shoulders");
  });
});

describe("T-1023 AC8 leaving", () => {
  it("T-1023 AC8 UF-08.1 and back: the memory is gone; nothing is stored or sent", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchSpy);
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    await toPlan();
    removeArea("hamstrings");
    act(() => void navigateTo("/session/setup?budget=45"));
    await loaded();
    fireEvent.click(button("Suggest my workout"));
    await settle();
    expect(screenIds()).toEqual(["UF-08.2"]);
    expect(rowAreas()).toContain("hamstrings");
    removeArea("hamstrings");
    fireEvent.click(addButton("hamstrings"));
    expect(status()).toHaveTextContent(/^Hamstrings added back\.$/);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });

  it("T-1023 AC8 a reload (a fresh mount) starts with no memory", async () => {
    await toPlan();
    removeArea("hamstrings");
    cleanup();
    await toPlan({ skip: ["Hamstrings"] });
    expect(rowAreas()).not.toContain("hamstrings");
  });
});

describe.each([
  ["zero history", undefined, 45],
  ["returning after 10 days off", () => fCache({ history: returningHistory() }), 45],
  ["a 15-minute plan", undefined, 15],
])("T-1023 AC9 %s", (_name, cache, budget) => {
  it.each([
    ["offline", false],
    ["online", true],
  ])(
    `T-1023 AC9 ${_name}, %s: remove then add back restores the area, no network call`,
    async (_n, online) => {
      const fetchSpy = vi.fn(async () => new Response("{}"));
      vi.stubGlobal("fetch", fetchSpy);
      setOnline(online);
      await toPlan({ budget, ...(cache === undefined ? {} : { cache }) });
      const area = rowAreas().at(-1)!;
      while (attr(minus(area), "aria-label") !== `Remove ${AREA_NAME[area]}`)
        fireEvent.click(minus(area));
      const sets = setsOf(area);
      const mins = minutesOfRow(area);
      fireEvent.click(minus(area));
      expect(attr(addButton(area), "aria-disabled")).toBeNull();
      fireEvent.click(addButton(area));
      expect(status()).toHaveTextContent(`${AREA_NAME[area]} added back.`);
      expect(setsOf(area)).toBe(sets);
      expect(minutesOfRow(area)).toBe(mins);
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );
});

describe("T-1023 AC10 accessibility", () => {
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

  it("T-1023 AC10 axe finds nothing after an add back; one polite status line; focus not on body; Add is named Add {Area}", async () => {
    await toPlan();
    removeArea("hamstrings");
    expect(addButton("hamstrings")).toHaveAccessibleName("Add Hamstrings");
    fireEvent.click(addButton("hamstrings"));
    const result = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
    });
    expect(result.violations.map((v) => v.id)).toEqual([]);
    expect(document.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(document.activeElement).not.toBe(document.body);
  });
});
