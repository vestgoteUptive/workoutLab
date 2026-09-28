// AC-C2 (edit bumps only edited_at), AC-C3 (delete = tombstone), AC-C4 (monotonic edit clock).
//
// These tests pass an explicit `now` to `recordSet`/`editSet`/`deleteSet` instead of using fake
// timers: Dexie/fake-indexeddb schedule real microtasks and timers internally, so mocking the
// global clock either deadlocks (`vi.useFakeTimers()`) or drifts by the real elapsed ms
// (`shouldAdvanceTime: true`). Passing `now` explicitly is exact and keeps IDB on the real clock.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { recordSet, editSet, deleteSet } from "../queue.js";
import { offlineDb } from "../db.js";
import { freshOfflineDb, signIn, signOut } from "./test-helpers.js";

const USER = "11111111-1111-4111-8111-111111111111";

describe("editSet (AC-C2)", () => {
  beforeEach(() => {
    freshOfflineDb();
    signIn(USER);
  });

  afterEach(() => signOut());

  it("bumps only edited_at, keeping completed_at, and keeps exactly one entry", async () => {
    const c1 = await recordSet(
      {
        sessionId: "S1",
        exerciseId: "back-squat",
        setIndex: 0,
        kind: "reps",
        reps: 8,
        weightKg: 60,
        isWarmup: false,
        backoff: false,
      },
      { now: new Date("2026-09-28T10:00:00.000Z") },
    );

    const edited = await editSet(
      c1.clientId,
      { reps: 7 },
      { now: new Date("2026-09-28T10:03:00.000Z") },
    );

    expect(edited.reps).toBe(7);
    expect(edited.completedAt).toBe("2026-09-28T10:00:00.000Z");
    expect(edited.editedAt).toBe("2026-09-28T10:03:00.000Z");

    const all = await offlineDb().sets.where({ userId: USER }).toArray();
    expect(all).toHaveLength(1);
  });

  it("edits a synced set (only in the history cache) by enqueueing the full row", async () => {
    const db = offlineDb();
    const clientId = "22222222-2222-4222-8222-222222222222";
    await db.historyCache.put({
      key: `${USER}:${clientId}`,
      userId: USER,
      clientId,
      sessionId: "S1",
      exerciseId: "back-squat",
      isWarmup: false,
      completedAt: "2026-09-27T09:00:00.000Z",
      editedAt: "2026-09-27T09:00:00.000Z",
      deletedAt: null,
      reps: 8,
      weightKg: 60,
      durationS: null,
    });

    const edited = await editSet(
      clientId,
      { reps: 5 },
      { now: new Date("2026-09-28T10:00:00.000Z") },
    );
    expect(edited.reps).toBe(5);
    expect(edited.completedAt).toBe("2026-09-27T09:00:00.000Z");
    expect(edited.editedAt).toBe("2026-09-28T10:00:00.000Z");

    const queued = await db.sets.get(`${USER}:${clientId}`);
    expect(queued?.exerciseId).toBe("back-squat");
    expect(queued?.sessionId).toBe("S1");
  });
});

describe("deleteSet (AC-C3)", () => {
  beforeEach(() => {
    freshOfflineDb();
    signIn(USER);
  });

  afterEach(() => signOut());

  it("tombstones the entry: deleted_at = edited_at, everything else unchanged", async () => {
    const c1 = await recordSet(
      {
        sessionId: "S1",
        exerciseId: "back-squat",
        setIndex: 0,
        kind: "reps",
        reps: 8,
        weightKg: 60,
        isWarmup: false,
        backoff: false,
      },
      { now: new Date("2026-09-28T10:00:00.000Z") },
    );

    const deleted = await deleteSet(c1.clientId, { now: new Date("2026-09-28T10:04:00.000Z") });

    expect(deleted.deletedAt).toBe("2026-09-28T10:04:00.000Z");
    expect(deleted.editedAt).toBe("2026-09-28T10:04:00.000Z");
    expect(deleted.reps).toBe(8);
    expect(deleted.weightKg).toBe(60);
    expect(deleted.completedAt).toBe("2026-09-28T10:00:00.000Z");
  });
});

