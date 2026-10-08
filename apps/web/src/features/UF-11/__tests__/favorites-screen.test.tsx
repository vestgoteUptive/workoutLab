// T-0569 UF-11.2 row + UF-11.6 (D-0202 §8-§10). Real Dexie (fake-indexeddb) for every cache; only
// the network helpers in lib/offline/favorites and excluded are replaced, and the stubs write the
// cache the way the real ones do after the server confirms.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  configure,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import type { LibraryExercise } from "@workoutlab/shared";
import { offlineDb, userScopedKey } from "../../../lib/offline/db.js";

// T-0913: every wait here follows a Dexie write plus a liveQuery re-render, which
// can pass waitFor's 1 s default on a loaded CI box (seen at 1031 ms). Waits still
// resolve on observable state as soon as it appears; 4 s (under the 5 s test timeout) is only the failure ceiling.
configure({ asyncUtilTimeout: 4_000 });

const h = vi.hoisted(() => ({
  add: undefined as undefined | ((u: string, id: string) => Promise<void>),
  remove: undefined as undefined | ((u: string, id: string) => Promise<void>),
  exclude: undefined as undefined | ((u: string, id: string) => Promise<void>),
}));
vi.mock("../../../lib/offline/favorites.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../lib/offline/favorites.js")>();
  return {
    ...real,
    refreshFavorites: vi.fn(async () => undefined),
    favoriteExercise: vi.fn(async (u: string, id: string) => h.add?.(u, id)),
    unfavoriteExercise: vi.fn(async (u: string, id: string) => h.remove?.(u, id)),
  };
});
vi.mock("../../../lib/offline/excluded.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../lib/offline/excluded.js")>();
  return {
    ...real,
    refreshExcluded: vi.fn(async () => undefined),
    excludeExercise: vi.fn(async (u: string, id: string) => h.exclude?.(u, id)),
  };
});
vi.mock("../../../lib/offline/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/index.js")>();
  return { ...actual, refreshAll: vi.fn(async () => undefined) };
});
const { createFromSpy } = await import("./test-helpers.js");
const spy = createFromSpy();
vi.mock("../../../lib/auth/client.js", () => ({
  supabase: { from: (table: string) => spy.from(table) },
  isSupabaseConfigured: () => true,
}));

const fav = await import("../../../lib/offline/favorites.js");
const { Plan, ExcludedExercises, FavoriteExercises } = await import("../index.js");
const { freshDb, seedCache, signIn, TEST_USER: A, useTimeZone } = await import("./test-helpers.js");
const { NOW, TZ, profileF, targetsF } = await import("./fixtures.js");

function lib(
  id: string,
  name: string,
  areas: LibraryExercise["areas"],
  extra: Partial<LibraryExercise> = {},
): LibraryExercise {
  return {
    id,
    name,
    kind: "exercise",
    type: "compound",
    level: "beginner",
    equipment: [],
    areas,
    timed: false,
    incrementKg: 2.5,
    defaultDurationS: null,
    externalLoad: true,
    ...extra,
  };
}
const L1: LibraryExercise[] = [
  lib("bench-press", "Bench press", { chest: 1, shoulders: 1 }),
  lib("db-bench-press", "Dumbbell bench press", { chest: 1, shoulders: 0.5 }),
  lib("lateral-raise", "Lateral raise", { shoulders: 1 }, { type: "isolation" }),
  lib("back-squat", "Back squat", { quads: 1, glutes: 1 }, { equipment: ["barbell"] }),
  lib("pull-up", "Pull up", { back: 1, arms: 0.5 }, { level: "advanced" }),
  lib("bench-warmup", "Bench press warm-up", { chest: 1 }, { kind: "warmup" }),
];
const ALL_EQUIPMENT = ["barbell", "dumbbells", "none"] as never;

const row = (exerciseId: string, createdAt = "2026-10-01T10:00:00.000Z") => ({
  key: userScopedKey(A, exerciseId),
  userId: A,
  exerciseId,
  createdAt,
});
const seedFavorites = (...ids: string[]) =>
  offlineDb().favoriteCache.bulkPut(ids.map((i) => row(i)));
