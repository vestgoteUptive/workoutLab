// T-1008: opening a v7 database at v8 keeps every store intact (a tombstoned history row, a
// queued and a rejected set, a queued weight step, the ledger and its device id) and adds the
// empty `editSignalsCache`.
import { describe, expect, it } from "vitest";
import Dexie from "dexie";
import { OfflineDb } from "../db.js";

const USER = "11111111-1111-4111-8111-111111111111";

class V7Db extends Dexie {
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
    this.version(7).stores({ editLedger: "key, userId, lastSeen", editLedgerMeta: "userId" });
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

const entry = {
  key: `${USER}:swap:A:B`,
  userId: USER,
  ledgerKey: "swap:A:B",
  kind: "swap",
  exerciseId: "A",
  toExerciseId: "B",
  count: 2,
  windowStart: "2026-10-01T10:00:00.000Z",
  lastSeen: "2026-10-02T10:00:00.000Z",
  askedAt: null,
  dirty: true,
  visits: ["v1", "v2"],
};
const meta = { userId: USER, deviceId: "dev-1" };

describe("T-1008 v7 to v8 upgrade", () => {
  it("keeps tombstones, rejected sets and queued steps byte-equal and adds an empty editSignalsCache", async () => {
    const name = "wl-offline-upgrade-v8";
    const rows = [history("c-live", null), history("c-gone", "2026-10-01T11:00:00.000Z")];
    const sets = [queuedSet("q-1", "queued"), queuedSet("q-2", "rejected")];
    const v7 = new V7Db(name);
    await v7.open();
    expect(v7.verno).toBe(7);
    await v7.table("historyCache").bulkPut(rows);
    await v7.table("sets").bulkPut(sets);
    await v7.table("exerciseSettingsQueue").put(step);
    await v7.table("editLedger").put(entry);
    await v7.table("editLedgerMeta").put(meta);
    v7.close();

    const db = new OfflineDb(name);
    await db.open();
    expect(db.verno).toBe(8);
    const same = (a: unknown, b: unknown) => expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const byKey = <T extends { key: string }>(r: T[]) =>
      [...r].sort((x, y) => x.key.localeCompare(y.key));
    same(byKey(await db.historyCache.toArray()), byKey(rows));
    same(byKey(await db.sets.toArray()), byKey(sets));
    same(await db.exerciseSettingsQueue.toArray(), [step]);
    expect((await db.historyCache.toArray()).filter((r) => r.deletedAt !== null)).toHaveLength(1);
    expect((await db.sets.toArray()).filter((r) => r.status === "rejected")).toHaveLength(1);
    same(await db.editLedger.toArray(), [entry]);
    same(await db.editLedgerMeta.toArray(), [meta]);
    expect(await db.editSignalsCache.count()).toBe(0);
    db.close();
  });
});
