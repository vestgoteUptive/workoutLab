// T-0319 AC-1: the v1 → v2 upgrade must not lose a single row.
//
// This is the test that matters most on this ticket. NFR-OFF-2 says no queued data is lost on
// upgrade, and T-0300c shipped 122/122 green while silently destroying data, so a fresh-install
// test is not enough: the database here is built by the REAL v1 schema (a separate Dexie
// subclass declaring only `version(1)`, exactly the stores db.ts shipped in T-0300c), populated
// through that v1 instance, closed, and only then reopened by the v2 `OfflineDb`.
//
// Deliberately NOT tested through `resetOfflineDbForTest`: that would reuse the v2 class, so
// IndexedDB would create the database at version 2 directly and the upgrade path would never
// run. Reopening the same *name* with a higher `version()` is the only thing that exercises it.
import { beforeEach, describe, expect, it } from "vitest";
import Dexie, { type Table } from "dexie";
import {
  OfflineDb,
  type CachedAreaTarget,
  type CachedHistorySet,
  type CachedLibraryExercise,
  type CachedProfile,
  type QueuedSession,
  type QueuedSet,
  type SyncMeta,
} from "../db.js";

/** The T-0300c v1 schema, frozen. A copy on purpose: if `db.ts`'s v1 `.stores()` call is ever
 *  edited, this fixture still describes what real devices hold, so the test keeps testing the
 *  upgrade users will actually run. */
class V1Db extends Dexie {
  sessions!: Table<QueuedSession, string>;
  sets!: Table<QueuedSet, string>;
  historyCache!: Table<CachedHistorySet, string>;
  libraryCache!: Table<CachedLibraryExercise, string>;
  targetCache!: Table<CachedAreaTarget, string>;
  profileCache!: Table<CachedProfile, string>;
  syncMeta!: Table<SyncMeta, string>;

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
  }
}

const USER = "11111111-1111-4111-8111-111111111111";

/** A queued, never-flushed set: the row NFR-OFF-2 is really about. */
function queuedSet(clientId: string, setIndex: number): QueuedSet {
  return {
    key: `${USER}:${clientId}`,
    userId: USER,
    clientId,
    sessionId: "S1",
    exerciseId: "back-squat",
    setIndex,
    kind: "reps",
    reps: 8,
    weightKg: 62.5,
    durationS: null,
    rir: 2,
    isWarmup: false,
    backoff: false,
    completedAt: `2026-09-27T10:0${setIndex}:00.000Z`,
    editedAt: `2026-09-27T10:0${setIndex}:00.000Z`,
    deletedAt: null,
    status: "queued",
  };
}

/** T-0319 QA: a SOFT-DELETED queued set. The original fixture held only
 *  `{deletedAt: null, status: "queued"}` rows, so an `.upgrade()` that reset `deletedAt` or
 *  `status` — resurrecting a set the user deleted offline, which is precisely what T-0300c
 *  shipped green — left every test passing. These two rows make that state observable. */
const DELETED_SET: QueuedSet = {
  ...queuedSet("c-del", 3),
  key: `${USER}:c-del`,
  clientId: "c-del",
  deletedAt: "2026-09-27T10:30:00.000Z",
};

/** A set the server rejected. `status: "rejected"` must not be silently re-queued either. */
const REJECTED_SET: QueuedSet = {
  ...queuedSet("c-rej", 4),
  key: `${USER}:c-rej`,
  clientId: "c-rej",
  status: "rejected",
};

/** A finished session still in the queue. `finished: true` is the D-0053 §7 marker whose loss
 *  would clear `ended_at` server-side, so the upgrade has to carry it across verbatim. */
const QUEUED_SESSION: QueuedSession = {
  id: "S1",
  userId: USER,
  row: {
    id: "S1",
    started_at: "2026-09-27T09:00:00.000Z",
    ended_at: "2026-09-27T10:05:00.000Z",
    time_budget_min: 45,
    energy: "normal",
    effort_rating: 4,
  } as QueuedSession["row"],
  finished: true,
  pending: true,
};

