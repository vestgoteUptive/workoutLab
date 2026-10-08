// T-0536 (D-0199 §5-§6, D-0200): the excluded-exercises cache, refresh, writes, union, online hook.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

type Result = { data: unknown; error: unknown };
const h = vi.hoisted(() => ({
  readGate: Promise.resolve() as Promise<void>,
  upsertGate: Promise.resolve() as Promise<void>,
  deleteGate: Promise.resolve() as Promise<void>,
  reads: [] as string[],
  readResult: { data: [], error: null } as { data: unknown; error: unknown } | "throw",
  upsertCalls: [] as Array<{ rows: unknown; options: unknown }>,
  upsertResult: { data: [], error: null } as Result,
  deleteCalls: [] as Array<{ col: string; val: string }>,
  deleteResult: { error: null } as { error: unknown },
}));

vi.mock("../../auth/client.js", () => ({
  supabase: {
    from: (table: string) => ({
      select: () => {
        h.reads.push(table);
        const res = async () => {
          if (table !== "excluded_exercises") return { data: [], error: null };
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
        h.upsertCalls.push({ rows, options });
        return {
          select: async () => {
            await h.upsertGate;
            return h.upsertResult;
          },
        };
      },
      delete: () => ({
        eq: async (col: string, val: string) => {
          h.deleteCalls.push({ col, val });
          await h.deleteGate;
          return h.deleteResult;
        },
      }),
    }),
  },
}));

const x = await import("../excluded.js");
const { useExcludedIds, useExcludedRows, useOnline } = await import("../excluded-hooks.js");
const { invalidateCacheWrites } = await import("../cache-generation.js");
const { refreshAll } = await import("../history.js");
const { offlineDb, userScopedKey } = await import("../db.js");
const { freshOfflineDb, signIn, signOut } = await import("./test-helpers.js");

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
const ids = async (u = A) => x.loadExcludedIds(u);

function setOnline(value: boolean) {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(value);
}

beforeEach(() => {
  freshOfflineDb();
  signIn(A);
  h.reads.length = 0;
  h.upsertCalls.length = 0;
  h.deleteCalls.length = 0;
  h.readGate = h.upsertGate = h.deleteGate = Promise.resolve();
  h.readResult = { data: [], error: null };
  h.upsertResult = { data: [], error: null };
  h.deleteResult = { error: null };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  signOut();
});

describe("T-0536 AC2 offline read", () => {
  it("useExcludedIds returns the cache offline and makes no request", async () => {
    await offlineDb().excludedCache.put(row(A, "bench-press"));
    setOnline(false);
    const { result } = renderHook(() => useExcludedIds(A));
    await waitFor(() => expect(result.current).toEqual(["bench-press"]));
    await x.refreshExcluded();
    expect(h.reads).toEqual([]);
  });

  it("useExcludedRows returns rows with createdAt; ids are sorted", async () => {
    await offlineDb().excludedCache.bulkPut([row(A, "z-ex"), row(A, "a-ex"), row(B, "b-ex")]);
    const ids$ = renderHook(() => useExcludedIds(A));
    const rows$ = renderHook(() => useExcludedRows(A));
    await waitFor(() => expect(ids$.result.current).toEqual(["a-ex", "z-ex"]));
    await waitFor(() => expect(rows$.result.current).toHaveLength(2));
    expect(rows$.result.current[0]).toHaveProperty("createdAt");
  });
});

describe("T-0536 AC3 refresh on start", () => {
  it("refreshAll online fills an empty cache before it resolves", async () => {
    h.readResult = server("bench-press");
    await refreshAll(new Date("2026-10-26T08:00:00Z"), "Europe/Stockholm");
    expect(await ids()).toEqual(["bench-press"]);
  });
});

describe("T-0536 AC4 missing-table tolerance", () => {
  it.each([
    ["PGRST205", { data: null, error: { code: "PGRST205", message: "no table" } }],
    ["HTTP 404", { data: null, error: { code: "", status: 404, message: "Not Found" } }],
    ["network error", "throw" as const],
  ])("%s keeps the cache and does not reject", async (_n, result) => {
    await offlineDb().excludedCache.put(row(A, "bench-press"));
    h.readResult = result;
    await expect(x.refreshExcluded()).resolves.toBeUndefined();
    expect(await ids()).toEqual(["bench-press"]);
  });
});

describe("T-0536 AC5 empty read replaces", () => {
  it("an authenticated empty read empties the cache; B's rows stay", async () => {
    await offlineDb().excludedCache.bulkPut([row(A, "bench-press"), row(B, "squat")]);
    h.readResult = server();
    await x.refreshExcluded();
    expect(await ids()).toEqual([]);
    expect(await ids(B)).toEqual(["squat"]);
  });
  it("signed out: no read, cache unchanged", async () => {
    await offlineDb().excludedCache.put(row(A, "bench-press"));
    signOut();
    await x.refreshExcluded();
    expect(h.reads).toEqual([]);
    expect(await ids()).toEqual(["bench-press"]);
  });
});

describe("T-0536 AC6 writes", () => {
  it("exclude with zero rows back succeeds; cache holds it once", async () => {
    await x.excludeExercise(A, "bench-press");
    await x.excludeExercise(A, "bench-press");
    expect(h.upsertCalls[0]).toEqual({
      rows: { exercise_id: "bench-press" },
      options: { onConflict: "user_id,exercise_id", ignoreDuplicates: true },
    });
    expect(await ids()).toEqual(["bench-press"]);
    expect(await offlineDb().excludedCache.count()).toBe(1);
  });
  it("a rejected upsert rejects with a typed error and leaves the cache", async () => {
    h.upsertResult = { data: null, error: { code: "42501", message: "rls" } };
    await expect(x.excludeExercise(A, "bench-press")).rejects.toBeInstanceOf(x.ExcludedWriteError);
    expect(await ids()).toEqual([]);
  });
  it("include deletes the row; a rejected delete keeps it", async () => {
    await offlineDb().excludedCache.put(row(A, "bench-press"));
    h.deleteResult = { error: { code: "PGRST205", message: "x" } };
    await expect(x.includeExercise(A, "bench-press")).rejects.toMatchObject({ reason: "server" });
    expect(await ids()).toEqual(["bench-press"]);
    h.deleteResult = { error: null };
    h.deleteCalls.length = 0;
    await x.includeExercise(A, "bench-press");
    expect(h.deleteCalls).toEqual([{ col: "exercise_id", val: "bench-press" }]);
    expect(await ids()).toEqual([]);
  });
  it("a warm-up is refused before any request", async () => {
    await offlineDb().libraryCache.put({
      key: userScopedKey(A, "wu-cat-cow"),
      userId: A,
      exercise: { id: "wu-cat-cow", kind: "warmup" } as never,
    });
    await expect(x.excludeExercise(A, "wu-cat-cow")).rejects.toMatchObject({ reason: "warmup" });
    expect(h.upsertCalls).toEqual([]);
  });
  it("offline writes reject without a request", async () => {
    setOnline(false);
    await expect(x.excludeExercise(A, "bench-press")).rejects.toMatchObject({ reason: "offline" });
    await expect(x.includeExercise(A, "bench-press")).rejects.toMatchObject({ reason: "offline" });
    expect(h.upsertCalls).toEqual([]);
    expect(h.deleteCalls).toEqual([]);
  });
});

function gate(): { promise: Promise<void>; open: () => void } {
  let open!: () => void;
  const promise = new Promise<void>((r) => (open = r));
  return { promise, open };
}

describe("T-0536 review: a stale refresh must not overwrite a newer confirmed write", () => {
  it("stale read (without the exclusion) -> exclude confirms -> read resolves: the cache keeps it", async () => {
    const g = gate();
    h.readGate = g.promise;
    h.readResult = server();
    const refresh = x.refreshExcluded();
    await vi.waitFor(() => expect(h.reads).toContain("excluded_exercises"));
    await x.excludeExercise(A, "bench-press");
    g.open();
    await refresh;
    expect(await ids()).toEqual(["bench-press"]);
  });
  it("stale read (with the exclusion) -> include confirms -> read resolves: it stays included", async () => {
    await offlineDb().excludedCache.put(row(A, "bench-press"));
    const g = gate();
    h.readGate = g.promise;
    h.readResult = server("bench-press");
    const refresh = x.refreshExcluded();
    await vi.waitFor(() => expect(h.reads).toContain("excluded_exercises"));
    await x.includeExercise(A, "bench-press");
    g.open();
    await refresh;
    expect(await ids()).toEqual([]);
  });
  it("a refresh started after the write still replaces the cache", async () => {
    await x.excludeExercise(A, "bench-press");
    h.readResult = server("squat");
    await x.refreshExcluded();
    expect(await ids()).toEqual(["squat"]);
  });
});

describe("T-0536 review: sign-out between the server reply and the cache write", () => {
  it("excludeExercise writes nothing to the cache", async () => {
    const g = gate();
    h.upsertGate = g.promise;
    const write = x.excludeExercise(A, "bench-press");
    await vi.waitFor(() => expect(h.upsertCalls).toHaveLength(1));
    invalidateCacheWrites();
    g.open();
    await write;
    expect(await ids()).toEqual([]);
  });
  it("includeExercise leaves the cache as the clear left it", async () => {
    await offlineDb().excludedCache.put(row(A, "bench-press"));
    const g = gate();
    h.deleteGate = g.promise;
    const write = x.includeExercise(A, "bench-press");
    await vi.waitFor(() => expect(h.deleteCalls).toHaveLength(1));
    invalidateCacheWrites();
    g.open();
    await write;
    expect(await ids()).toEqual(["bench-press"]);
  });
});

describe("T-0536 AC7 union", () => {
  it("sorts and dedupes", () => {
    expect(
      x.excludeIdsFor(["lateral-raise", "bench-press"], ["inverted-row", "bench-press"]),
    ).toEqual(["bench-press", "inverted-row", "lateral-raise"]);
    expect(x.excludeIdsFor([], [])).toEqual([]);
  });
});

describe("T-0536 AC9 useOnline", () => {
  it("follows the online/offline events without a remount, from either start", () => {
    setOnline(false);
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(false);
    act(() => window.dispatchEvent(new Event("online")));
    expect(result.current).toBe(true);
    act(() => window.dispatchEvent(new Event("offline")));
    expect(result.current).toBe(false);
    vi.restoreAllMocks();
    setOnline(true);
    const second = renderHook(() => useOnline());
    expect(second.result.current).toBe(true);
  });
});
