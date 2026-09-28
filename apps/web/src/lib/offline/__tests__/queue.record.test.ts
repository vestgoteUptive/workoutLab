// AC-C1: record set. Uses an explicit `now` (see queue.edit-delete.test.ts header comment for
// why fake timers aren't used here: Dexie/fake-indexeddb need the real clock/microtask queue).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { recordSet } from "../queue.js";
import { OfflineDb } from "../db.js";
import { freshOfflineDb, signIn, signOut } from "./test-helpers.js";

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("recordSet (AC-C1)", () => {
  let dbName: string;

  beforeEach(() => {
    dbName = freshOfflineDb().name;
    signIn("11111111-1111-4111-8111-111111111111");
  });

  afterEach(() => signOut());

  it("resolves an entry with a UUID v4 client_id and matching completed_at/edited_at", async () => {
    const entry = await recordSet(
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

    expect(entry.clientId).toMatch(UUID_V4_RE);
    expect(entry.completedAt).toBe("2026-09-28T10:00:00.000Z");
    expect(entry.editedAt).toBe("2026-09-28T10:00:00.000Z");
    expect(entry.deletedAt).toBeNull();
    expect(entry.userId).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("resolves only after the IDB transaction commits: a fresh Dexie instance sees the row", async () => {
    const entry = await recordSet(
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

    // A brand-new Dexie instance on the same database name (D-0045 §13 amendment of AC-C1).
    const fresh = new OfflineDb(dbName);
    const row = await fresh.sets.get(entry.key);
    expect(row).toBeDefined();
    expect(row?.reps).toBe(8);
    fresh.close();
  });
});
