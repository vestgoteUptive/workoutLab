// T-0233 (UF-09.3, UF-09.4, D-0129): `lib/offline` stores every set weight rounded to 2 decimals,
// half away from zero, at the one place queue entries are built (`toQueuedSet`). Explicit `now`
// instead of fake timers, as in queue.edit-delete.test.ts (Dexie needs the real clock).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseSpy } from "./supabase-spy.js";

const spy = createSupabaseSpy();
vi.mock("../../auth/client.js", () => ({ supabase: { from: spy.from } }));

const { recordSet, editSet, deleteSet } = await import("../queue.js");
const { flush, clearAuthBlocked } = await import("../flush.js");
const { offlineDb, setKey } = await import("../db.js");
const { freshOfflineDb, signIn, signOut } = await import("./test-helpers.js");

const USER = "11111111-1111-4111-8111-111111111111";
const T0 = new Date("2026-10-02T10:00:00.000Z");
const T1 = new Date("2026-10-02T10:03:00.000Z");

type RecordInput = Parameters<typeof recordSet>[0];

function input(overrides: Partial<RecordInput> = {}): RecordInput {
  return {
    sessionId: "S1",
    exerciseId: "bench-press",
    setIndex: 0,
    kind: "reps",
    reps: 6,
    weightKg: 80,
    isWarmup: false,
    backoff: false,
    ...overrides,
  };
}

/** A queued entry written straight to IndexedDB, the way a pre-T-0233 build stored it. */
async function putLegacy(clientId: string, weightKg: number) {
  await offlineDb().sets.put({
    key: setKey(USER, clientId),
    status: "queued",
    userId: USER,
    clientId,
    sessionId: "S1",
    exerciseId: "bench-press",
    setIndex: 0,
    kind: "reps",
    reps: 6,
    weightKg,
    durationS: null,
    rir: null,
    isWarmup: false,
    backoff: false,
    completedAt: T0.toISOString(),
    editedAt: T0.toISOString(),
    deletedAt: null,
  });
}

beforeEach(() => {
  freshOfflineDb();
  signIn(USER);
  spy.calls.length = 0;
  spy.from.mockClear();
  clearAuthBlocked(USER);
  spy.setHandler("sessions", () => ({ error: null }));
  spy.setHandler("session_sets", () => ({ error: null }));
});

afterEach(() => signOut());

describe("T-0233 AC1 recordSet stores and returns the weight at 2 decimals", () => {
  // Rows 1–6 are red on main (it keeps the input value).
  it.each([
    [82.125, 82.13],
    [82.124, 82.12],
    [1.005, 1.01],
    [2.675, 2.68],
    [0.005, 0.01],
    [82.1251, 82.13],
  ])("T-0233 AC1 %d → %d", async (given, expected) => {
    const entry = await recordSet(input({ weightKg: given }), { now: T0 });
    expect(entry.weightKg).toBe(expected);
    expect((await offlineDb().sets.get(entry.key))?.weightKg).toBe(expected);
  });

  // Rows 7–8: already on the 0.01 grid, or null. Green on main, and must stay green.
  it.each([
    [100, 100],
    [77.5, 77.5],
    [82.25, 82.25],
    [0, 0],
    [null, null],
  ])("T-0233 AC1 %s is stored as it is", async (given, expected) => {
    const entry = await recordSet(input({ weightKg: given }), { now: T0 });
    expect(entry.weightKg).toBe(expected);
    expect((await offlineDb().sets.get(entry.key))?.weightKg).toBe(expected);
  });

  it("T-0233 AC1 an omitted weightKg is stored as null", async () => {
    const { weightKg: _omitted, ...rest } = input();
    const entry = await recordSet(rest, { now: T0 });
    expect(entry.weightKg).toBeNull();
    expect((await offlineDb().sets.get(entry.key))?.weightKg).toBeNull();
  });

  // Out of contract (no weight is negative), but the rounding must still be half away from zero
  // and never produce -0.
  it.each([
    [-1.005, -1.01],
    [-82.125, -82.13],
    [-82.124, -82.12],
    [-0.001, 0],
  ])(
    "T-0233 AC1 a negative or zero %d → %d (half away from zero, never -0)",
    async (given, expected) => {
      const entry = await recordSet(input({ weightKg: given }), { now: T0 });
      expect(Object.is(entry.weightKg, expected)).toBe(true);
      expect(Object.is((await offlineDb().sets.get(entry.key))?.weightKg, expected)).toBe(true);
    },
  );
});

