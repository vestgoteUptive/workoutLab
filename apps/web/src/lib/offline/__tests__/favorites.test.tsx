// T-0567 (D-0202 §6): the favorites cache on the shared list helper. AC2-AC9.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";

type Result = { data: unknown; error: unknown };
const h = vi.hoisted(() => ({
  readGate: Promise.resolve() as Promise<void>,
  upsertGate: Promise.resolve() as Promise<void>,
  reads: [] as string[],
  readResult: { data: [], error: null } as Result | "throw",
  upsertCalls: [] as Array<{ table: string; rows: unknown; options: unknown }>,
  upsertResult: { data: [], error: null } as Result,
  deleteCalls: [] as Array<{ table: string; col: string; val: string }>,
  deleteResult: { error: null } as { error: unknown },
}));

vi.mock("../../auth/client.js", () => ({
  supabase: {
    from: (table: string) => ({
      select: () => {
        h.reads.push(table);
        const res = async () => {
          if (table !== "favorite_exercises") return { data: [], error: null };
          const snapshot = h.readResult;
          await h.readGate;
          if (snapshot === "throw") throw new TypeError("Failed to fetch");
          return snapshot;
        };
        return {
          gte: () => res(),
          maybeSingle: async () => ({ data: null, error: null }),
          then: (a: (v: unknown) => unknown, b?: (e: unknown) => unknown) => res().then(a, b),
        };
      },
      upsert: (rows: unknown, options: unknown) => {
        h.upsertCalls.push({ table, rows, options });
        return {
          select: async () => {
            await h.upsertGate;
            return h.upsertResult;
          },
        };
      },
      delete: () => ({
        eq: async (col: string, val: string) => {
          h.deleteCalls.push({ table, col, val });
          return h.deleteResult;
        },
      }),
    }),
  },
}));

const f = await import("../favorites.js");
const x = await import("../excluded.js");
const { useFavoriteIds, useFavoriteRows } = await import("../favorites-hooks.js");
const { invalidateCacheWrites } = await import("../cache-generation.js");
const { refreshAll } = await import("../history.js");
const { offlineDb, userScopedKey } = await import("../db.js");
const { freshOfflineDb, signIn, signOut } = await import("./test-helpers.js");
const { signOutAndClearDevice, wipeLocalUserData } = await import("../../account/index.js");

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const row = (userId: string, exerciseId: string, createdAt = "2026-10-01T10:00:00.000Z") => ({
  key: userScopedKey(userId, exerciseId),
  userId,
  exerciseId,
  createdAt,
});
const server = (...ids: string[]) => ({
  data: ids.map((exercise_id) => ({ exercise_id, created_at: "2026-10-02T10:00:00.000Z" })),
  error: null,
});
const ids = (u = A) => f.loadFavoriteIds(u);
const exIds = (u = A) => x.loadExcludedIds(u);
const setOnline = (value: boolean) => vi.spyOn(navigator, "onLine", "get").mockReturnValue(value);
function gate() {
  let open!: () => void;
  const promise = new Promise<void>((r) => (open = r));
  return { promise, open };
}

beforeEach(() => {
  freshOfflineDb();
  signIn(A);
  h.reads.length = 0;
  h.upsertCalls.length = 0;
  h.deleteCalls.length = 0;
  h.readGate = h.upsertGate = Promise.resolve();
  h.readResult = { data: [], error: null };
  h.upsertResult = { data: [], error: null };
  h.deleteResult = { error: null };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  signOut();
});

describe("T-0567 AC2 offline read", () => {
  it("offline: useFavoriteIds returns the cache and no request is made", async () => {
    await offlineDb().favoriteCache.put(row(A, "back-squat"));
    setOnline(false);
    const { result } = renderHook(() => useFavoriteIds(A));
    await waitFor(() => expect(result.current).toEqual(["back-squat"]));
    await f.refreshFavorites();
    expect(h.reads).toEqual([]);
  });
  it("online: the cache is returned before any refresh resolves", async () => {
    await offlineDb().favoriteCache.put(row(A, "back-squat"));
    const g = gate();
    h.readGate = g.promise;
    const { result } = renderHook(() => useFavoriteIds(A));
    await waitFor(() => expect(result.current).toEqual(["back-squat"]));
    g.open();
  });
  it("useFavoriteRows returns rows with createdAt", async () => {
    await offlineDb().favoriteCache.bulkPut([row(A, "z-ex"), row(A, "a-ex"), row(B, "b-ex")]);
    const { result } = renderHook(() => useFavoriteRows(A));
    await waitFor(() => expect(result.current).toHaveLength(2));
    expect(result.current[0]).toHaveProperty("createdAt");
  });
});