const seedExcluded = (...ids: string[]) =>
  offlineDb().excludedCache.bulkPut(ids.map((i) => row(i)));
const setOnline = (v: boolean) => vi.spyOn(navigator, "onLine", "get").mockReturnValue(v);

function tree(at: string) {
  return (
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route path="/plan" element={<Plan now={() => NOW} />} />
        <Route path="/plan/excluded" element={<ExcludedExercises />} />
        <Route path="/plan/favorites" element={<FavoriteExercises />} />
      </Routes>
    </MemoryRouter>
  );
}

async function seed(profile = profileF({ equipment: ALL_EQUIPMENT })) {
  await seedCache(offlineDb(), { profile, targets: targetsF(), library: L1 });
}

beforeEach(async () => {
  freshDb();
  signIn(A);
  useTimeZone(TZ);
  await seed();
  h.add = async (_u, id) => {
    await offlineDb().favoriteCache.put(row(id));
    await offlineDb().excludedCache.delete(userScopedKey(A, id));
  };
  h.remove = async (u, id) => void (await offlineDb().favoriteCache.delete(userScopedKey(u, id)));
  h.exclude = async (_u, id) => {
    await offlineDb().excludedCache.put(row(id));
    await offlineDb().favoriteCache.delete(userScopedKey(A, id));
  };
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  vi.mocked(fav.favoriteExercise).mockClear();
  vi.mocked(fav.unfavoriteExercise).mockClear();
  vi.mocked(fav.refreshFavorites).mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function searchbox() {
  await waitFor(() => expect(document.querySelector("[aria-busy]")).toBeNull());
  return screen.getByRole("searchbox", { name: "Search exercises" });
}
const resultNames = () =>
  within(screen.getByRole("list", { name: "Exercises" }))
    .getAllByRole("listitem")
    .map((li) => li.querySelector(".wl-plan__name")!.textContent);
const groupsOf = () =>
  [...document.querySelectorAll("section.wl-card")].map((sec) => [
    sec.querySelector("h2")!.textContent,
    [...sec.querySelectorAll(".wl-plan__name")].map((n) => n.textContent),
  ]);

describe("AC1 row on UF-11.2", () => {
  it("sits directly before the Excluded row with the count", async () => {
    await seedFavorites("back-squat", "lateral-raise");
    await seedExcluded("bench-press");
    const { container } = render(tree("/plan"));
    const link = await screen.findByRole("link", { name: "Favorite exercises, 2" });
    expect(link).toHaveTextContent("Favorite exercises · 2");
    const cards = [...container.querySelectorAll("section.wl-card")];
    const at = cards.findIndex((c) => c.contains(link));
    expect(cards[at + 1]).toContainElement(
      await screen.findByRole("link", { name: "Excluded exercises, 1" }),
    );
  });

  it("says 'none' with no favorites", async () => {
    render(tree("/plan"));
    expect(await screen.findByRole("link", { name: "Favorite exercises, none" })).toHaveTextContent(
      "Favorite exercises · none",
    );
  });
});

describe("AC2 grouped list", () => {
  it("opens from the row; groups in the fixed area order, a two-area exercise under both", async () => {
    await seedFavorites("back-squat", "lateral-raise");
    render(tree("/plan"));
    fireEvent.click(await screen.findByRole("link", { name: "Favorite exercises, 2" }));
    await screen.findByRole("heading", { level: 1, name: "Favorite exercises" });
    expect(document.querySelector('[data-screen-id="UF-11.6"]')).not.toBeNull();
    await waitFor(() =>
      expect(groupsOf()).toEqual([
        ["Shoulders", ["Lateral raise"]],
        ["Glutes", ["Back squat"]],
        ["Quads", ["Back squat"]],
      ]),
    );
    expect(
      screen.getByRole("button", { name: "Remove Back squat from favorites, Glutes" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Remove Back squat from favorites, Quads" }),
    ).toBeVisible();
    expect(fav.refreshFavorites).toHaveBeenCalled();
  });
});

describe("AC2 only weight-1.0 areas", () => {
  it("a 0.5-weight area gets no group", async () => {
    await seedFavorites("db-bench-press");
    render(tree("/plan/favorites"));
    await waitFor(() => expect(groupsOf()).toEqual([["Chest", ["Dumbbell bench press"]]]));
  });
});

describe("AC3 search and Add", () => {
  it("lists matches, never warm-ups; Add on an excluded exercise moves it and says so", async () => {
    await seedFavorites("back-squat");
    await seedExcluded("bench-press");
    render(tree("/plan/favorites"));
    fireEvent.change(await searchbox(), { target: { value: "BENCH" } });
    expect(resultNames()).toEqual(["Bench press", "Dumbbell bench press"]);
    const [first, second] = screen.getAllByRole("listitem");
    expect(first).toHaveTextContent("Excluded");
    expect(first).toHaveTextContent("Chest, Shoulders");
    expect(second).not.toHaveTextContent("Excluded");
    fireEvent.click(screen.getByRole("button", { name: "Add Bench press to favorites" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Remove Bench press from favorites" }),
      ).toBeVisible(),
    );
    expect(fav.favoriteExercise).toHaveBeenCalledTimes(1);
    expect(fav.favoriteExercise).toHaveBeenCalledWith(A, "bench-press");
    const item = screen.getAllByRole("listitem")[0]!;
    expect(item).toHaveTextContent("Favorite");
    expect(item).not.toHaveTextContent("Excluded");
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Bench press is a favorite and will be suggested again.",
      ),
    );
  });

  it("a plain Add announces 'added to favorites'", async () => {
    render(tree("/plan/favorites"));
    fireEvent.change(await searchbox(), { target: { value: "lateral" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Lateral raise to favorites" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Lateral raise added to favorites"),
    );
  });
});

describe("AC4 eligibility lines", () => {
  it("no equipment: both Back squat rows read 'Not available with your equipment'", async () => {
    await seed(profileF({ equipment: [] }));
    await seedFavorites("back-squat");
    render(tree("/plan/favorites"));
    await waitFor(() =>
      expect(screen.getAllByText("Not available with your equipment")).toHaveLength(2),
    );
    expect(screen.queryByText("Above your level")).toBeNull();
  });

  it("beginner with full equipment: Pull up reads 'Above your level'", async () => {
    await seed(profileF({ level: "beginner", equipment: ALL_EQUIPMENT }));
    await seedFavorites("pull-up");
    render(tree("/plan/favorites"));
    await waitFor(() => expect(screen.getAllByText("Above your level").length).toBeGreaterThan(0));
    expect(screen.queryByText("Not available with your equipment")).toBeNull();
  });

  it("an eligible favorite has no line", async () => {
    await seedFavorites("back-squat");
    render(tree("/plan/favorites"));
    await waitFor(() => expect(groupsOf()).toHaveLength(2));
    expect(screen.queryByText("Above your level")).toBeNull();
    expect(screen.queryByText("Not available with your equipment")).toBeNull();
  });
});

describe("AC5 Remove and empty states", () => {
  it("Remove drops the group and the UF-11.2 count follows", async () => {
    await seedFavorites("back-squat", "lateral-raise");
    render(tree("/plan/favorites"));
    await waitFor(() => expect(groupsOf()).toHaveLength(3));
    fireEvent.click(
      screen.getByRole("button", { name: "Remove Lateral raise from favorites, Shoulders" }),
    );
    await waitFor(() => expect(groupsOf().map((g) => g[0])).toEqual(["Glutes", "Quads"]));
    expect(fav.unfavoriteExercise).toHaveBeenCalledWith(A, "lateral-raise");
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Lateral raise removed from favorites"),
    );
    fireEvent.click(screen.getByRole("link", { name: "Back to Plan" }));
    expect(await screen.findByRole("link", { name: "Favorite exercises, 1" })).toBeVisible();
  });

  it("focus moves to the next row's Remove, then to the search field", async () => {
    await seedFavorites("lateral-raise", "bench-press");
    render(tree("/plan/favorites"));
    await waitFor(() => expect(groupsOf()).toHaveLength(2));
    fireEvent.click(
      screen.getByRole("button", { name: "Remove Bench press from favorites, Chest" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Remove Lateral raise from favorites, Shoulders" }),
      ).toHaveFocus(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Remove Lateral raise from favorites, Shoulders" }),
    );
    await waitFor(() => expect(screen.getByRole("searchbox")).toHaveFocus());
  });

  it("empty and no-match copy", async () => {
    render(tree("/plan/favorites"));
    expect(
      await screen.findByText(
        "No favorites yet. Search to add one, or tap Favorite on an exercise.",
      ),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzz" } });
    expect(screen.getByText("No exercises match “zzz”.")).toBeInTheDocument();
  });
});

describe("AC6 offline", () => {
  it("disables every Add and Remove with one description and re-enables on 'online'", async () => {
    await seedFavorites("back-squat", "lateral-raise");
    setOnline(false);
    render(tree("/plan/favorites"));
    await waitFor(() => expect(groupsOf()).toHaveLength(3));
    const buttons = screen.getAllByRole("button", { name: /^Remove / });
    expect(buttons).toHaveLength(3);
    const note = screen.getByText("Connect to change favorites");
    expect(screen.getAllByText("Connect to change favorites")).toHaveLength(1);
    for (const b of buttons) {
      expect(b).toHaveAttribute("aria-disabled", "true");
      expect(b).toHaveAttribute("aria-describedby", note.id);
    }
    fireEvent.click(buttons[0]!);
    expect(fav.unfavoriteExercise).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "bench" } });
    for (const b of screen.getAllByRole("button", { name: /^Add / })) {
      expect(b).toHaveAttribute("aria-disabled", "true");
    }

    setOnline(true);
    act(() => void window.dispatchEvent(new Event("online")));
    await waitFor(() => {
      for (const b of screen.getAllByRole("button", { name: /^Add / })) {
        expect(b).not.toHaveAttribute("aria-disabled");
      }
    });
    expect(screen.queryByText("Connect to change favorites")).toBeNull();
  });
});

describe("AC7 write failure", () => {
  it("keeps the list, shows role=alert and enables Add again", async () => {
    h.add = async () => {
      throw new fav.FavoriteWriteError("server");
    };
    render(tree("/plan/favorites"));
    fireEvent.change(await searchbox(), { target: { value: "dumbbell bench" } });
    const btn = screen.getByRole("button", { name: "Add Dumbbell bench press to favorites" });
    fireEvent.click(btn);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save. Try again.");
    expect(await offlineDb().favoriteCache.count()).toBe(0);
    await waitFor(() => expect(btn).not.toHaveAttribute("aria-disabled"));
    expect(btn).toHaveTextContent("Add");
  });
});

describe("AC8 UF-11.5 move line", () => {
  it("excluding a favorite says it was removed from favorites; UF-11.2 shows none", async () => {
    await seedFavorites("bench-press");
    render(tree("/plan/excluded"));
    fireEvent.change(await searchbox(), { target: { value: "bench press" } });
    fireEvent.click(screen.getByRole("button", { name: "Exclude Bench press" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Bench press won't be suggested. Removed from favorites.",
      ),
    );
    expect(await offlineDb().favoriteCache.count()).toBe(0);
    fireEvent.click(screen.getByRole("link", { name: "Back to Plan" }));
    expect(await screen.findByRole("link", { name: "Favorite exercises, none" })).toBeVisible();
  });

  it("excluding a non-favorite keeps the plain line", async () => {
    render(tree("/plan/excluded"));
    fireEvent.change(await searchbox(), { target: { value: "lateral" } });
    fireEvent.click(screen.getByRole("button", { name: "Exclude Lateral raise" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/^Lateral raise excluded$/),
    );
  });
});

describe("AC9 reachability", () => {
  it("no source under UF-03, UF-08 or UF-09 links to /plan/favorites", () => {
    const root = resolve(__dirname, "../..");
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) {
          if (name !== "__tests__") walk(p);
        } else if (
          /\.(tsx?|css)$/.test(name) &&
          readFileSync(p, "utf8").includes("plan/favorites")
        ) {
          hits.push(p);
        }
      }
    };
    for (const f of ["UF-03", "UF-08", "UF-09"]) walk(join(root, f));
    expect(hits).toEqual([]);
  });
});
