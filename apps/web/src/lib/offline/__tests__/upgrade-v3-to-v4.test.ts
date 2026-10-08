// T-0567 AC1: opening a v3 database at v4 changes no row and adds an empty `favoriteCache`.
import { describe, expect, it } from "vitest";
import Dexie from "dexie";
import { OfflineDb } from "../db.js";

const USER = "11111111-1111-4111-8111-111111111111";

class V3Db extends Dexie {
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
  }
}

const set = (clientId: string, extra: Record<string, unknown>) => ({
  key: `${USER}:${clientId}`,
  userId: USER,
  clientId,
  sessionId: "S1",
  exerciseId: "bench-press",
  setIndex: 0,
  kind: "reps",
  reps: 8,
  weightKg: 40,
  durationS: null,
  rir: 2,
  isWarmup: false,
  backoff: false,
  completedAt: "2026-10-01T10:00:00.000Z",
  editedAt: "2026-10-01T10:00:00.000Z",
  deletedAt: null,
  status: "queued",
  ...extra,
});

const byKey = <T extends { key: string }>(rows: T[]) =>
  [...rows].sort((a, b) => a.key.localeCompare(b.key));

describe("T-0567 AC1 v3 to v4 upgrade", () => {
  it("keeps queued sets, the session and the excluded cache byte-equal; favoriteCache is empty", async () => {
    const name = "wl-offline-upgrade-v4";
    const sets = [
      set("c-q", {}),
      set("c-r", { status: "rejected" }),
      set("c-d", { deletedAt: "2026-10-01T11:00:00.000Z" }),
    ];
    const session = {
      id: "S1",
      userId: USER,
      row: { id: "S1", started_at: "2026-10-01T09:00:00.000Z", ended_at: null },
      finished: false,
      pending: true,
    };
    const excluded = {
      key: `${USER}:back-squat`,
      userId: USER,
      exerciseId: "back-squat",
      createdAt: "2026-10-01T10:00:00.000Z",
    };
    const v3 = new V3Db(name);
    await v3.open();
    expect(v3.verno).toBe(3);
    await v3.table("sets").bulkPut(sets);
    await v3.table("sessions").put(session);
    await v3.table("excludedCache").put(excluded);
    v3.close();

    const db = new OfflineDb(name);
    await db.open();
    expect(db.verno).toBe(4);
    expect(JSON.stringify(byKey(await db.sets.toArray()))).toBe(JSON.stringify(byKey(sets)));
    expect(JSON.stringify(await db.sessions.toArray())).toBe(JSON.stringify([session]));
    expect(JSON.stringify(await db.excludedCache.toArray())).toBe(JSON.stringify([excluded]));
    expect(await db.favoriteCache.count()).toBe(0);
    db.close();
  });
});
