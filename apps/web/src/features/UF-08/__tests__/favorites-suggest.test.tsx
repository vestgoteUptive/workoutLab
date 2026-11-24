// T-0571 UF-08.1/UF-08.2 (D-0202 §6, §8): the stored favorites reach every `suggest` call, and
// UF-08.2 tags a favorite row. The real engine runs; only the loaders and the lists are mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { suggest } from "@workoutlab/engine";
import { fitLine, renderSetup, screenIds, serveCache, setOnline, settle } from "./harness.js";

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
  it("fit line and a time chip pass the sorted favorites", async () => {
    lists.fav = ["db-bench-press", "back-squat", "back-squat"];
    await toPlan();
    fireEvent.click(button("45 minutes"));
    // T-0998: Shuffle is retired and an Add is local (no `suggest`), so these are the calls.
    expect(spy.mock.calls.length).toBeGreaterThan(1);
    for (const i of inputs()) expect(i.favoriteIds).toEqual(["back-squat", "db-bench-press"]);
  });

  it("no favorites: every call has []", async () => {
    await toPlan();
    fireEvent.click(button("45 minutes"));
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
