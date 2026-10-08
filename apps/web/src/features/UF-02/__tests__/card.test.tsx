// T-0302c UF-02.1 suggestion card with the `lib/offline` loaders mocked (AC-1 to AC-6).
// `suggest` is a spy that calls the real engine, so "the real engine" holds unless a test stubs a
// `Workout` on purpose (principle 3: the card renders that output, nothing else).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { Workout } from "@workoutlab/engine";
import type { EngineProfile } from "@workoutlab/shared";
import {
  AREA_ORDER,
  F_TZ,
  L1,
  PROFILE,
  TZ,
  W_R7E4,
  W_R7E4_ITEMS,
  history,
  targets,
  workoutItem,
  workoutOf,
} from "./fixtures.js";
import { location, macrotask, part, renderToday, tile } from "./helpers.js";

const mocks = vi.hoisted(() => ({
  loadEngineHistory: vi.fn(),
  loadTargets: vi.fn(),
  loadLibrary: vi.fn(),
  loadProfile: vi.fn(),
  lastSyncedAt: vi.fn(),
  refreshAll: vi.fn(),
}));

const auth = vi.hoisted(() => ({ status: "signed-in" as "signed-in" | "stale" | "signed-out" }));
vi.mock("../../../lib/auth/auth-context.js", () => ({
  useAuth: () => ({ status: auth.status, redirectTarget: "/welcome" as const, signOut: vi.fn() }),
}));
vi.mock("../../../lib/offline/engine-feed.js", () => ({
  loadEngineHistory: mocks.loadEngineHistory,
}));
vi.mock("../../../lib/offline/history.js", () => ({
  loadTargets: mocks.loadTargets,
  loadLibrary: mocks.loadLibrary,
  loadProfile: mocks.loadProfile,
  lastSyncedAt: mocks.lastSyncedAt,
  refreshAll: mocks.refreshAll,
}));
vi.mock("@workoutlab/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workoutlab/engine")>();
  return { ...actual, suggest: vi.fn(actual.suggest) };
});

const { suggest } = await import("@workoutlab/engine");
const realEngine = await vi.importActual<typeof import("@workoutlab/engine")>("@workoutlab/engine");
const suggestSpy = vi.mocked(suggest);

const never = <T,>(): Promise<T> => new Promise<T>(() => {});
let online = false;

