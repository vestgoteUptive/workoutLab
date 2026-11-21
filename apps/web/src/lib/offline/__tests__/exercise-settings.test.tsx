// T-0954 (D-0251, D-0259 §13, UF-04.2, UF-09.4): the weight-step device store, its write queue,
// the effective library. AC1, AC4, AC5, AC6, AC7 (AC2, AC9, AC11, AC12 are
// effective-library-engine.test.ts, AC3 is UF-09's confirm-set test, AC8 is
// upgrade-v4-to-v5.test.ts, AC10 is packages/shared).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { LibraryExercise } from "@workoutlab/shared";
import { fakeSupabase, newServer, type FakeServer } from "./exercise-settings-fake.js";

const h = vi.hoisted(() => ({ server: null as unknown as FakeServer }));
vi.mock("../../auth/client.js", async () => ({
  supabase: new Proxy(
    {},
    { get: (_t, prop) => (fakeSupabase(h.server) as Record<string, unknown>)[prop as string] },
  ),
}));

const es = await import("../exercise-settings.js");
const { useExerciseSteps, useExerciseSettingErrors } =
  await import("../exercise-settings-hooks.js");
const { loadLibrary, loadBaseLibrary } = await import("../history.js");
const { effectiveLibrary } = await import("../effective-library.js");
const { flush } = await import("../flush.js");
const { offlineDb, userScopedKey } = await import("../db.js");
const { freshOfflineDb, signIn, signOut } = await import("./test-helpers.js");

const A = "11111111-1111-4111-8111-111111111111";
const lib = (id: string, over: Partial<LibraryExercise> = {}): LibraryExercise => ({
  id,
  name: id,
  kind: "exercise",
  type: "isolation",
  level: "beginner",
  equipment: ["dumbbell"],
  areas: { arms: 1 },
  timed: false,
  defaultDurationS: null,
  incrementKg: 2.5,
  externalLoad: true,
  ...over,
});

function setOnline(online: boolean) {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(online);
}

async function seedLibrary(rows: LibraryExercise[]) {
  await offlineDb().libraryCache.bulkPut(
    rows.map((exercise) => ({ key: userScopedKey(A, exercise.id), userId: A, exercise })),
  );
}
const deviceStep = async (id: string) =>
  (await offlineDb().exerciseSettings.get(userScopedKey(A, id)))?.incrementKg;
const queue = () => offlineDb().exerciseSettingsQueue.toArray();

beforeEach(() => {
  h.server = newServer();
  freshOfflineDb();
  signIn(A);
  setOnline(true);
});
afterEach(() => {
  cleanup();
  signOut();
  vi.restoreAllMocks();
});

describe("T-0954 AC1 effective library", () => {
  it("db-curl keeps the library step 2.5 with no override and takes 1.25 with one", async () => {
    await seedLibrary([lib("db-curl")]);
    expect((await loadLibrary()).find((e) => e.id === "db-curl")?.incrementKg).toBe(2.5);
    setOnline(false);
    await es.setExerciseStep("db-curl", 1.25);
    expect((await loadLibrary()).find((e) => e.id === "db-curl")?.incrementKg).toBe(1.25);
    // The base library (UF-04.2's "Use default") never changes.
    expect((await loadBaseLibrary()).find((e) => e.id === "db-curl")?.incrementKg).toBe(2.5);
  });

  it("an override on one exercise leaves every other exercise at its own library step in the same call", () => {
    const rows = [
      lib("bench-press", { incrementKg: 2.5 }),
      lib("db-curl", { incrementKg: 2 }),
      lib("leg-curl", { incrementKg: 5 }),
    ];
    const eff = effectiveLibrary(rows, new Map([["bench-press", 1.25]]));
    expect(eff.map((e) => [e.id, e.incrementKg])).toEqual([
      ["bench-press", 1.25],
      ["db-curl", 2],
      ["leg-curl", 5],
    ]);
    const two = effectiveLibrary(
      rows,
      new Map([
        ["leg-curl", 0.5],
        ["bench-press", 1.25],
      ]),
    );
    expect(two.map((e) => e.incrementKg)).toEqual([1.25, 2, 0.5]);
  });

  it("ignores an override for a timed or bodyweight exercise (same predicate as the UI)", () => {
    const rows = [
      lib("plank", { timed: true, incrementKg: null as unknown as number }),
      lib("push-up", { externalLoad: false, incrementKg: null as unknown as number }),
    ];
    const eff = effectiveLibrary(
      rows,
      new Map([
        ["plank", 1.25],
        ["push-up", 1.25],
      ]),
    );
    expect(eff).toEqual(rows);
  });
});

