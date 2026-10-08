// T-0570 UF-02.1 / UF-02.2 (D-0202 §6): the card and the preview pass the stored favorites to
// `suggest`. Real engine (spied) over the real `lib/offline` cache (fake-indexeddb).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Workout } from "@workoutlab/engine";
import { act, waitFor } from "@testing-library/react";
import { userScopedKey, type OfflineDb } from "../../../lib/offline/db.js";
import { L1, PROFILE, targets } from "./fixtures.js";
import {
  TEST_USER,
  freshDb,
  macrotask,
  renderSwitch,
  renderToday,
  seedCache,
  signIn,
  signOut,
} from "./helpers.js";

vi.mock("../slots.js", () => ({ todayCheckinSlot: null, todayResumeSlot: null }));
vi.mock("../../../lib/auth/auth-context.js", () => ({
  useAuth: () => ({
    status: "signed-in" as const,
    userId: "22222222-2222-4222-8222-222222222222",
    redirectTarget: "/welcome" as const,
    signOut: vi.fn(),
  }),
}));
vi.mock("@workoutlab/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workoutlab/engine")>();
  return { ...actual, suggest: vi.fn(actual.suggest) };
});
const { suggest } = await import("@workoutlab/engine");
const suggestSpy = vi.mocked(suggest);

const BENCH = "db-bench-press";
const SQUAT = "back-squat";
let online = false;
let db: OfflineDb;
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  online = true;
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
  fetchSpy = vi.fn(() => Promise.reject(new Error("no network")));
  vi.stubGlobal("fetch", fetchSpy);
  suggestSpy.mockClear();
  db = freshDb();
  signIn();
  await seedCache(db, { history: [], library: L1, targets: targets(), profile: PROFILE });
});

afterEach(() => {
  signOut();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const favsOfCalls = (): string[] =>
  suggestSpy.mock.calls.map((c) => JSON.stringify(c[4].favoriteIds));
const row = (exerciseId: string) => ({
  key: userScopedKey(TEST_USER, exerciseId),
  userId: TEST_USER,
  exerciseId,
  createdAt: "2026-09-25T10:00:00Z",
});
const setFavs = async (ids: string[]): Promise<void> => {
  await db.favoriteCache.clear();
  for (const id of ids) await db.favoriteCache.put(row(id));
};
const lastItemIds = (): string[] =>
  (suggestSpy.mock.results.at(-1)?.value as Workout).plan.items.map((i) => i.exerciseId);

describe("T-0570 AC1 stored favorites reach suggest", () => {
  it("card: sorted ids on every call, bench first", async () => {
    await setFavs([BENCH, SQUAT]);
    renderToday();
    await waitFor(() => expect(suggestSpy).toHaveBeenCalled());
    await macrotask();
    expect(new Set(favsOfCalls())).toEqual(new Set([JSON.stringify([SQUAT, BENCH])]));
    expect(lastItemIds()[0]).toBe(BENCH);
  });

  it("preview: the same", async () => {
    await setFavs([BENCH, SQUAT]);
    renderSwitch({ initialEntries: ["/?view=preview"] });
    await waitFor(() => expect(suggestSpy).toHaveBeenCalled());
    await macrotask();
    expect(new Set(favsOfCalls())).toEqual(new Set([JSON.stringify([SQUAT, BENCH])]));
    expect(lastItemIds()[0]).toBe(BENCH);
  });

  it("no favorites: favoriteIds []", async () => {
    renderToday();
    await waitFor(() => expect(suggestSpy).toHaveBeenCalled());
    await macrotask();
    expect(new Set(favsOfCalls())).toEqual(new Set(["[]"]));
  });
});

describe("T-0570 AC2 offline", () => {
  it("uses the cached list and requests nothing", async () => {
    online = false;
    await setFavs([BENCH]);
    renderToday();
    await waitFor(() => expect(suggestSpy).toHaveBeenCalled());
    await macrotask();
    expect(new Set(favsOfCalls())).toEqual(new Set([JSON.stringify([BENCH])]));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("T-0570 AC3 live update", () => {
  it("recomputes with [] when the cache changes to []", async () => {
    online = false;
    await setFavs([BENCH]);
    renderToday();
    await waitFor(() => expect(suggestSpy).toHaveBeenCalled());
    await macrotask();
    suggestSpy.mockClear();
    await act(async () => {
      await setFavs([]);
    });
    await waitFor(() => expect(favsOfCalls()).toContain("[]"));
  });
});

describe("T-0570 AC4 exclusion wins", () => {
  it("favorite and excluded: not on the card", async () => {
    await setFavs([BENCH]);
    await db.excludedCache.put(row(BENCH));
    renderToday();
    await waitFor(() => expect(suggestSpy).toHaveBeenCalled());
    await macrotask();
    expect(lastItemIds()).not.toContain(BENCH);
  });
});
