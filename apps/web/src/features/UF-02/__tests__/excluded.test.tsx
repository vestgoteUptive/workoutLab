// T-0542 UF-02.1 / UF-02.2 (D-0199 §5): the card and the preview pass the stored excluded list to
// `suggest`. Real engine (spied) over the real `lib/offline` cache (fake-indexeddb).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Workout } from "@workoutlab/engine";
import { act, waitFor } from "@testing-library/react";
import { userScopedKey, type OfflineDb } from "../../../lib/offline/db.js";
import { L1, PROFILE, RDL, history, targets } from "./fixtures.js";
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

const BENCH = "bench-press";
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
  await seedCache(db, {
    history: history(RDL, "2026-09-20T18:00:00+02:00", 4),
    library: L1,
    targets: targets(),
    profile: PROFILE,
  });
});

afterEach(() => {
  signOut();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const excludeIdsOfCalls = (): unknown[] => suggestSpy.mock.calls.map((c) => c[4].excludeIds);
const setList = async (ids: string[]): Promise<void> => {
  await db.excludedCache.clear();
  for (const exerciseId of ids) {
    await db.excludedCache.put({
      key: userScopedKey(TEST_USER, exerciseId),
      userId: TEST_USER,
      exerciseId,
      createdAt: "2026-09-25T10:00:00Z",
    });
  }
};
const lastItemIds = (): string[] =>
  (suggestSpy.mock.results.at(-1)?.value as Workout).plan.items.map((i) => i.exerciseId);

describe("T-0542 AC1 stored list reaches suggest", () => {
  it("empty list: excludeIds [] on the card", async () => {
    renderToday();
    await waitFor(() => expect(suggestSpy).toHaveBeenCalled());
    expect(excludeIdsOfCalls()).toEqual([[]]);
  });

  it("card: [BENCH] is passed and BENCH is absent from the output", async () => {
    await setList([BENCH]);
    renderToday();
    await waitFor(() => expect(suggestSpy).toHaveBeenCalled());
    await macrotask();
    expect(excludeIdsOfCalls().every((e) => JSON.stringify(e) === JSON.stringify([BENCH]))).toBe(
      true,
    );
    expect(lastItemIds()).not.toContain(BENCH);
  });

  it("preview: [BENCH] is passed and nothing is computed before the list is read", async () => {
    await setList([BENCH]);
    renderSwitch({ initialEntries: ["/?view=preview"] });
    await waitFor(() => expect(suggestSpy).toHaveBeenCalled());
    await macrotask();
    expect(excludeIdsOfCalls().every((e) => JSON.stringify(e) === JSON.stringify([BENCH]))).toBe(
      true,
    );
    expect(lastItemIds()).not.toContain(BENCH);
  });
});

describe("T-0542 AC2 offline", () => {
  it("uses the cached list and requests nothing", async () => {
    online = false;
    await setList([BENCH]);
    renderToday();
    await waitFor(() => expect(suggestSpy).toHaveBeenCalled());
    await macrotask();
    expect(excludeIdsOfCalls().every((e) => JSON.stringify(e) === JSON.stringify([BENCH]))).toBe(
      true,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("T-0542 AC3 live update", () => {
  it("recomputes with [] when the cache changes to []", async () => {
    online = false;
    await setList([BENCH]);
    renderToday();
    await waitFor(() => expect(suggestSpy).toHaveBeenCalled());
    await macrotask();
    suggestSpy.mockClear();
    await act(async () => {
      await setList([]);
    });
    await waitFor(() => expect(excludeIdsOfCalls()).toContainEqual([]));
    expect(lastItemIds()).toContain(BENCH);
  });
});