describe("T-0954 AC4 offline set, queued, sent on reconnect; online sent at once", () => {
  it("offline: applies at once, queues the upsert, then a flush sends it and empties the queue", async () => {
    setOnline(false);
    await es.setExerciseStep("db-curl", 1.25);
    expect(await deviceStep("db-curl")).toBe(1.25);
    expect(h.server.log).toEqual([]);
    expect(await queue()).toMatchObject([
      { exerciseId: "db-curl", op: "upsert", incrementKg: 1.25 },
    ]);

    setOnline(true);
    expect(await flush(A)).toBe("flushed");
    expect(h.server.log).toEqual([{ op: "upsert", exerciseId: "db-curl", incrementKg: 1.25 }]);
    expect(await queue()).toEqual([]);
    expect(await deviceStep("db-curl")).toBe(1.25);
  });

  it("online: the upsert is sent immediately and the queue is empty", async () => {
    await es.setExerciseStep("db-curl", 1.25);
    expect(h.server.log).toEqual([{ op: "upsert", exerciseId: "db-curl", incrementKg: 1.25 }]);
    expect(await queue()).toEqual([]);
  });

  it("replays several writes in the order they were made", async () => {
    setOnline(false);
    await es.setExerciseStep("a-lift", 5);
    await es.setExerciseStep("b-lift", 1.25);
    await es.setExerciseStep("a-lift", 2.5);
    setOnline(true);
    await flush(A);
    expect(h.server.log.map((l) => [l.exerciseId, l.incrementKg])).toEqual([
      ["b-lift", 1.25],
      ["a-lift", 2.5],
    ]);
  });

  it("a dropped connection keeps the entry queued", async () => {
    h.server.offline = true;
    await es.setExerciseStep("db-curl", 1.25);
    expect(await queue()).toHaveLength(1);
    h.server.offline = false;
    await flush(A);
    expect(await queue()).toEqual([]);
  });

  it("rejects a step the table would refuse before queueing it", async () => {
    await expect(es.setExerciseStep("db-curl", 1.3)).rejects.toMatchObject({ reason: "invalid" });
    await expect(es.setExerciseStep("db-curl", 11)).rejects.toMatchObject({ reason: "invalid" });
    expect(await queue()).toEqual([]);
  });
});

describe("T-0954 AC5 reset", () => {
  it("offline: the device row goes at once, a delete is queued, the library step applies", async () => {
    await seedLibrary([lib("db-curl")]);
    await es.setExerciseStep("db-curl", 1.25);
    setOnline(false);
    await es.resetExerciseStep("db-curl");
    expect(await deviceStep("db-curl")).toBeUndefined();
    expect(await queue()).toMatchObject([{ op: "delete", exerciseId: "db-curl" }]);
    expect((await loadLibrary())[0]?.incrementKg).toBe(2.5);
    setOnline(true);
    await flush(A);
    expect(h.server.rows.has("db-curl")).toBe(false);
    expect(await queue()).toEqual([]);
  });

  it("online: the delete is sent", async () => {
    await es.setExerciseStep("db-curl", 1.25);
    await es.resetExerciseStep("db-curl");
    expect(h.server.log.at(-1)).toEqual({ op: "delete", exerciseId: "db-curl" });
    expect(await deviceStep("db-curl")).toBeUndefined();
  });
});

