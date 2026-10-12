// T-0582 UF-11.5/11.6: a cold direct load (no library cache yet) fills in when the cache arrives.
// The test controls the moment the library lands by writing the Dexie cache itself.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, configure, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import type { LibraryExercise } from "@workoutlab/shared";
import { offlineDb, userScopedKey } from "../../../lib/offline/db.js";

configure({ asyncUtilTimeout: 4_000 });

vi.mock("../../../lib/offline/favorites.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../lib/offline/favorites.js")>()),
  refreshFavorites: vi.fn(async () => undefined),
}));
vi.mock("../../../lib/offline/excluded.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../lib/offline/excluded.js")>()),
  refreshExcluded: vi.fn(async () => undefined),
}));
const { createFromSpy } = await import("./test-helpers.js");
const spy = createFromSpy();
vi.mock("../../../lib/auth/client.js", () => ({
  supabase: { from: (table: string) => spy.from(table) },
  isSupabaseConfigured: () => true,
}));

const { ExcludedExercises, FavoriteExercises } = await import("../index.js");
const { freshDb, seedCache, signIn, TEST_USER: A, useTimeZone } = await import("./test-helpers.js");
const { TZ, profileF, targetsF } = await import("./fixtures.js");

const BENCH: LibraryExercise = {
  id: "bench-press",
  name: "Bench press",
  kind: "exercise",
  type: "compound",
  level: "beginner",
  equipment: [],
  areas: { chest: 1 },
  timed: false,
  incrementKg: 2.5,
  defaultDurationS: null,
  externalLoad: true,
};
const row = (exerciseId: string) => ({
  key: userScopedKey(A, exerciseId),
  userId: A,
  exerciseId,
  createdAt: "2026-10-01T10:00:00.000Z",
});
const arrive = () =>
  act(async () => {
    await offlineDb().libraryCache.put({ key: `${A}:${BENCH.id}`, userId: A, exercise: BENCH });
  });
const setOnline = (v: boolean) => vi.spyOn(navigator, "onLine", "get").mockReturnValue(v);
const OFFLINE_LINE = "Exercises aren't available offline yet";

function tree(at: string) {
  return (
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route path="/plan/excluded" element={<ExcludedExercises />} />
        <Route path="/plan/favorites" element={<FavoriteExercises />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(async () => {
  const db = freshDb();
  signIn(A);
  useTimeZone(TZ);
  await seedCache(db, { profile: profileF(), targets: targetsF() });
  await db.excludedCache.put(row(BENCH.id));
  await db.favoriteCache.put(row(BENCH.id));
  setOnline(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AC-1 re-read when the library cache arrives", () => {
  it("UF-11.5 shows the name once the library lands, without a reload", async () => {
    render(tree("/plan/excluded"));
    expect(await screen.findByText("bench-press")).toBeInTheDocument();
    await arrive();
    expect(await screen.findByText("Bench press")).toBeInTheDocument();
    expect(screen.queryByText("bench-press")).toBeNull();
  });

  it("UF-11.6 shows the group and name once the library lands, without a reload", async () => {
    render(tree("/plan/favorites"));
    expect(await screen.findByText(/No favorites yet/)).toBeInTheDocument();
    await arrive();
    expect(await screen.findByText("Bench press")).toBeInTheDocument();
    expect(screen.queryByText(/No favorites yet/)).toBeNull();
  });
});

describe("AC-2 cold, offline, no cache", () => {
  it.each([
    ["UF-11.5", "/plan/excluded"],
    ["UF-11.6", "/plan/favorites"],
  ])("%s shows the neutral line, not an empty list", async (_id, at) => {
    setOnline(false);
    render(tree(at));
    expect(await screen.findByText(OFFLINE_LINE)).toBeInTheDocument();
    await arrive();
    expect(await screen.findByText("Bench press")).toBeInTheDocument();
    expect(screen.queryByText(OFFLINE_LINE)).toBeNull();
  });
});
