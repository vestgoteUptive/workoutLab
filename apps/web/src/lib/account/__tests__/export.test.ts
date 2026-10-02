// T-0310c AC1–AC5 (D-0136 §2, NFR-PRIV-4, UF-11.4): paged export v1.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OfflineDb, QueuedSession, QueuedSet } from "../../offline/db.js";
import { freshOfflineDb } from "../../offline/__tests__/test-helpers.js";
import { downloadAccountExport, exportAccountData } from "../index.js";
import { EXPORT_TABLE_NAMES, NOW, TZ, U, V, pg, twoYears, type Row } from "./fixtures.js";

let db: OfflineDb;

beforeEach(() => {
  db = freshOfflineDb();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const input = { userId: U, email: "u@test.local", now: NOW };

function sortedBy(rows: Row[], col: string): Row[] {
  return [...rows].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1));
}

describe("T-0310c AC1 paging past max_rows", () => {
  it("T-0310c AC1 reads all 5,000 sets in six ranges, ascending id, tombstones included", async () => {
    const fake = pg(twoYears(U));
    const result = await exportAccountData(input, { supabase: fake.client, db });

    const sets = result.tables.session_sets as unknown as Row[];
    expect(sets).toHaveLength(5000);
    const ids = sets.map((s) => s.id as string);
    expect(new Set(ids).size).toBe(5000);
    expect(ids).toEqual([...ids].sort());
    expect(ids[0]).toBe("s0000");
    expect(ids.at(-1)).toBe("s4999");
    expect(sets.filter((s) => s.deleted_at !== null)).toHaveLength(40);

    expect(fake.rangesFor("session_sets")).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
      [3000, 3999],
      [4000, 4999],
      [5000, 5999],
    ]);
    expect(result.tables.sessions).toHaveLength(400);
    expect(fake.tablesCalled).not.toContain("session_sets_live");
  });

  it("T-0310c AC1 contrast: 999 sets is one range, 1,000 sets is two", async () => {
    const f999 = pg(twoYears(U, 999));
    const r999 = await exportAccountData(input, { supabase: f999.client, db });
    expect(f999.rangesFor("session_sets")).toEqual([[0, 999]]);
    expect(r999.tables.session_sets).toHaveLength(999);

    const f1000 = pg(twoYears(U, 1000));
    const r1000 = await exportAccountData(input, { supabase: f1000.client, db });
    expect(f1000.rangesFor("session_sets")).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(r1000.tables.session_sets).toHaveLength(1000);
  });

  it("T-0310c AC1 the fake is a real max_rows cap: an unpaged read gets only 1,000", async () => {
    // Guards the fixture itself: if `pg` returned everything without a range, AC1 would pass
    // against an unpaged implementation.
    const fake = pg(twoYears(U));
    const { data } = await (fake.client.from("session_sets").select("*") as unknown as Promise<{
      data: unknown[];
    }>);
    expect(data).toHaveLength(1000);
  });
});

describe("T-0310c AC2 shape (D-0136 §2)", () => {
  it("T-0310c AC2 top-level keys, header, 7 tables, raw rows, order keys", async () => {
    const seeded = twoYears(U);
    const fake = pg(seeded);
    const result = await exportAccountData(input, { supabase: fake.client, db });

    expect(Object.keys(result)).toEqual([
      "format",
      "version",
      "exportedAt",
      "account",
      "tables",
      "device",
    ]);
    expect(result.format).toBe("workoutlab-export");
    expect(result.version).toBe(1);
    expect(result.exportedAt).toBe("2026-09-27T23:30:00.000Z");
    expect(result.account).toEqual({ userId: U, email: "u@test.local" });
    expect(Object.keys(result.tables).sort()).toEqual(EXPORT_TABLE_NAMES);

    const keys: Record<string, string> = {
      profiles: "user_id",
      area_targets: "area_id",
      sessions: "id",
      session_sets: "id",
      routines: "id",
      routine_items: "id",
      plan_checkins: "id",
    };
    for (const [table, key] of Object.entries(keys)) {
      expect(fake.ordersFor(table).length, table).toBeGreaterThan(0);
      for (const order of fake.ordersFor(table))
        expect(order, table).toEqual([key, { ascending: true }]);
      expect(
        fake.calls.filter((c) => c.table === table).every((c) => c.columns === "*"),
        table,
      ).toBe(true);
      const exported = (result.tables as unknown as Record<string, Row[]>)[table];
      expect(exported, table).toEqual(sortedBy(seeded[table]!, key));
    }
  });

  it("T-0310c AC2 zero history: profile + 9 targets, [] for the other five", async () => {
    const all = twoYears(U);
    const fake = pg({ profiles: all.profiles!, area_targets: all.area_targets! });
    const result = await exportAccountData(input, { supabase: fake.client, db });
    expect(result.tables.profiles).toHaveLength(1);
    expect(result.tables.area_targets).toHaveLength(9);
    for (const t of ["sessions", "session_sets", "routines", "routine_items", "plan_checkins"]) {
      expect((result.tables as unknown as Record<string, unknown>)[t], t).toEqual([]);
    }
    expect(result.device).toEqual({ queuedSessions: [], queuedSets: [] });
  });
});

function queuedSet(userId: string, clientId: string, status: QueuedSet["status"]): QueuedSet {
  return {
    key: `${userId}:${clientId}`,
    userId,
    clientId,
    sessionId: `${userId}-S1`,
    exerciseId: "back-squat",
    setIndex: 0,
    kind: "reps",
    reps: 8,
    weightKg: 60,
    durationS: null,
    rir: 2,
    isWarmup: false,
    backoff: false,
    completedAt: "2026-09-27T10:00:00.000Z",
    editedAt: "2026-09-27T10:00:00.000Z",
    deletedAt: null,
    status,
  };
}