const HISTORY_ROW: CachedHistorySet = {
  key: `${USER}:c-old`,
  userId: USER,
  clientId: "c-old",
  sessionId: "S0",
  exerciseId: "bench-press",
  isWarmup: false,
  completedAt: "2026-09-20T10:00:00.000Z",
  editedAt: "2026-09-20T10:00:00.000Z",
  deletedAt: null,
  reps: 10,
  weightKg: 40,
  durationS: null,
};

const LIBRARY_ROW: CachedLibraryExercise = {
  key: `${USER}:back-squat`,
  userId: USER,
  exercise: {
    id: "back-squat",
    name: "Back squat",
    type: "compound",
    level: "beginner",
    equipment: [],
    kind: "exercise",
    timed: false,
    incrementKg: 2.5,
    defaultDurationS: null,
    externalLoad: true,
    areas: [{ area: "quads", weight: 1 }],
  } as CachedLibraryExercise["exercise"],
};

const TARGET_ROW: CachedAreaTarget = {
  key: `${USER}:quads`,
  userId: USER,
  target: {
    area: "quads",
    setsPer14d: 12,
    source: "default",
    updatedAt: "2026-09-01T00:00:00.000Z",
  } as CachedAreaTarget["target"],
};

const PROFILE_ROW: CachedProfile = {
  userId: USER,
  profile: {
    goal: "build_muscle",
    level: "beginner",
    equipment: [],
    rhythmMin: 3,
    rhythmMax: 4,
    priorityAreas: [],
    onboardedAt: "2026-09-01T00:00:00.000Z",
    planUpdatedAt: "2026-09-01T00:00:00.000Z",
  } as CachedProfile["profile"],
};

const META_ROW: SyncMeta = {
  userId: USER,
  lastSyncedAt: "2026-09-27T08:00:00.000Z",
  persistRequested: true,
};

let dbName = "";
let counter = 0;

beforeEach(async () => {
  counter += 1;
  dbName = `wl-offline-upgrade-${counter}`;

  const v1 = new V1Db(dbName);
  await v1.open();
  expect(v1.verno).toBe(1);
  await v1.sets.bulkPut([queuedSet("c-1", 0), queuedSet("c-2", 1), DELETED_SET, REJECTED_SET]);
  await v1.sessions.put(QUEUED_SESSION);
  await v1.historyCache.put(HISTORY_ROW);
  await v1.libraryCache.put(LIBRARY_ROW);
  await v1.targetCache.put(TARGET_ROW);
  await v1.profileCache.put(PROFILE_ROW);
  await v1.syncMeta.put(META_ROW);
  // Closing matters: IndexedDB blocks a version change while an older connection is open, so a
  // leaked v1 handle would make the reopen hang instead of upgrading.
  v1.close();
});

