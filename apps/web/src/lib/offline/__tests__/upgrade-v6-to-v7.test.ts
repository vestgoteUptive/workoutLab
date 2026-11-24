// T-1007 AC12: opening a v6 database at v7 keeps every store intact (a tombstoned history row, a
// queued set that was rejected, a queued weight step) and adds the two empty ledger stores.
import { describe, expect, it } from "vitest";
import Dexie from "dexie";
import { OfflineDb } from "../db.js";

const USER = "11111111-1111-4111-8111-111111111111";

class V6Db extends Dexie {
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
    this.version(6).stores({ historyCache: "key, userId, completedAt" });
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
  rir: 2,
});
const queuedSet = (clientId: string, status: "queued" | "rejected") => ({
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
const step = {
  key: `${USER}:bench-press`,
  userId: USER,
  exerciseId: "bench-press",
  op: "upsert",
  incrementKg: 1.25,
  queuedAt: "2026-10-03T10:00:00.000Z",
  base: null,
  seen: null,
  status: "queued",
};

describe("T-1007 AC12 v6 to v7 upgrade", () => {
  it("keeps tombstones, rejected sets and queued steps byte-equal and adds empty ledger stores", async () => {
    const name = "wl-offline-upgrade-v7";
    const rows = [history("c-live", null), history("c-gone", "2026-10-01T11:00:00.000Z")];
    const sets = [queuedSet("q-1", "queued"), queuedSet("q-2", "rejected")];
    const v6 = new V6Db(name);
    await v6.open();
    expect(v6.verno).toBe(6);
    await v6.table("historyCache").bulkPut(rows);
    await v6.table("sets").bulkPut(sets);
    await v6.table("exerciseSettingsQueue").put(step);
    v6.close();

    const db = new OfflineDb(name);
    await db.open();
    expect(db.verno).toBe(7);
    const same = (a: unknown, b: unknown) => expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const byKey = <T extends { key: string }>(r: T[]) =>
      [...r].sort((x, y) => x.key.localeCompare(y.key));
    same(byKey(await db.historyCache.toArray()), byKey(rows));
    same(byKey(await db.sets.toArray()), byKey(sets));
    same(await db.exerciseSettingsQueue.toArray(), [step]);
    expect((await db.historyCache.toArray()).filter((r) => r.deletedAt !== null)).toHaveLength(1);
    expect((await db.sets.toArray()).filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(await db.editLedger.count()).toBe(0);
    expect(await db.editLedgerMeta.count()).toBe(0);
    db.close();
  });
});