function queuedSession(id: string, userId: string, pending: boolean): QueuedSession {
  return {
    id,
    userId,
    row: {
      id,
      user_id: userId,
      started_at: "2026-09-27T09:00:00.000Z",
      time_budget_min: 45,
    } as QueuedSession["row"],
    finished: false,
    pending,
  };
}

describe("T-0310c AC3 device section", () => {
  it("T-0310c AC3 U's pending session and both sets, without key/userId; nothing of V's", async () => {
    const S1 = queuedSession("u-session-pending", U, true);
    const S2 = queuedSession("u-session-flushed", U, false);
    await db.sessions.bulkPut([S1, S2, queuedSession("v-session-pending", V, true)]);
    await db.sets.bulkPut([
      queuedSet(U, "u-set-queued", "queued"),
      queuedSet(U, "u-set-rejected", "rejected"),
      queuedSet(V, "v-set-queued", "queued"),
    ]);

    const result = await exportAccountData(input, { supabase: pg(twoYears(U, 10)).client, db });

    expect(result.device.queuedSessions).toEqual([S1.row]);
    expect(result.device.queuedSets).toHaveLength(2);
    for (const s of result.device.queuedSets) {
      expect(Object.keys(s)).not.toContain("key");
      expect(Object.keys(s)).not.toContain("userId");
    }
    expect(result.device.queuedSets.map((s) => s.clientId).sort()).toEqual([
      "u-set-queued",
      "u-set-rejected",
    ]);
    expect(result.device.queuedSets.map((s) => s.status).sort()).toEqual(["queued", "rejected"]);

    const json = JSON.stringify(result);
    expect(json).not.toContain("v-session-pending");
    expect(json).not.toContain("v-set-queued");
    expect(json).not.toContain(V);
    expect(json).not.toContain("u-session-flushed");
  });
});

describe("T-0310c AC4 all or nothing", () => {
  const cases: Array<[string, Parameters<typeof pg>[1]]> = [
    [
      "routines resolves with an error",
      {
        hook: (call) =>
          call.table === "routines"
            ? { data: null, error: { code: "PGRST000", message: "boom" } }
            : undefined,
      },
    ],
    [
      "the 3rd session_sets page rejects",
      {
        hook: (call, nth) =>
          call.table === "session_sets" && nth === 3
            ? Promise.reject(new TypeError("Failed to fetch"))
            : undefined,
      },
    ],
    [
      "profiles resolves {data: null, error: null}",
      { hook: (call) => (call.table === "profiles" ? { data: null, error: null } : undefined) },
    ],
  ];

  it.each(cases)("T-0310c AC4 %s → rejects export_failed", async (_name, options) => {
    const fake = pg(twoYears(U), options);
    await expect(exportAccountData(input, { supabase: fake.client, db })).rejects.toThrow(
      new Error("export_failed"),
    );
  });

  it("T-0310c AC4 the 3rd page failing stops paging that table (no 4th request)", async () => {
    const fake = pg(twoYears(U), {
      hook: (call, nth) =>
        call.table === "session_sets" && nth === 3 ? Promise.reject(new Error("x")) : undefined,
    });
    await expect(exportAccountData(input, { supabase: fake.client, db })).rejects.toThrow(
      "export_failed",
    );
    expect(fake.rangesFor("session_sets")).toHaveLength(3);
  });

  it("T-0310c AC4 a Dexie failure also rejects export_failed", async () => {
    vi.spyOn(db.sets, "where").mockImplementation(() => {
      throw new Error("idb closed");
    });
    await expect(
      exportAccountData(input, { supabase: pg(twoYears(U, 10)).client, db }),
    ).rejects.toThrow("export_failed");
  });

  it.each(cases)(
    "T-0310c AC4 %s → the export-then-download flow never reaches downloadAccountExport",
    async (_name, options) => {
      const create = vi.fn(() => "blob:x");
      const urlStatics = URL as unknown as Record<string, unknown>;
      const saved = { c: urlStatics.createObjectURL, r: urlStatics.revokeObjectURL };
      urlStatics.createObjectURL = create;
      urlStatics.revokeObjectURL = vi.fn();
      const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      const fake = pg(twoYears(U), options);
      const flow = exportAccountData(input, { supabase: fake.client, db }).then((data) =>
        downloadAccountExport(data, NOW, TZ),
      );
      await expect(flow).rejects.toThrow("export_failed");
      expect(create).not.toHaveBeenCalled();
      expect(click).not.toHaveBeenCalled();
      urlStatics.createObjectURL = saved.c;
      urlStatics.revokeObjectURL = saved.r;
    },
  );
});

describe("T-0310c AC5 10 s for 2 years (NFR-PRIV-4)", () => {
  it("T-0310c AC5 export + stringify of 5,000 sets with 25 ms per request takes < 10,000 ms", async () => {
    const fake = pg(twoYears(U), { latencyMs: 25 });
    const started = performance.now();
    const result = await exportAccountData(input, { supabase: fake.client, db });
    const text = JSON.stringify(result, null, 2);
    const elapsed = performance.now() - started;
    expect(text.length).toBeGreaterThan(0);
    expect(result.tables.session_sets).toHaveLength(5000);
    // Every request really waited: 6 session_sets pages in series is >= 150 ms.
    expect(elapsed).toBeGreaterThanOrEqual(150);
    expect(elapsed).toBeLessThan(10_000);
  }, 15_000);
});