it("T-0233 AC1 a negative zero (-0) is stored as 0", async () => {
  const entry = await recordSet(input({ weightKg: -0 }), { now: T0 });
  expect(Object.is(entry.weightKg, 0)).toBe(true);
  expect(Object.is((await offlineDb().sets.get(entry.key))?.weightKg, 0)).toBe(true);
});

describe("T-0233 AC2 editSet and deleteSet round", () => {
  it("T-0233 AC2 editSet(id, { weightKg: 82.125 }) on a set recorded at 80 stores 82.13", async () => {
    const recorded = await recordSet(input({ weightKg: 80 }), { now: T0 });
    const edited = await editSet(recorded.clientId, { weightKg: 82.125 }, { now: T1 });
    expect(edited.weightKg).toBe(82.13);
    expect((await offlineDb().sets.get(recorded.key))?.weightKg).toBe(82.13);
  });

  it("T-0233 AC2 a legacy 82.125 entry: editSet(id, { reps: 7 }) stores 82.13 and reps 7", async () => {
    const clientId = "33333333-3333-4333-8333-333333333333";
    await putLegacy(clientId, 82.125);
    const edited = await editSet(clientId, { reps: 7 }, { now: T1 });
    expect(edited.weightKg).toBe(82.13);
    const stored = await offlineDb().sets.get(setKey(USER, clientId));
    expect(stored?.weightKg).toBe(82.13);
    expect(stored?.reps).toBe(7);
  });

  it("T-0233 AC2 a legacy 82.125 entry: deleteSet(id) writes a tombstone at 82.13", async () => {
    const clientId = "44444444-4444-4444-8444-444444444444";
    await putLegacy(clientId, 82.125);
    const tombstone = await deleteSet(clientId, { now: T1 });
    expect(tombstone.weightKg).toBe(82.13);
    const stored = await offlineDb().sets.get(setKey(USER, clientId));
    expect(stored?.deletedAt).toBe(T1.toISOString());
    expect(stored?.weightKg).toBe(82.13);
  });

  it("T-0233 AC2 the pair: editSet(id, { reps: 7 }) on a set recorded at 60.5 keeps 60.5", async () => {
    const recorded = await recordSet(input({ weightKg: 60.5 }), { now: T0 });
    const edited = await editSet(recorded.clientId, { reps: 7 }, { now: T1 });
    expect(edited.weightKg).toBe(60.5);
    expect((await offlineDb().sets.get(recorded.key))?.weightKg).toBe(60.5);
  });

  it("T-0233 AC2 the pair: a history-cache-only set at 60.5 keeps 60.5 on editSet", async () => {
    const clientId = "55555555-5555-4555-8555-555555555555";
    await offlineDb().historyCache.put({
      key: setKey(USER, clientId),
      userId: USER,
      clientId,
      sessionId: "S1",
      exerciseId: "bench-press",
      isWarmup: false,
      completedAt: T0.toISOString(),
      editedAt: T0.toISOString(),
      deletedAt: null,
      reps: 8,
      weightKg: 60.5,
      durationS: null,
    });
    const edited = await editSet(clientId, { reps: 7 }, { now: T1 });
    expect(edited.weightKg).toBe(60.5);
    expect((await offlineDb().sets.get(setKey(USER, clientId)))?.weightKg).toBe(60.5);
  });
});

describe("T-0233 AC3 what is sent equals what is stored", () => {
  it("T-0233 AC3 recordSet 82.125 then flush: the session_sets upsert has weight_kg 82.13", async () => {
    await recordSet(input({ weightKg: 82.125 }), { now: T0 });
    await flush(USER);
    const setCalls = spy.calls.filter((c) => c.table === "session_sets");
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0]!.rows).toHaveLength(1);
    expect(setCalls[0]!.rows[0]).toMatchObject({ weight_kg: 82.13 });
  });
});

describe("T-0233 AC4 other fields are untouched", () => {
  it("T-0233 AC4 a reps set keeps reps 8 and rir 2 while the weight rounds", async () => {
    const entry = await recordSet(input({ reps: 8, rir: 2, weightKg: 82.125 }), { now: T0 });
    const stored = await offlineDb().sets.get(entry.key);
    expect(stored).toMatchObject({ reps: 8, rir: 2, weightKg: 82.13 });
    expect(entry).toMatchObject({ reps: 8, rir: 2, weightKg: 82.13 });
  });

  it("T-0233 AC4 a timed set keeps durationS 45 and weightKg null", async () => {
    const entry = await recordSet(
      input({ kind: "timed", reps: null, durationS: 45, weightKg: null }),
      { now: T0 },
    );
    const stored = await offlineDb().sets.get(entry.key);
    expect(stored).toMatchObject({ durationS: 45, weightKg: null, reps: null });
  });
});