describe("T-0567 AC3 refresh on start", () => {
  it("refreshAll online fills an empty cache before it resolves", async () => {
    h.readResult = server("back-squat");
    await refreshAll(new Date("2026-10-26T08:00:00Z"), "Europe/Stockholm");
    expect(await ids()).toEqual(["back-squat"]);
  });
});

describe("T-0567 AC4 missing-table tolerance", () => {
  it.each([
    ["PGRST205", { data: null, error: { code: "PGRST205", message: "no table" } }],
    ["HTTP 404", { data: null, error: { code: "", status: 404, message: "Not Found" } }],
    ["network error", "throw" as const],
  ])("%s keeps the cache and does not reject", async (_n, result) => {
    await offlineDb().favoriteCache.put(row(A, "back-squat"));
    h.readResult = result;
    await expect(f.refreshFavorites()).resolves.toBeUndefined();
    expect(await ids()).toEqual(["back-squat"]);
  });
});

describe("T-0567 AC5 empty read replaces", () => {
  it("an authenticated empty read empties the cache; B's rows stay", async () => {
    await offlineDb().favoriteCache.bulkPut([row(A, "back-squat"), row(B, "squat")]);
    h.readResult = server();
    await f.refreshFavorites();
    expect(await ids()).toEqual([]);
    expect(await ids(B)).toEqual(["squat"]);
  });
  it("signed out: no read, cache unchanged", async () => {
    await offlineDb().favoriteCache.put(row(A, "back-squat"));
    signOut();
    await f.refreshFavorites();
    expect(h.reads).toEqual([]);
    expect(await ids()).toEqual(["back-squat"]);
  });
});

describe("T-0567 AC6 writes", () => {
  it("favorite with zero rows back succeeds; cache holds it once; right table and options", async () => {
    await f.favoriteExercise(A, "back-squat");
    await f.favoriteExercise(A, "back-squat");
    expect(h.upsertCalls[0]).toEqual({
      table: "favorite_exercises",
      rows: { exercise_id: "back-squat" },
      options: { onConflict: "user_id,exercise_id", ignoreDuplicates: true },
    });
    expect(await ids()).toEqual(["back-squat"]);
    expect(await offlineDb().favoriteCache.count()).toBe(1);
  });
  it("a rejected upsert rejects with FavoriteWriteError and leaves the cache", async () => {
    h.upsertResult = { data: null, error: { code: "42501", message: "rls" } };
    await expect(f.favoriteExercise(A, "back-squat")).rejects.toBeInstanceOf(f.FavoriteWriteError);
    expect(await ids()).toEqual([]);
  });
  it("unfavorite deletes the row; a rejected delete keeps it", async () => {
    await offlineDb().favoriteCache.put(row(A, "back-squat"));
    h.deleteResult = { error: { code: "PGRST205", message: "x" } };
    await expect(f.unfavoriteExercise(A, "back-squat")).rejects.toMatchObject({
      reason: "server",
    });
    expect(await ids()).toEqual(["back-squat"]);
    h.deleteResult = { error: null };
    await f.unfavoriteExercise(A, "back-squat");
    expect(h.deleteCalls.at(-1)).toEqual({
      table: "favorite_exercises",
      col: "exercise_id",
      val: "back-squat",
    });
    expect(await ids()).toEqual([]);
  });
  it("a warm-up is refused before any request", async () => {
    await offlineDb().libraryCache.put({
      key: userScopedKey(A, "wu-cat-cow"),
      userId: A,
      exercise: { id: "wu-cat-cow", kind: "warmup" } as never,
    });
    await expect(f.favoriteExercise(A, "wu-cat-cow")).rejects.toMatchObject({ reason: "warmup" });
    expect(h.upsertCalls).toEqual([]);
  });
  it("offline writes reject without a request", async () => {
    setOnline(false);
    await expect(f.favoriteExercise(A, "back-squat")).rejects.toMatchObject({ reason: "offline" });
    await expect(f.unfavoriteExercise(A, "back-squat")).rejects.toMatchObject({
      reason: "offline",
    });
    expect(h.upsertCalls).toEqual([]);
    expect(h.deleteCalls).toEqual([]);
  });
  it("a stale refresh does not overwrite a newer confirmed write (write counter)", async () => {
    const g = gate();
    h.readGate = g.promise;
    h.readResult = server();
    const refresh = f.refreshFavorites();
    await vi.waitFor(() => expect(h.reads).toContain("favorite_exercises"));
    await f.favoriteExercise(A, "back-squat");
    g.open();
    await refresh;
    expect(await ids()).toEqual(["back-squat"]);
  });
  it("sign-out between the server reply and the cache write: nothing is written", async () => {
    const g = gate();
    h.upsertGate = g.promise;
    const write = f.favoriteExercise(A, "back-squat");
    await vi.waitFor(() => expect(h.upsertCalls).toHaveLength(1));
    invalidateCacheWrites();
    g.open();
    await write;
    expect(await ids()).toEqual([]);
  });
});

