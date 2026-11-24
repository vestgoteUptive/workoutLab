// T-0953 AC3: opening a v5 database at v6 keeps every history row (tombstone included) and every
// queued set (a rejected one too) byte-equal; a history row cached before v6 reads rir null.
import { describe, expect, it } from "vitest";
import Dexie from "dexie";
import { OfflineDb } from "../db.js";
import { loadEngineHistory } from "../engine-feed.js";
import { signIn, signOut } from "./test-helpers.js";

const USER = "11111111-1111-4111-8111-111111111111";

class V5Db extends Dexie {
  constructor(name: string) {
    super(name);
    this.version(1).stores({
      sessions: "id, userId",
      sets: "key, userId, sessionId, editedAt, status, [userId+status]",
      historyCache: "key, userId, completedAt",
      libraryCache: "key, userId",
      targetCache: "key, userId",
      profileCache: "userId",
      syncMeta: "userId",
    });
    this.version(2).stores({
      exerciseDetails: "key, userId",
      sessionCache: "key, userId, startedAt",
      checkinCache: "key, userId",
      routineCache: "key, userId, name",
    });
    this.version(3).stores({ excludedCache: "key, userId" });
    this.version(4).stores({ favoriteCache: "key, userId" });
    this.version(5).stores({
      exerciseSettings: "key, userId",
      exerciseSettingsQueue: "key, userId, queuedAt",
    });
  }
}

const history = (clientId: string, deletedAt: string | null) => ({
  key: `${USER}:${clientId}`,
  userId: USER,
  clientId,
  sessionId: "S1",
  exerciseId: "bench-press",
  isWarmup: false,
  completedAt: "2026-10-01T10:00:00.000Z",
  editedAt: "2026-10-01T10:00:00.000Z",
  deletedAt,
  reps: 8,
  weightKg: 80,
  durationS: null,
});
const queued = (clientId: string, status: "queued" | "rejected") => ({
  key: `${USER}:${clientId}`,
  userId: USER,
  clientId,
  sessionId: "S1",
  exerciseId: "bench-press",
  setIndex: 0,
  kind: "reps",
  reps: 8,
  weightKg: 80,
  durationS: null,
  rir: 0,
  isWarmup: false,
  backoff: false,
  completedAt: "2026-10-02T10:00:00.000Z",
  editedAt: "2026-10-02T10:00:00.000Z",
  deletedAt: null,
  status,
});

describe("T-0953 AC3 v5 to v6 upgrade", () => {
  it("keeps history (tombstone) and queued sets (rejected) byte-equal; old rows read rir null", async () => {
    const name = "wl-offline-upgrade-v6";
    const rows = [history("c-live", null), history("c-gone", "2026-10-01T11:00:00.000Z")];
    const sets = [queued("q-1", "queued"), queued("q-2", "rejected")];
    const v5 = new V5Db(name);
    await v5.open();
    expect(v5.verno).toBe(5);
    await v5.table("historyCache").bulkPut(rows);
    await v5.table("sets").bulkPut(sets);
    v5.close();

    const db = new OfflineDb(name);
    await db.open();
    expect(db.verno).toBe(8);
    const same = (a: unknown, b: unknown) => expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const byKey = <T extends { key: string }>(r: T[]) =>
      [...r].sort((x, y) => x.key.localeCompare(y.key));
    same(byKey(await db.historyCache.toArray()), byKey(rows));
    same(byKey(await db.sets.toArray()), byKey(sets));
    expect((await db.historyCache.toArray()).filter((r) => r.deletedAt !== null)).toHaveLength(1);
    expect((await db.sets.toArray()).filter((r) => r.status === "rejected")).toHaveLength(1);
    db.close();
  });

  it("an old history row (no rir field) reads rir null in the engine feed", async () => {
    const name = "wl-offline-upgrade-v6-feed";
    const v5 = new V5Db(name);
    await v5.open();
    await v5.table("historyCache").bulkPut([history("c-old", null)]);
    v5.close();
    const { resetOfflineDbForTest } = await import("../db.js");
    const db = resetOfflineDbForTest(name);
    await db.open();
    signIn(USER);
    try {
      const [set] = await loadEngineHistory();
      expect(set!.clientId).toBe("c-old");
      expect(set!.rir).toBeNull();
    } finally {
      signOut();
      db.close();
    }
  });
});
