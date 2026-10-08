// T-0571 UF-08.1/UF-08.2 (D-0202 §6, §8): the stored favorites reach every `suggest` call, and
// UF-08.2 tags a favorite row. The real engine runs; only the loaders and the lists are mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { suggest, type HistorySet, type Workout } from "@workoutlab/engine";
import {
  fCache,
  fitLine,
  renderSetup,
  screenIds,
  serveCache,
  setOnline,
  settle,
} from "./harness.js";
import { NOW, TZ } from "./fixtures.js";

const lists = vi.hoisted(() => ({ fav: [] as string[], favLoaded: true }));
vi.mock("../../../lib/auth/auth-context.js", () => ({
  useAuth: () => ({ status: "signed-in", userId: "A" }),
}));
vi.mock("../../../lib/offline/excluded-hooks.js", () => ({
  useExcludedList: () => ({ ids: [], loaded: true }),
  useOnline: () => false,
}));
vi.mock("../../../lib/offline/favorites-hooks.js", () => ({
  useFavoriteList: () => ({ ids: lists.fav, loaded: lists.favLoaded }),
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
const button = (name: string) => screen.getByRole("button", { name });
const inputs = () => spy.mock.calls.map((c) => c[4]);
const row = (id: string) =>
  document.querySelector<HTMLElement>(`[data-part="item-row"][data-id="${id}"]`);
const tagged = () =>
  Array.from(document.querySelectorAll('[data-part="item-row"]'))
    .filter((r) => r.querySelector('[data-part="row-favorite"]') !== null)
    .map((r) => r.getAttribute("data-id"));
const ids = () =>
  Array.from(document.querySelectorAll('[data-part="item-row"]')).map((r) =>
    r.getAttribute("data-id"),
  );

beforeEach(async () => {
  const actual = await vi.importActual<typeof import("@workoutlab/engine")>("@workoutlab/engine");
  spy.mockReset();
  spy.mockImplementation(actual.suggest);
  lists.fav = [];
  lists.favLoaded = true;
  setOnline(false);
  serveCache();
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function toPlan(min = 30): Promise<void> {
  renderSetup();
  await waitFor(() => expect(fitLine().textContent).toMatch(/^(Fits|Nothing)/));
  fireEvent.click(button(`${min} minutes`));
  await settle();
  fireEvent.click(button("Suggest my workout"));
  expect(screenIds()).toEqual(["UF-08.2"]);
}

describe("AC1 every call", () => {
  it("fit line, Shuffle, chip, Add and Start with all pass the sorted favorites", async () => {
    lists.fav = ["db-bench-press", "back-squat", "back-squat"];
    await toPlan();
    fireEvent.click(button("Shuffle"));
    fireEvent.click(button("45 minutes"));
    fireEvent.click(button("Add exercise"));
    const dialog = screen.getByRole("dialog");
    const addBtn = within(dialog).queryByRole("button", { name: /^Add Calf raise$/ });
    if (addBtn) fireEvent.click(addBtn);
    else fireEvent.click(within(dialog).getAllByRole("button", { name: /^Add / })[0]!);
    const before = spy.mock.calls.length;
    expect(before).toBeGreaterThan(4);
    for (const i of inputs()) expect(i.favoriteIds).toEqual(["back-squat", "db-bench-press"]);
  });

  it("Start with this passes them too", async () => {
    lists.fav = ["db-bench-press", "back-squat"];
    await toPlan();
    spy.mockClear();
    fireEvent.click(button("Start with Inverted row"));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(inputs()[0]!.favoriteIds).toEqual(["back-squat", "db-bench-press"]);
  });

  it("no favorites: every call has []", async () => {
    await toPlan();
    fireEvent.click(button("Shuffle"));
    expect(spy.mock.calls.length).toBeGreaterThan(1);
    for (const i of inputs()) expect(i.favoriteIds).toEqual([]);
  });

  it("waits for the list: no suggest call and Suggest disabled until loaded", async () => {
    lists.fav = ["back-squat"];
    lists.favLoaded = false;
    renderSetup();
    await settle();
    expect(spy).not.toHaveBeenCalled();
    expect(button("Suggest my workout")).toHaveAttribute("aria-disabled", "true");
  });
});

describe("AC2 a favorite ranks first (real engine)", () => {
  it("without favorites db-bench-press is not picked", async () => {
    await toPlan();
    expect(row("db-bench-press")).toBeNull();
    expect(tagged()).toEqual([]);
  });

  it("with db-bench-press stored it is the tagged main lift, first", async () => {
    lists.fav = ["db-bench-press"];
    await toPlan();
    expect(ids()[0]).toBe("db-bench-press");
    expect(row("db-bench-press")!.getAttribute("data-main")).toBe("true");
    expect(tagged()).toEqual(["db-bench-press"]);
  });
});

describe("AC3 time wins", () => {
  it("30 min: back-squat does not fit, no tag; 60 min: tag iff the engine's plan has it", async () => {
    lists.fav = ["back-squat"];
    await toPlan();
    expect(tagged()).toEqual([]);
    fireEvent.click(button("60 minutes"));
    const direct = suggest(
      ...(spy.mock.lastCall!.slice(0, 7) as Parameters<typeof suggest>),
    ) as Workout;
    const inPlan = direct.plan.items.some((i) => i.exerciseId === "back-squat");
    expect(ids().includes("back-squat")).toBe(inPlan);
    expect(tagged().includes("back-squat")).toBe(inPlan);
  });
});

describe("AC4 offline", () => {
  it("db-bench-press is main with no network request", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchSpy);
    try {
      lists.fav = ["db-bench-press"];
      await toPlan();
      expect(ids()[0]).toBe("db-bench-press");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("AC5 skipped area", () => {
  it("back-squat is not an item and carries no tag", async () => {
    lists.fav = ["back-squat"];
    renderSetup();
    await waitFor(() => expect(fitLine().textContent).toMatch(/^(Fits|Nothing)/));
    fireEvent.click(button("30 minutes"));
    fireEvent.click(
      within(screen.getByRole("group", { name: "Skip today" })).getByRole("button", {
        name: "Quads",
      }),
    );
    await settle();
    fireEvent.click(button("Suggest my workout"));
    expect(ids().includes("back-squat")).toBe(false);
    expect(tagged()).toEqual([]);
  });
});

describe("AC6 returning after 10 days", () => {
  it("the plan equals a direct suggest call; a favorite in it is tagged", async () => {
    const at = new Date(new Date(NOW).getTime() - 10 * 86_400_000).toISOString();
    const history: HistorySet[] = Array.from({ length: 4 }, (_, i) => ({
      clientId: `bs-${i}`,
      sessionId: "S0",
      exerciseId: "back-squat",
      isWarmup: false,
      completedAt: at,
      editedAt: at,
      deletedAt: null,
      reps: 8,
      weightKg: 60,
      durationS: null,
    }));
    serveCache(() => fCache({ history }));
    lists.fav = ["back-squat"];
    await toPlan();
    const args = spy.mock.lastCall!;
    const direct = suggest(...(args.slice(0, 7) as Parameters<typeof suggest>));
    expect(ids()).toEqual(direct.plan.items.map((i) => i.exerciseId));
    expect(tagged()).toEqual(ids().filter((i) => i === "back-squat"));
    expect(args[6]).toBe(TZ);
  });
});

describe("AC7 added favorite", () => {
  it("shows Added by you and Favorite", async () => {
    lists.fav = ["back-squat"];
    await toPlan();
    fireEvent.click(button("Add exercise"));
    fireEvent.click(
      within(screen.getByRole("dialog")).getAllByRole("button", { name: "Add Back squat" })[0]!,
    );
    const r = row("back-squat");
    expect(r).not.toBeNull();
    expect(within(r!).getByText("Added by you")).toBeInTheDocument();
    expect(within(r!).getByText("Favorite")).toBeInTheDocument();
  });
});