describe("AC-1 v1 → v2 upgrade", () => {
  it("opens a populated v1 database at verno 2 with every v1 row still deep-equal", async () => {
    const db = new OfflineDb(dbName);
    await db.open();
    try {
      expect(db.verno).toBe(4);

      // The queued offline sets: the rows NFR-OFF-2 protects.
      const sets = await db.sets.where({ userId: USER }).sortBy("setIndex");
      expect(sets).toEqual([queuedSet("c-1", 0), queuedSet("c-2", 1), DELETED_SET, REJECTED_SET]);
      // T-0319 QA, spelled out because these are the states whose loss is silent corruption:
      // a set deleted offline must stay deleted, and a rejected set must stay rejected.
      expect((await db.sets.get(DELETED_SET.key))?.deletedAt).toBe("2026-09-27T10:30:00.000Z");
      expect((await db.sets.get(REJECTED_SET.key))?.status).toBe("rejected");
      expect(await db.sets.where({ userId: USER, status: "rejected" }).count()).toBe(1);
      // Still queued and still findable by the compound key the flush queries on.
      expect(await db.sets.where({ userId: USER, status: "queued" }).count()).toBe(3);
      // T-0319 QA: the line above is NOT enough on its own. Dexie answers
      // `where({userId, status})` from the plain `userId` index plus a filter when
      // `[userId+status]` is missing, so dropping the compound index from the v2 schema left
      // every test in the repo green while turning the flush's hot query into a scan of the
      // user's whole `sets` table. Assert the index itself survived the version bump.
      const setsIndexes = db.sets.schema.indexes.map((i) => i.name).sort();
      expect(setsIndexes).toContain("[userId+status]");
      expect(db.sets.schema.primKey.name).toBe("key");
      // Every v1 index, not just the compound one: a v2 `.stores()` entry for `sets` would
      // silently replace the whole index list.
      expect(setsIndexes).toEqual(
        ["[userId+status]", "editedAt", "sessionId", "status", "userId"].sort(),
      );

      // The finished session, including the `finished` marker (D-0053 §7).
      expect(await db.sessions.get("S1")).toEqual(QUEUED_SESSION);

      expect(await db.historyCache.get(HISTORY_ROW.key)).toEqual(HISTORY_ROW);
      expect(await db.libraryCache.get(LIBRARY_ROW.key)).toEqual(LIBRARY_ROW);
      expect(await db.targetCache.get(TARGET_ROW.key)).toEqual(TARGET_ROW);
      expect(await db.profileCache.get(USER)).toEqual(PROFILE_ROW);
      expect(await db.syncMeta.get(USER)).toEqual(META_ROW);
    } finally {
      db.close();
    }
  });

  it("creates the four v2 tables empty, without touching the v1 rows", async () => {
    const db = new OfflineDb(dbName);
    await db.open();
    try {
      expect(await db.exerciseDetails.count()).toBe(0);
      expect(await db.sessionCache.count()).toBe(0);
      expect(await db.checkinCache.count()).toBe(0);
      expect(await db.routineCache.count()).toBe(0);

      // The stores exist (a missing store throws on a query, it doesn't return []).
      expect(await db.exerciseDetails.where({ userId: USER }).toArray()).toEqual([]);
      expect(await db.sessionCache.where({ userId: USER }).toArray()).toEqual([]);
      expect(await db.checkinCache.where({ userId: USER }).toArray()).toEqual([]);
      expect(await db.routineCache.where({ userId: USER }).toArray()).toEqual([]);

      expect(await db.sets.count()).toBe(4);
      expect(await db.sessions.count()).toBe(1);
    } finally {
      db.close();
    }
  });

  it("a queued set written before the upgrade is still flushable after it, then usable in v2", async () => {
    // The end-to-end version of NFR-OFF-2: reopen at v2, write to a NEW table, and confirm the
    // pre-existing queue is untouched by that write. This is what would break if version 2 had
    // an `.upgrade()` callback that rewrote or cleared rows.
    const db = new OfflineDb(dbName);
    await db.open();
    try {
      await db.sessionCache.put({
        key: `${USER}:S9`,
        userId: USER,
        id: "S9",
        startedAt: "2026-09-26T09:00:00.000Z",
        endedAt: null,
        timeBudgetMin: 30,
        effortRating: null,
        energy: "normal",
      });
      expect(await db.sets.where({ userId: USER }).sortBy("setIndex")).toEqual([
        queuedSet("c-1", 0),
        queuedSet("c-2", 1),
        DELETED_SET,
        REJECTED_SET,
      ]);
      expect((await db.sessions.get("S1"))?.finished).toBe(true);
      expect((await db.sessions.get("S1"))?.row.ended_at).toBe("2026-09-27T10:05:00.000Z");
    } finally {
      db.close();
    }

    // And a third open (now already at v2) is a no-op for the data.
    const again = new OfflineDb(dbName);
    await again.open();
    try {
      expect(again.verno).toBe(4);
      expect(await again.sets.count()).toBe(4);
      expect(await again.sessionCache.count()).toBe(1);
    } finally {
      again.close();
    }
  });
});
