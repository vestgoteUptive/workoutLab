// T-0536 AC1: opening a v2 database at v3 changes no row and adds an empty `excludedCache`.
import { describe, expect, it } from "vitest";
import Dexie from "dexie";
import { OfflineDb } from "../db.js";

const USER = "11111111-1111-4111-8111-111111111111";

class V2Db extends Dexie {
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

describe("T-0536 AC1 v2 to v3 upgrade", () => {
  it("keeps every queued row byte-equal and creates an empty excludedCache", async () => {
    const name = "wl-offline-upgrade-v3";
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
    const v2 = new V2Db(name);
    await v2.open();
    expect(v2.verno).toBe(2);
    await v2.table("sets").bulkPut(sets);
    await v2.table("sessions").put(session);
    v2.close();

    const db = new OfflineDb(name);
    await db.open();
    expect(db.verno).toBe(3);
    expect(
      JSON.stringify((await db.sets.toArray()).sort((a, b) => a.key.localeCompare(b.key))),
    ).toBe(JSON.stringify([...sets].sort((a, b) => a.key.localeCompare(b.key))));
    expect(await db.sessions.toArray()).toEqual([session]);
    expect(await db.excludedCache.count()).toBe(0);
    db.close();
  });
});