// Regression (rework): `editSet` used to write `deletedAt: null` unconditionally, so editing a
// deleted set revived it with a newer `edited_at`. That newer `edited_at` beats the tombstone at
// the engine's rule-0 tie-break, so the deleted set silently counted toward load again. A delete
// is a tombstone through the same upsert and is terminal (D-0015).
describe("editSet on a tombstoned set (D-0015 regression)", () => {
  beforeEach(() => {
    freshOfflineDb();
    signIn(USER);
  });

  afterEach(() => signOut());

  it("rejects the edit and never clears deleted_at on a queued tombstone", async () => {
    const c1 = await recordSet(
      {
        sessionId: "S1",
        exerciseId: "back-squat",
        setIndex: 0,
        kind: "reps",
        reps: 8,
        weightKg: 60,
        isWarmup: false,
        backoff: false,
      },
      { now: new Date("2026-09-28T10:00:00.000Z") },
    );
    await deleteSet(c1.clientId, { now: new Date("2026-09-28T10:04:00.000Z") });

    await expect(
      editSet(c1.clientId, { reps: 7 }, { now: new Date("2026-09-28T10:05:00.000Z") }),
    ).rejects.toThrow(/deleted/);

    // The tombstone is untouched: still deleted, still at the delete's edited_at.
    const stored = await offlineDb().sets.get(`${USER}:${c1.clientId}`);
    expect(stored?.deletedAt).toBe("2026-09-28T10:04:00.000Z");
    expect(stored?.editedAt).toBe("2026-09-28T10:04:00.000Z");
    expect(stored?.reps).toBe(8);
  });

  it("rejects the edit on a set tombstoned server-side (history cache only)", async () => {
    const db = offlineDb();
    const clientId = "44444444-4444-4444-8444-444444444444";
    await db.historyCache.put({
      key: `${USER}:${clientId}`,
      userId: USER,
      clientId,
      sessionId: "S1",
      exerciseId: "back-squat",
      isWarmup: false,
      completedAt: "2026-09-27T09:00:00.000Z",
      editedAt: "2026-09-27T09:30:00.000Z",
      deletedAt: "2026-09-27T09:30:00.000Z",
      reps: 8,
      weightKg: 60,
      durationS: null,
    });

    await expect(
      editSet(clientId, { reps: 5 }, { now: new Date("2026-09-28T10:00:00.000Z") }),
    ).rejects.toThrow(/deleted/);

    // Nothing was enqueued, so no resurrecting row can ever reach the server or the engine.
    expect(await db.sets.get(`${USER}:${clientId}`)).toBeUndefined();
  });
});

describe("editSet monotonic clock (AC-C4)", () => {
  beforeEach(() => {
    freshOfflineDb();
    signIn(USER);
  });

  afterEach(() => signOut());

  it("edited_at = previous edited_at + 1ms when the device clock is behind it", async () => {
    const db = offlineDb();
    const clientId = "33333333-3333-4333-8333-333333333333";
    await db.sets.put({
      key: `${USER}:${clientId}`,
      userId: USER,
      clientId,
      sessionId: "S1",
      exerciseId: "back-squat",
      setIndex: 0,
      kind: "reps",
      reps: 8,
      weightKg: 60,
      durationS: null,
      rir: null,
      isWarmup: false,
      backoff: false,
      completedAt: "2026-09-28T09:00:00.000Z",
      editedAt: "2026-09-28T10:05:00.000Z",
      deletedAt: null,
      status: "queued",
    });

    const edited = await editSet(
      clientId,
      { reps: 9 },
      { now: new Date("2026-09-28T10:04:00.000Z") },
    );
    expect(edited.editedAt).toBe("2026-09-28T10:05:00.001Z");
  });
});