describe("T-0954 AC6 last write wins by updated_at", () => {
  it("device A's earlier 1.25 loses to device B's later 5, and A converges", async () => {
    setOnline(false);
    await es.setExerciseStep("db-curl", 1.25); // device A, queued at t1
    // Device B writes 5 later; the server stamps updated_at after A's queuedAt.
    h.server.rows.set("db-curl", {
      exercise_id: "db-curl",
      increment_kg: 5,
      updated_at: new Date(Date.now() + 60_000).toISOString(),
    });
    setOnline(true);
    await flush(A);
    expect(h.server.log).toEqual([]); // A's stale write was never sent
    expect(h.server.rows.get("db-curl")?.increment_kg).toBe(5);
    expect(await deviceStep("db-curl")).toBe(5);
    expect(await queue()).toEqual([]);
  });

  it("the later write on this device wins over an older server row", async () => {
    h.server.rows.set("db-curl", {
      exercise_id: "db-curl",
      increment_kg: 5,
      updated_at: new Date(Date.now() - 60_000).toISOString(),
    });
    setOnline(false);
    await es.setExerciseStep("db-curl", 1.25);
    setOnline(true);
    await flush(A);
    expect(h.server.rows.get("db-curl")?.increment_kg).toBe(1.25);
    expect(await deviceStep("db-curl")).toBe(1.25);
  });

  it("a stale queued reset is dropped the same way", async () => {
    setOnline(false);
    await es.resetExerciseStep("db-curl");
    h.server.rows.set("db-curl", {
      exercise_id: "db-curl",
      increment_kg: 5,
      updated_at: new Date(Date.now() + 60_000).toISOString(),
    });
    setOnline(true);
    await flush(A);
    expect(await deviceStep("db-curl")).toBe(5);
    expect(h.server.log).toEqual([]);
  });

  it("a server clock ahead of the device does not make this device's own earlier write look newer", async () => {
    h.server.clock = () => new Date(Date.now() + 3_600_000).toISOString();
    await es.setExerciseStep("db-curl", 1.25); // the server stamps one hour ahead
    setOnline(false);
    await es.setExerciseStep("db-curl", 5);
    setOnline(true);
    await flush(A);
    expect(h.server.rows.get("db-curl")?.increment_kg).toBe(5);
    expect(await deviceStep("db-curl")).toBe(5);
  });

  it("a refresh keeps a value that is still queued and takes the server's for the rest", async () => {
    h.server.rows.set("other", {
      exercise_id: "other",
      increment_kg: 5,
      updated_at: "2030-01-01T00:00:00.000Z",
    });
    setOnline(false);
    await es.setExerciseStep("db-curl", 1.25);
    setOnline(true);
    await es.refreshExerciseSettings();
    expect(await deviceStep("db-curl")).toBe(1.25);
    expect(await deviceStep("other")).toBe(5);
  });
});

describe("T-0954 AC7 a rejected write", () => {
  it("reverts the device value on load and surfaces the rejection to the hook", async () => {
    // The server already had 2.5; the user sets 1.25 and the server refuses it.
    h.server.rows.set("db-curl", {
      exercise_id: "db-curl",
      increment_kg: 2.5,
      updated_at: "2030-01-01T00:00:00.000Z",
    });
    await es.refreshExerciseSettings();
    h.server.failWith = { code: "23514", message: "check violation" };
    await es.setExerciseStep("db-curl", 1.25);
    const [entry] = await queue();
    expect(entry).toMatchObject({ status: "rejected", base: 2.5 });
    // Simulate "the device value still shows the rejected write" (e.g. a crash before the revert).
    await offlineDb().exerciseSettings.put({
      key: userScopedKey(A, "db-curl"),
      userId: A,
      exerciseId: "db-curl",
      incrementKg: 1.25,
      updatedAt: "2030-01-02T00:00:00.000Z",
    });

    // The live read already shows the reverted value (it never writes).
    const steps = renderHook(() => useExerciseSteps(A));
    await waitFor(() => expect(steps.result.current.steps.get("db-curl")).toBe(2.5));
    expect(await deviceStep("db-curl")).toBe(1.25);
    // Loading the store persists the revert.
    expect((await es.loadExerciseSteps(A)).get("db-curl")).toBe(2.5);
    expect(await deviceStep("db-curl")).toBe(2.5);

    const errors = renderHook(() => useExerciseSettingErrors(A));
    await waitFor(() => expect(errors.result.current.errors).toHaveLength(1));
    expect(errors.result.current.errors[0]).toEqual({
      exerciseId: "db-curl",
      attemptedKg: 1.25,
      revertedKg: 2.5,
    });
    await waitFor(() => expect(steps.result.current.steps.get("db-curl")).toBe(2.5));
    // A rejected entry is never retried.
    await flush(A);
    expect(h.server.log).toEqual([]);

    await errors.result.current.dismiss("db-curl");
    await waitFor(() => expect(errors.result.current.errors).toEqual([]));
  });

  it("a rejected first write with no override before it reverts to the library default", async () => {
    setOnline(false);
    await es.setExerciseStep("db-curl", 1.25);
    h.server.failWith = { code: "23503", message: "fk" };
    setOnline(true);
    await flush(A);
    expect(await deviceStep("db-curl")).toBeUndefined();
    expect(await es.loadExerciseSettingErrors(A)).toMatchObject([
      { exerciseId: "db-curl", attemptedKg: 1.25, revertedKg: null },
    ]);
  });
});
