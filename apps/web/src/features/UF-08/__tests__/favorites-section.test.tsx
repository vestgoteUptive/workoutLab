// T-0577 UF-08.5 Favorites section, AC1-AC6 (docs/tickets/T-0577). Loaders and the two list
// hooks mocked; the real engine runs. AC7 is tests/e2e/uf-08-add.spec.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { fCache, fitLine, renderSetup, screenIds, serveCache, setOnline } from "./harness.js";
import { settle } from "./harness.js";
import type { HistorySet } from "@workoutlab/engine";
import { NOW, fLibrary } from "./fixtures.js";

const lists = vi.hoisted(() => ({
  fav: [] as string[],
  favLoaded: true,
  excluded: [] as string[],
}));
vi.mock("../../../lib/auth/auth-context.js", () => ({
  useAuth: () => ({ status: "signed-in", userId: "A" }),
}));
vi.mock("../../../lib/offline/excluded-hooks.js", () => ({
  useExcludedList: () => ({ ids: lists.excluded, loaded: true }),
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

beforeEach(() => {
  lists.fav = [];
  lists.favLoaded = true;
  lists.excluded = [];
  setOnline(false);
  serveCache();
});
afterEach(() => {
  vi.restoreAllMocks();
});

const button = (name: string) => screen.getByRole("button", { name });
const dialog = () => screen.getByRole("dialog");

async function toPlan(): Promise<void> {
  renderSetup();
  await waitFor(() => expect(fitLine().textContent).toMatch(/^(Fits|Nothing)/));
  fireEvent.click(button("30 minutes"));
  await settle();
  fireEvent.click(button("Suggest my workout"));
  expect(screenIds()).toEqual(["UF-08.2"]);
}

const openSheet = () => fireEvent.click(button("Add exercise"));
const names = (root: HTMLElement) =>
  Array.from(root.querySelectorAll(".wl-uf08__pick-name")).map((n) =>
    (n.firstChild?.textContent ?? "").trim(),
  );
const headings = () =>
  within(dialog())
    .getAllByRole("heading", { level: 2 })
    .map((h) => h.textContent);
const pickRow = (name: string) =>
  Array.from(dialog().querySelectorAll<HTMLElement>('[data-part="pick-row"]')).find(
    (r) => r.querySelector(".wl-uf08__pick-name")?.firstChild?.textContent === name,
  )!;
const tag = (row: HTMLElement) => within(row).queryByText("Favorite");

const hoursBefore = (h: number) => new Date(new Date(NOW).getTime() - h * 3_600_000).toISOString();
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

describe("AC1 Favorites first", () => {
  it("Favorites (Back squat, Lateral raise, tagged) before Today's areas; Quads without Back squat", async () => {
    lists.fav = ["lateral-raise", "back-squat"];
    await toPlan();
    openSheet();
    expect(headings().slice(0, 3)).toEqual(["Add exercise", "Favorites", "Today's areas"]);
    expect(headings().slice(3)).toEqual(["Chest", "Back", "Quads"]);
    const favSection = dialog().querySelector("section")!;
    expect(names(favSection as HTMLElement)).toEqual(["Back squat", "Lateral raise"]);
    for (const n of ["Back squat", "Lateral raise"]) expect(tag(pickRow(n))).not.toBeNull();
    const quads = within(screen.getByRole("region", { name: "Quads" }));
    expect(quads.getByText("Leg extension").closest("li")).toHaveTextContent("In this workout");
    expect(quads.queryByText("Back squat")).toBeNull();
  });

  it("a recovering favorite reads 'Glutes is recovering' under Favorites", async () => {
    lists.fav = ["back-squat"];
    serveCache(() => fCache({ history: hardSets("back-squat", 6, hoursBefore(24)) }));
    await toPlan();
    openSheet();
    expect(within(pickRow("Back squat")).getByText("Glutes is recovering")).toBeInTheDocument();
  });
});

describe("AC1 waits for the favorites list", () => {
  it("shows no sections until loaded", async () => {
    lists.fav = ["back-squat"];
    await toPlan();
    lists.favLoaded = false;
    openSheet();
    expect(headings()).toEqual(["Add exercise"]);
    expect(screen.queryByText("Search to find an exercise.")).toBeNull();
  });
});

describe("AC2 no favorites", () => {
  it("no Favorites heading; Quads lists Back squat and Leg extension", async () => {
    await toPlan();
    openSheet();
    expect(headings()).not.toContain("Favorites");
    const quads = within(screen.getByRole("region", { name: "Quads" }));
    expect(quads.getByText("Back squat")).toBeInTheDocument();
    expect(quads.getByText("Leg extension")).toBeInTheDocument();
    expect(dialog().querySelector('[data-part="favorite-tag"]')).toBeNull();
  });
});

describe("an area whose exercises are all favorites", () => {
  it("has no heading under Today's areas", async () => {
    lists.fav = fLibrary()
      .filter((e) => e.kind === "exercise" && e.areas.chest === 1)
      .map((e) => e.id);
    expect(lists.fav.length).toBeGreaterThan(0);
    await toPlan();
    openSheet();
    expect(headings()).toEqual(["Add exercise", "Favorites", "Today's areas", "Back", "Quads"]);
  });
});

describe("AC3 no items", () => {
  it("Favorites, then the search hint, no Today's areas", async () => {
    lists.fav = ["back-squat"];
    await toPlan();
    for (const n of ["Leg extension", "Inverted row", "Bench press"]) {
      fireEvent.click(button(`Remove ${n}`));
    }
    openSheet();
    expect(headings()).toEqual(["Add exercise", "Favorites"]);
    expect(names(dialog())).toEqual(["Back squat"]);
    expect(within(dialog()).getByText("Search to find an exercise.")).toBeInTheDocument();
    expect(screen.queryByText("Today's areas")).toBeNull();
  });
});

describe("AC4 offline", () => {
  it("shows the section with no network request", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchSpy);
    try {
      lists.fav = ["back-squat"];
      await toPlan();
      openSheet();
      expect(headings()[1]).toBe("Favorites");
      expect(tag(pickRow("Back squat"))).not.toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("AC5 search tag", () => {
  it("only the favorite result has the tag", async () => {
    lists.fav = ["back-squat"];
    await toPlan();
    openSheet();
    fireEvent.change(within(dialog()).getByLabelText("Search exercises"), {
      target: { value: "a" },
    });
    const rows = dialog().querySelectorAll<HTMLElement>('[data-part="pick-row"]');
    expect(rows.length).toBeGreaterThan(1);
    const tagged = Array.from(rows).filter((r) => tag(r) !== null);
    expect(tagged).toEqual([pickRow("Back squat")]);
  });
});

describe("AC6 exclusion wins", () => {
  it("a favorite that is excluded reads Excluded with Add disabled", async () => {
    lists.fav = ["back-squat"];
    lists.excluded = ["back-squat"];
    await toPlan();
    openSheet();
    const row = pickRow("Back squat");
    expect(
      within(row).getByText("Excluded. Include it again in Plan › Excluded exercises."),
    ).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Add Back squat" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});
