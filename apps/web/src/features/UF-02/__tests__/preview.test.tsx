// T-0302b UF-02.2 Workout preview (`/?view=preview`, D-0168 §3). The preview renders the same
// `useToday`/`PREVIEW_INPUT` `Workout` the card shows, in full. `suggest` is a spy over a stubbed
// `Workout` (W-R7E4 plus a warm-up set), so the engine's output is pinned for every assert.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { Workout } from "@workoutlab/engine";
import {
  L1_WITH_WARMUP,
  PROFILE,
  W_R7E4_ITEMS,
  W_R7E4_WITH_WARMUP,
  targets,
  workoutItem,
  workoutOf,
} from "./fixtures.js";
import {
  location,
  macrotask,
  part,
  previewScreenRoot,
  renderSwitch,
  screenRoot,
} from "./helpers.js";
import { Today as TodaySwitch } from "../index.js";

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
const suggestSpy = vi.mocked(suggest);

let online = false;

beforeEach(() => {
  online = false;
  auth.status = "signed-in";
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
  suggestSpy.mockReset();
  mocks.loadEngineHistory.mockReset().mockResolvedValue([]);
  mocks.loadTargets.mockReset().mockResolvedValue(targets());
  mocks.loadLibrary.mockReset().mockResolvedValue(L1_WITH_WARMUP);
  mocks.loadProfile.mockReset().mockResolvedValue(PROFILE);
  mocks.lastSyncedAt.mockReset().mockResolvedValue(null);
  mocks.refreshAll.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function stubWorkout(workout: Workout | null): void {
  if (workout === null) {
    suggestSpy.mockImplementation(() => {
      throw new Error("engine broke");
    });
    return;
  }
  suggestSpy.mockReturnValue(workout);
}

const previewRows = (): string[] =>
  [...document.querySelectorAll('[data-part="preview-row"]')].map((el) => el.textContent ?? "");
const previewChips = (): string[] =>
  [...document.querySelectorAll('[data-part="preview-chip"]')].map((el) => el.textContent ?? "");

async function waitForPreview(): Promise<HTMLElement> {
  await waitFor(() => {
    expect(previewScreenRoot()).not.toBeNull();
  });
  return previewScreenRoot()!;
}

describe("T-0302b AC-1 route", () => {
  it("/?view=preview renders UF-02.2, not UF-02.1, with the 45-min heading", async () => {
    stubWorkout(W_R7E4_WITH_WARMUP);
    renderSwitch({ initialEntries: ["/?view=preview"] });
    await waitForPreview();
    expect(screenRoot()).toBeNull();
    expect(previewScreenRoot()).not.toBeNull();
    expect(part("preview-skeleton")).toBeNull();
    expect(document.querySelector("h1")!.textContent).toBe("Suggested for 45 min");
  });

  it("the Back link leads to UF-02.1 (href=/)", async () => {
    stubWorkout(W_R7E4_WITH_WARMUP);
    renderSwitch({ initialEntries: ["/?view=preview"] });
    await waitForPreview();
    const back = screen.getByRole("link", { name: "Back" });
    expect(back).toHaveAttribute("href", "/");
    fireEvent.click(back);
    expect(location()).toBe("/");
  });

  it("the browser Back after arriving from See all also lands on UF-02.1", async () => {
    stubWorkout(W_R7E4_WITH_WARMUP);
    const router = createMemoryRouter(
      [
        {
          path: "/",
          element: <TodaySwitch now={new Date("2026-09-27T10:00:00Z")} timeZone="UTC" />,
        },
      ],
      { initialEntries: ["/", "/?view=preview"], initialIndex: 1 },
    );
    const { render } = await import("@testing-library/react");
    render(<RouterProvider router={router} />);
    await waitFor(() => expect(previewScreenRoot()).not.toBeNull());
    router.navigate(-1);
    await waitFor(() => {
      expect(previewScreenRoot()).toBeNull();
      expect(document.querySelector('[data-screen-id="UF-02.1"]')).not.toBeNull();
    });
  });

  it("C-02 (the tab bar's purpose) stays visible on both: the pathname is still /", async () => {
    stubWorkout(W_R7E4_WITH_WARMUP);
    renderSwitch({ initialEntries: ["/?view=preview"] });
    await waitForPreview();
    expect(location()).toBe("/");
  });

  it.each([
    ["no view param", "/"],
    ["an unknown view", "/?view=other"],
  ])("%s: renders UF-02.1 only", async (_name, path) => {
    stubWorkout(W_R7E4_WITH_WARMUP);
    renderSwitch({
      initialEntries: [path],
      now: new Date("2026-09-27T10:00:00Z"),
      timeZone: "UTC",
    });
    await waitFor(() => expect(screenRoot()).not.toBeNull());
    expect(previewScreenRoot()).toBeNull();
  });
});

describe("T-0302b AC-2 W-R7E4 as it is", () => {
  it("chips: ~29 min, 9 sets, Barbell · Bench · Rack · Machine", async () => {
    stubWorkout(W_R7E4_WITH_WARMUP);
    renderSwitch({ initialEntries: ["/?view=preview"] });
    await waitForPreview();
    expect(previewChips()).toEqual(["~29 min", "9 sets", "Barbell · Bench · Rack · Machine"]);
  });

  it("the minutes chip follows itemsTotalS when warmupInBudget is false (~26 min)", async () => {
    stubWorkout({ ...W_R7E4_WITH_WARMUP, warmupInBudget: false });
    renderSwitch({ initialEntries: ["/?view=preview"] });
    await waitForPreview();
    expect(previewChips()[0]).toBe("~26 min");
  });

  it("warm-up row: Warm-up, the four library names joined, 3 min", async () => {
    stubWorkout(W_R7E4_WITH_WARMUP);
    renderSwitch({ initialEntries: ["/?view=preview"] });
    await waitForPreview();
    expect(part("warmup-name")!.textContent).toBe("Warm-up");
    expect(part("warmup-moves")!.textContent).toBe("Arm circle, Leg swing, Cat cow, Jumping jack");
    expect(part("warmup-minutes")!.textContent).toBe("3 min");
  });

  it("warm-up row reads 'not counted' when warmupInBudget is false", async () => {
    stubWorkout({ ...W_R7E4_WITH_WARMUP, warmupInBudget: false });
    renderSwitch({ initialEntries: ["/?view=preview"] });
    await waitForPreview();
    expect(part("warmup-minutes")!.textContent).toBe("not counted");
  });

  it("rows in plan order: Bench press, Inverted row, Leg extension, with detail and reason", async () => {
    stubWorkout(W_R7E4_WITH_WARMUP);
    renderSwitch({ initialEntries: ["/?view=preview"] });
    await waitForPreview();
    const rows = previewRows();
    expect(rows).toHaveLength(3);
    expect(rows[0]).toBe("Bench press4 × 6–8 · rest 2:00Main lift · Chest 100 % below target");
    expect(rows[1]).toBe("Inverted row3 × 8–12 · Bodyweight · rest 2:00Back 100 % below target");
    expect(rows[2]).toBe("Leg extension2 × 10–15 · rest 1:00Quads 100 % below target");
  });

  it("a fixture with the items reversed renders reversed", async () => {
    stubWorkout(workoutOf([...W_R7E4_ITEMS].reverse(), { itemsTotalS: 1545, totalS: 1725 }));
    renderSwitch({ initialEntries: ["/?view=preview"] });
    await waitForPreview();
    const names = previewRows().map((r) => r.split(/\d/)[0]);
    expect(names[0]).toMatch(/^Leg extension/);
    expect(names[2]).toMatch(/^Bench press/);
  });
});

describe("T-0302b AC-3 weight part", () => {
  it("bench-press prefill.weightKg 80 reads 80 kg (formatKg, no-break space)", async () => {
    const items = [
      { ...W_R7E4_ITEMS[0]!, prefill: { ...W_R7E4_ITEMS[0]!.prefill, weightKg: 80 } },
      W_R7E4_ITEMS[1]!,
      W_R7E4_ITEMS[2]!,
    ];
    stubWorkout(workoutOf(items, { itemsTotalS: 1545, totalS: 1725 }));
    renderSwitch({ initialEntries: ["/?view=preview"] });
    await waitForPreview();
    expect(previewRows()[0]).toContain("80 kg");
  });

  it("prefill.weightKg null: no kg text, and never '0 kg' or 'null'", async () => {
    stubWorkout(
      workoutOf([W_R7E4_ITEMS[0]!, W_R7E4_ITEMS[2]!], { itemsTotalS: 990, totalS: 1170 }),
    );
    renderSwitch({ initialEntries: ["/?view=preview"] });
    await waitForPreview();
    const text = previewRows().join(" ");
    expect(text).not.toMatch(/0 kg|null/);
  });

  it("externalLoad: false reads Bodyweight even when weightKg is 0", async () => {
    stubWorkout(workoutOf([W_R7E4_ITEMS[1]!], { itemsTotalS: 555, totalS: 735 }));
    renderSwitch({ initialEntries: ["/?view=preview"] });
    await waitForPreview();
    expect(previewRows()[0]).toContain("Bodyweight");
    expect(previewRows()[0]).not.toMatch(/0 kg/);
  });

  it("a timed item (durationS 45, repsMin null) shows '3 × 45 s' and no weight", async () => {
    stubWorkout(
      workoutOf(
        [
          workoutItem("plank", 3, null, null, {
            durationS: 45,
            prefill: { weightKg: null, reps: null, durationS: 45, kind: "first_time" },
          }),
        ],
        { itemsTotalS: 600, totalS: 780 },
      ),
    );
    renderSwitch({ initialEntries: ["/?view=preview"] });
    await waitForPreview();
    expect(previewRows()[0]).toContain("3 × 45 s");
    expect(previewRows()[0]).not.toMatch(/kg/);
  });

  it("a backoff {weightKg: 70, reps: 6} shows the back-off line and the sets chip counts it (+1)", async () => {
    const items = [
      { ...W_R7E4_ITEMS[0]!, backoff: { weightKg: 70, reps: 6 } },
      W_R7E4_ITEMS[1]!,
      W_R7E4_ITEMS[2]!,
    ];
    stubWorkout(workoutOf(items, { itemsTotalS: 1545, totalS: 1725 }));
    renderSwitch({ initialEntries: ["/?view=preview"] });
    await waitForPreview();
    expect(part("row-backoff")!.textContent).toBe("+ 1 back-off 70 kg × 6");
    expect(previewChips()[1]).toBe("10 sets");
  });
});

describe("T-0302b AC-4 links", () => {
  it("each exercise name links to /library/<exerciseId>", async () => {
    stubWorkout(W_R7E4_WITH_WARMUP);
    renderSwitch({ initialEntries: ["/?view=preview"] });
    await waitForPreview();
    expect(screen.getByRole("link", { name: "Bench press" })).toHaveAttribute(
      "href",
      "/library/bench-press",
    );
    expect(screen.getByRole("link", { name: "Inverted row" })).toHaveAttribute(
      "href",
      "/library/inverted-row",
    );
    expect(screen.getByRole("link", { name: "Leg extension" })).toHaveAttribute(
      "href",
      "/library/leg-extension",
    );
  });

  it("Start workout goes to /session/setup", async () => {
    stubWorkout(W_R7E4_WITH_WARMUP);
    renderSwitch({ initialEntries: ["/?view=preview"] });
    await waitForPreview();
    const start = screen.getByRole("link", { name: "Start workout" });
    expect(start).toHaveAttribute("href", "/session/setup");
  });

  it("no button or link named Swap, Remove, Edit or Shuffle", async () => {
    stubWorkout(W_R7E4_WITH_WARMUP);
    renderSwitch({ initialEntries: ["/?view=preview"] });
    await waitForPreview();
    for (const name of [/swap/i, /remove/i, /edit/i, /shuffle/i]) {
      expect(screen.queryByRole("link", { name })).toBeNull();
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
  });
});

describe("T-0302b AC-5 states", () => {
  it("loading: the skeleton, no li, no 'Nothing suggested yet'", async () => {
    mocks.loadEngineHistory.mockReturnValue(new Promise(() => {}));
    stubWorkout(W_R7E4_WITH_WARMUP);
    renderSwitch({ initialEntries: ["/?view=preview"] });
    expect(part("preview-skeleton")).not.toBeNull();
    expect(document.querySelectorAll("li")).toHaveLength(0);
    expect(screen.queryByText("Nothing suggested yet")).toBeNull();
  });

  it("workout null: 'Nothing suggested yet' and Start enabled", async () => {
    stubWorkout(null);
    renderSwitch({ initialEntries: ["/?view=preview"] });
    await waitForPreview();
    expect(screen.getByText("Nothing suggested yet")).toBeInTheDocument();
    const start = screen.getByRole("link", { name: "Start workout" });
    expect(start).not.toHaveAttribute("aria-disabled");
  });

  it("plan.items []: 'Nothing suggested yet' and Start enabled", async () => {
    stubWorkout(workoutOf([], { itemsTotalS: 0, totalS: 180 }));
    renderSwitch({ initialEntries: ["/?view=preview"] });
    await waitForPreview();
    expect(screen.getByText("Nothing suggested yet")).toBeInTheDocument();
    const start = screen.getByRole("link", { name: "Start workout" });
    expect(start).not.toHaveAttribute("aria-disabled");
  });

  it("no-plan: Today's no-plan line and Start", async () => {
    mocks.loadProfile.mockResolvedValue(null);
    renderSwitch({ initialEntries: ["/?view=preview"] });
    await waitFor(() => expect(previewScreenRoot()).not.toBeNull());
    expect(screen.getByText("Connect to finish setting up your plan")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start workout" })).toBeInTheDocument();
  });

  it("suggest is called exactly once per mount with PREVIEW_INPUT", async () => {
    stubWorkout(W_R7E4_WITH_WARMUP);
    renderSwitch({ initialEntries: ["/?view=preview"] });
    await waitForPreview();
    await macrotask();
    expect(suggestSpy).toHaveBeenCalledTimes(1);
    expect(suggestSpy.mock.calls[0]![4]).toEqual({
      budgetMin: 45,
      warmupInBudget: true,
      energy: "normal",
      shuffle: 0,
      mainLiftId: null,
      pinnedIds: [],
      excludeIds: [],
      favoriteIds: [],
    });
  });
});

describe("T-0302b AC-6 offline", () => {
  it("with navigator.onLine false, AC-2's content renders and fetch isn't called", async () => {
    online = false;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    stubWorkout(W_R7E4_WITH_WARMUP);
    renderSwitch({ initialEntries: ["/?view=preview"] });
    await waitForPreview();
    expect(previewChips()).toEqual(["~29 min", "9 sets", "Barbell · Bench · Rack · Machine"]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("T-0302b AC-8 exports and boundaries", () => {
  it("features/UF-02/index.tsx exports exactly Today", async () => {
    const mod = await import("../index.js");
    expect(Object.keys(mod)).toEqual(["Today"]);
  });
});