beforeEach(() => {
  online = false;
  auth.status = "signed-in";
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
  suggestSpy.mockReset();
  suggestSpy.mockImplementation(realEngine.suggest);
  mocks.loadEngineHistory.mockReset().mockResolvedValue([]);
  mocks.loadTargets.mockReset().mockResolvedValue(targets());
  mocks.loadLibrary.mockReset().mockResolvedValue(L1);
  mocks.loadProfile.mockReset().mockResolvedValue(PROFILE);
  mocks.lastSyncedAt.mockReset().mockResolvedValue(null);
  mocks.refreshAll.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const card = () => part("card");
const rows = (): string[] =>
  [...document.querySelectorAll('[data-part="card-row"]')].map((el) => el.textContent ?? "");
const chips = (): string[] =>
  [...document.querySelectorAll('[data-part="card-chip"]')].map((el) => el.textContent ?? "");

/** Waits until the loaded card (not the skeleton) is on screen. */
async function waitForCard(): Promise<HTMLElement> {
  await waitFor(() => {
    expect(card()).not.toBeNull();
    expect(card()).not.toHaveAttribute("aria-busy");
  });
  return card()!;
}

function stubWorkout(workout: Workout): void {
  suggestSpy.mockReturnValue(workout);
}

describe("AC-1 the suggest call and the goal (D-0065 §1, D-0095)", () => {
  it("once per cache read, with the D-0065 §1 input, the loaders' values and F-tz", async () => {
    const hist = history("back-squat", "2026-09-20T18:00:00+02:00", 3);
    const tgts = targets();
    const profile: EngineProfile = { ...PROFILE };
    mocks.loadEngineHistory.mockResolvedValue(hist);
    mocks.loadTargets.mockResolvedValue(tgts);
    mocks.loadProfile.mockResolvedValue(profile);
    renderToday(F_TZ);
    await waitForCard();
    await macrotask();
    expect(suggestSpy).toHaveBeenCalledTimes(1);
    expect(suggestSpy).toHaveBeenCalledWith(
      hist,
      tgts,
      profile,
      L1,
      {
        budgetMin: 45,
        warmupInBudget: true,
        energy: "normal",
        shuffle: 0,
        mainLiftId: null,
        pinnedIds: [],
        excludeIds: [],
        favoriteIds: [],
      },
      F_TZ.now.toISOString(),
      TZ,
    );
    const args = suggestSpy.mock.calls[0]!;
    expect(args[0]).toBe(hist);
    expect(args[1]).toBe(tgts);
    // Reference-equal to loadProfile()'s value: the goal travels as it is (D-0095).
    expect(args[2]).toBe(profile);
    expect(args[3]).toBe(L1);
  });

  it("real engine, zero history, goal get_stronger: 'Bench press 4 × 3–5'", async () => {
    mocks.loadProfile.mockResolvedValue({ ...PROFILE, goal: "get_stronger" });
    renderToday(F_TZ);
    await waitForCard();
    expect(rows()).toContain("Bench press 4 × 3–5");
    expect(rows()).not.toContain("Bench press 4 × 6–8");
  });

  it("real engine, zero history, goal build_muscle: 'Bench press 4 × 6–8'", async () => {
    mocks.loadProfile.mockResolvedValue({ ...PROFILE, goal: "build_muscle" });
    renderToday(F_TZ);
    await waitForCard();
    expect(rows()).toContain("Bench press 4 × 6–8");
    expect(rows()).not.toContain("Bench press 4 × 3–5");
  });
});

describe("AC-2 card render (W-R7E4)", () => {
  it("header: 'Suggested for 45 min' and '3 exercises · ~29 min' (ceil(1725 / 60))", async () => {
    stubWorkout(W_R7E4);
    renderToday(F_TZ);
    await waitForCard();
    expect(part("card-title")!.textContent).toBe("Suggested for 45 min");
    expect(part("card-summary")!.textContent).toBe("3 exercises · ~29 min");
  });

  it("the length follows totalS: 1741 s reads ~30 min, 1 item reads '1 exercise'", async () => {
    stubWorkout(workoutOf([W_R7E4_ITEMS[0]!], { totalS: 1741 }));
    renderToday(F_TZ);
    await waitForCard();
    expect(part("card-summary")!.textContent).toBe("1 exercise · ~30 min");
  });

  it("rows in plan order, with the library names", async () => {
    stubWorkout(W_R7E4);
    renderToday(F_TZ);
    await waitForCard();
    expect(rows()).toEqual([
      "Bench press 4 × 6–8",
      "Inverted row 3 × 8–12",
      "Leg extension 2 × 10–15",
    ]);
  });

  it("the items reversed render reversed", async () => {
    stubWorkout(workoutOf([...W_R7E4_ITEMS].reverse(), { totalS: 1725 }));
    renderToday(F_TZ);
    await waitForCard();
    expect(rows()).toEqual([
      "Leg extension 2 × 10–15",
      "Inverted row 3 × 8–12",
      "Bench press 4 × 6–8",
    ]);
  });

  it("the name is the library's, not the id: a renamed library row renders its name", async () => {
    mocks.loadLibrary.mockResolvedValue(
      L1.map((e) => (e.id === "bench-press" ? { ...e, name: "Flat barbell press" } : e)),
    );
    stubWorkout(W_R7E4);
    renderToday(F_TZ);
    await waitForCard();
    expect(rows()[0]).toBe("Flat barbell press 4 × 6–8");
  });

  it("chips: Chest, Back, Quads from sessionReasonChips(sessionReasons)", async () => {
    stubWorkout(W_R7E4);
    renderToday(F_TZ);
    await waitForCard();
    expect(chips()).toEqual(["Chest", "Back", "Quads"]);
  });

  it("chips: recovering_skipped keeps its line", async () => {
    stubWorkout({
      ...W_R7E4,
      sessionReasons: [
        { code: "area_deficit", area: "back", deficit: 1 },
        { code: "recovering_skipped", area: "quads" },
      ],
    });
    renderToday(F_TZ);
    await waitForCard();
    expect(chips()).toEqual(["Back", "Quads recovering, skipped"]);
  });

  it("Start is still the only primary action and goes to /session/setup; the card has no button", async () => {
    stubWorkout(W_R7E4);
    renderToday(F_TZ);
    const el = await waitForCard();
    expect(document.querySelectorAll(".wl-today__start")).toHaveLength(1);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(el.querySelectorAll("a")).toHaveLength(1);
    expect(el.querySelector("a")!.textContent).toBe("See all");
    const start = screen.getByRole("link", { name: "Start workout" });
    expect(start).toHaveAttribute("href", "/session/setup");
    fireEvent.click(start);
    expect(location()).toBe("/session/setup");
  });
});

describe("AC-3 more than 3 items", () => {
  const five = [
    ...W_R7E4_ITEMS,
    workoutItem("leg-curl", 2, 10, 15),
    workoutItem("calf-raise", 2, 10, 15),
  ];

  it("5 items: the first 3 rows, then '+2 more'", async () => {
    stubWorkout(workoutOf(five));
    renderToday(F_TZ);
    await waitForCard();
    expect(rows()).toEqual([
      "Bench press 4 × 6–8",
      "Inverted row 3 × 8–12",
      "Leg extension 2 × 10–15",
    ]);
    expect(part("card-more")!.textContent).toBe("+2 more");
    expect(part("card-summary")!.textContent).toBe("5 exercises · ~29 min");
  });

  it("3 items: no 'more' text", async () => {
    stubWorkout(W_R7E4);
    renderToday(F_TZ);
    await waitForCard();
    expect(rows()).toHaveLength(3);
    expect(part("card-more")).toBeNull();
    expect(card()!.textContent).not.toMatch(/more/);
  });

  it.each([
    ["5 items", five],
    ["3 items", W_R7E4_ITEMS],
  ])("%s: a 'See all' link to /?view=preview", async (_name, items) => {
    stubWorkout(workoutOf(items));
    renderToday(F_TZ);
    await waitForCard();
    const link = screen.getByRole("link", { name: "See all" });
    expect(link).toHaveAttribute("href", "/?view=preview");
  });
});

describe("AC-4 timed and empty", () => {
  it("a timed item renders 'Plank 3 × 45 s'", async () => {
    stubWorkout(
      workoutOf([workoutItem("plank", 3, null, null, { durationS: 45 })], { totalS: 600 }),
    );
    renderToday(F_TZ);
    await waitForCard();
    expect(rows()).toEqual(["Plank 3 × 45 s"]);
  });

  it("empty plan: 'Nothing suggested yet', no rows, no See all, no chips; Start present and enabled", async () => {
    stubWorkout(workoutOf([], { totalS: 160, sessionReasons: W_R7E4.sessionReasons }));
    renderToday(F_TZ);
    await waitForCard();
    expect(screen.getByText("Nothing suggested yet")).toBeInTheDocument();
    expect(rows()).toEqual([]);
    expect(part("card-rows")).toBeNull();
    expect(screen.queryByRole("link", { name: "See all" })).toBeNull();
    expect(part("card-chips")).toBeNull();
    expect(chips()).toEqual([]);
    const start = screen.getByRole("link", { name: "Start workout" });
    expect(start).toHaveAttribute("href", "/session/setup");
    expect(start).not.toHaveAttribute("aria-disabled");
    expect(start).not.toHaveAttribute("disabled");
  });

  it("non-empty plan: 'Nothing suggested yet' is absent", async () => {
    stubWorkout(W_R7E4);
    renderToday(F_TZ);
    await waitForCard();
    expect(screen.queryByText("Nothing suggested yet")).toBeNull();
  });
});

describe("AC-5 skeleton", () => {
  it("before the first result: aria-busy, no rows, the same class as the loaded card", async () => {
    let release: (v: never[]) => void = () => {};
    mocks.loadEngineHistory.mockReturnValue(new Promise((r) => (release = r)));
    stubWorkout(W_R7E4);
    renderToday(F_TZ);
    const skeleton = card()!;
    expect(skeleton).toHaveAttribute("aria-busy", "true");
    expect(skeleton.querySelectorAll('[data-part="card-row"]')).toHaveLength(0);
    expect(rows()).toEqual([]);
    const skeletonClass = skeleton.className;
    expect(skeletonClass).toBe("wl-today-card");

    release([]);
    const loaded = await waitForCard();
    expect(loaded.className).toBe(skeletonClass);
    expect(loaded).not.toHaveAttribute("aria-busy");
    expect(rows()).toHaveLength(3);
  });
});

describe("AC-6 no profile, refresh", () => {
  it.each([
    ["no profile", () => mocks.loadProfile.mockResolvedValue(null)],
    ["8 targets", () => mocks.loadTargets.mockResolvedValue(targets(AREA_ORDER.slice(0, 8)))],
  ])("%s: no card and 0 suggest calls", async (_name, arrange) => {
    arrange();
    renderToday(F_TZ);
    expect(await screen.findByText("Connect to finish setting up your plan")).toBeInTheDocument();
    await macrotask();
    expect(card()).toBeNull();
    expect(suggestSpy).toHaveBeenCalledTimes(0);
  });

  it("profile + 9 targets: the card is present", async () => {
    renderToday(F_TZ);
    await waitForCard();
    expect(card()).not.toBeNull();
    expect(suggestSpy).toHaveBeenCalledTimes(1);
  });

  it("online: after refreshAll resolves with new data, suggest runs exactly once more", async () => {
    online = true;
    mocks.loadEngineHistory
      .mockResolvedValueOnce([])
      .mockResolvedValue(history("back-squat", "2026-09-26T18:00:00+02:00", 6));
    renderToday(F_TZ);
    await waitFor(() => expect(tile("quads")).toBe("6 / 20"));
    await waitForCard();
    expect(suggestSpy).toHaveBeenCalledTimes(2);
    expect(suggestSpy.mock.calls[1]![0]).toHaveLength(6);
    await macrotask();
    expect(suggestSpy).toHaveBeenCalledTimes(2);
    expect(mocks.refreshAll).toHaveBeenCalledTimes(1);
  });

  it("offline: suggest runs exactly once (no second call after a 50 ms macrotask)", async () => {
    renderToday(F_TZ);
    await waitForCard();
    await macrotask();
    expect(suggestSpy).toHaveBeenCalledTimes(1);
    expect(mocks.refreshAll).toHaveBeenCalledTimes(0);
  });

  it("a suggest that throws leaves the frame and Start, with no card and no no-plan line", async () => {
    suggestSpy.mockImplementation(() => {
      throw new Error("engine broke");
    });
    renderToday(F_TZ);
    await waitFor(() => expect(tile("chest")).toBe("0 / 20"));
    expect(card()).toBeNull();
    expect(screen.queryByText("Connect to finish setting up your plan")).toBeNull();
    expect(screen.getByRole("link", { name: "Start workout" })).toBeInTheDocument();
  });
});

describe("AC-6 never hangs on a pending read", () => {
  it("loaders that never resolve keep the skeleton and call suggest 0 times", async () => {
    mocks.loadEngineHistory.mockReturnValue(never());
    renderToday(F_TZ);
    await macrotask();
    expect(card()).toHaveAttribute("aria-busy", "true");
    expect(suggestSpy).toHaveBeenCalledTimes(0);
  });
});