describe("T-0567 AC7 cross-list drop", () => {
  it("a confirmed favorite drops the id from the excluded cache", async () => {
    await offlineDb().excludedCache.bulkPut([row(A, "back-squat"), row(B, "back-squat")]);
    await f.favoriteExercise(A, "back-squat");
    expect(await ids()).toEqual(["back-squat"]);
    expect(await exIds()).toEqual([]);
    expect(await exIds(B)).toEqual(["back-squat"]);
  });
  it("a failed favorite keeps the excluded row", async () => {
    await offlineDb().excludedCache.put(row(A, "back-squat"));
    h.upsertResult = { data: null, error: { code: "42501", message: "rls" } };
    await expect(f.favoriteExercise(A, "back-squat")).rejects.toThrow();
    expect(await exIds()).toEqual(["back-squat"]);
  });
  it("a confirmed exclude drops the id from the favorites cache", async () => {
    await offlineDb().favoriteCache.bulkPut([row(A, "bench-press"), row(A, "squat")]);
    await x.excludeExercise(A, "bench-press");
    expect(await exIds()).toEqual(["bench-press"]);
    expect(await ids()).toEqual(["squat"]);
  });
  it("a failed exclude keeps the favorite", async () => {
    await offlineDb().favoriteCache.put(row(A, "bench-press"));
    h.upsertResult = { data: null, error: { code: "42501", message: "rls" } };
    await expect(x.excludeExercise(A, "bench-press")).rejects.toThrow();
    expect(await ids()).toEqual(["bench-press"]);
  });
});

describe("T-0567 AC8 sign-out and wipe", () => {
  const seed = async () =>
    offlineDb().favoriteCache.bulkPut([row(A, "back-squat"), row(B, "lateral-raise")]);
  it("sign-out clears A's favorites; B's stay", async () => {
    await seed();
    await signOutAndClearDevice({ userId: A }, { db: offlineDb() });
    expect(await ids()).toEqual([]);
    expect(await ids(B)).toEqual(["lateral-raise"]);
  });
  it("the account wipe clears A's favorites; B's stay", async () => {
    await seed();
    await wipeLocalUserData(A, { db: offlineDb() });
    expect(await ids()).toEqual([]);
    expect(await ids(B)).toEqual(["lateral-raise"]);
  });
  it("a refresh in flight when sign-out bumps the generation writes nothing", async () => {
    const g = gate();
    h.readGate = g.promise;
    h.readResult = server("back-squat");
    const refresh = f.refreshFavorites();
    await vi.waitFor(() => expect(h.reads).toContain("favorite_exercises"));
    invalidateCacheWrites();
    g.open();
    await refresh;
    expect(await ids()).toEqual([]);
  });
});

describe("T-0567 AC9 sorted ids", () => {
  it("sorts and dedupes", () => {
    expect(f.favoriteIdsFor(["db-bench-press", "back-squat", "db-bench-press"])).toEqual([
      "back-squat",
      "db-bench-press",
    ]);
    expect(f.favoriteIdsFor([])).toEqual([]);
  });
});
