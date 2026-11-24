// T-0954 AC8: opening a v4 database at v5 keeps every favorites, excluded and history row
// (tombstoned ones too) and adds two empty stores for the weight steps.
import { describe, expect, it } from "vitest";
import Dexie from "dexie";
import { OfflineDb } from "../db.js";

const USER = "11111111-1111-4111-8111-111111111111";

class V4Db extends Dexie {
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
  }
}

const listRow = (id: string) => ({
  key: `${USER}:${id}`,
  userId: USER,
  exerciseId: id,
  createdAt: "2026-10-01T10:00:00.000Z",
});
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

describe("T-0954 AC8 v4 to v5 upgrade", () => {
  it("keeps favorites, excluded and history (incl. tombstones) byte-equal; the new stores are empty", async () => {
    const name = "wl-offline-upgrade-v5";
    const favorites = [listRow("db-curl"), listRow("leg-curl")];
    const excluded = [listRow("back-squat")];
    const rows = [history("c-live", null), history("c-gone", "2026-10-01T11:00:00.000Z")];
    const v4 = new V4Db(name);
    await v4.open();
    expect(v4.verno).toBe(4);
    await v4.table("favoriteCache").bulkPut(favorites);
    await v4.table("excludedCache").bulkPut(excluded);
    await v4.table("historyCache").bulkPut(rows);
    v4.close();

    const db = new OfflineDb(name);
    await db.open();
    expect(db.verno).toBe(8);
    const same = (a: unknown, b: unknown) => expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const byKey = <T extends { key: string }>(r: T[]) =>
      [...r].sort((x, y) => x.key.localeCompare(y.key));
    same(byKey(await db.favoriteCache.toArray()), byKey(favorites));
    same(byKey(await db.excludedCache.toArray()), byKey(excluded));
    same(byKey(await db.historyCache.toArray()), byKey(rows));
    expect((await db.historyCache.toArray()).filter((r) => r.deletedAt !== null)).toHaveLength(1);
    expect(await db.exerciseSettings.count()).toBe(0);
    expect(await db.exerciseSettingsQueue.count()).toBe(0);
    db.close();
  });
});
