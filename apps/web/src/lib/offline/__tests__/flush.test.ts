// AC-C5 (flush order + batching), AC-C6 (in-flight edit survives), AC-C7 (FK not yet there),
// AC-C8 (token expiry), AC-C9 (10 days offline), AC-C11 (rejected row kept).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseSpy } from "./supabase-spy.js";

const spy = createSupabaseSpy();
vi.mock("../../auth/client.js", () => ({ supabase: { from: spy.from } }));

const { flush, clearAuthBlocked } = await import("../flush.js");
const { upsertSession, editSet } = await import("../queue.js");
const { offlineDb } = await import("../db.js");
const { freshOfflineDb, signIn, signOut } = await import("./test-helpers.js");

const USER = "11111111-1111-4111-8111-111111111111";

function setRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    userId: USER,
    clientId: "c-1",
    sessionId: "S1",
    exerciseId: "back-squat",
    setIndex: 0,
    kind: "reps" as const,
    reps: 8,
    weightKg: 60,
    durationS: null,
    rir: null,
    isWarmup: false,
    backoff: false,
    completedAt: "2026-09-28T10:00:00.000Z",
    editedAt: "2026-09-28T10:00:00.000Z",
    deletedAt: null,
    status: "queued" as const,
    key: `${USER}:${overrides.clientId ?? "c-1"}`,
    ...overrides,
  };
}

beforeEach(() => {
  freshOfflineDb();
  signIn(USER);
  spy.calls.length = 0;
  spy.from.mockClear();
  clearAuthBlocked(USER);
  spy.setHandler("sessions", () => ({ error: null }));
  spy.setHandler("session_sets", () => ({ error: null }));
});

afterEach(() => signOut());

describe("AC-C5 flush order + batching", () => {
  it("sends sessions before sets, sets sorted by edited_at ascending", async () => {
    await upsertSession({
      id: "S1",
      started_at: "2026-09-28T09:00:00.000Z",
      time_budget_min: 45,
    } as never);
    const db = offlineDb();
    await db.sets.bulkPut([
      setRow({ clientId: "c-2", editedAt: "2026-09-28T10:02:00.000Z", key: `${USER}:c-2` }),
      setRow({ clientId: "c-1", editedAt: "2026-09-28T10:01:00.000Z", key: `${USER}:c-1` }),
    ]);

    await flush(USER);

    const sessionCallIndex = spy.calls.findIndex((c) => c.table === "sessions");
    const setCallIndex = spy.calls.findIndex((c) => c.table === "session_sets");
    expect(sessionCallIndex).toBeGreaterThanOrEqual(0);
    expect(sessionCallIndex).toBeLessThan(setCallIndex);

    const setCall = spy.calls.find((c) => c.table === "session_sets")!;
    expect(setCall.options?.onConflict).toBe("user_id,client_id");
    const rows = setCall.rows as Array<{ client_id: string }>;
    expect(rows.map((r) => r.client_id)).toEqual(["c-1", "c-2"]);
  });

  it("sends 250 queued sets in batches of 100, 100 and 50", async () => {
    const db = offlineDb();
    const rows = Array.from({ length: 250 }, (_, i) =>
      setRow({
        clientId: `c-${i}`,
        key: `${USER}:c-${i}`,
        editedAt: new Date(2026, 8, 28, 10, 0, i).toISOString(),
      }),
    );
    await db.sets.bulkPut(rows);

    await flush(USER);

    const setCalls = spy.calls.filter((c) => c.table === "session_sets");
    expect(setCalls).toHaveLength(3);
    expect(setCalls.map((c) => c.rows.length)).toEqual([100, 100, 50]);
  });
});

describe("AC-C6 in-flight edit survives", () => {
  it("keeps the newer edit queued even though the older edited_at synced successfully", async () => {
    const db = offlineDb();
    await db.sets.put(setRow({ editedAt: "2026-09-28T10:03:00.000Z" }));

    let resolveUpsert!: (v: { error: null }) => void;
    spy.setHandler(
      "session_sets",
      () =>
        new Promise((resolve) => {
          resolveUpsert = resolve;
        }),
    );

    const flushPromise = flush(USER);
    // Simulate an edit landing before the in-flight request resolves.
    await editSet("c-1", { reps: 9 }, { now: new Date("2026-09-28T10:04:00.000Z") });
    resolveUpsert({ error: null });
    await flushPromise;

    const remaining = await db.sets.get(`${USER}:c-1`);
    expect(remaining?.editedAt).toBe("2026-09-28T10:04:00.000Z");

    spy.calls.length = 0;
    spy.setHandler("session_sets", () => ({ error: null }));
    await flush(USER);
    const setCall = spy.calls.find((c) => c.table === "session_sets");
    expect(setCall).toBeDefined();
  });
});

describe("AC-C7 FK not yet there", () => {
  it("a 23503 keeps every entry in the batch; the next flush sends sessions first again", async () => {
    const db = offlineDb();
    await db.sets.put(setRow());
    spy.setHandler("session_sets", () => ({ error: { code: "23503", message: "fk" } }));

    await flush(USER);

    const remaining = await db.sets.get(`${USER}:c-1`);
    expect(remaining).toBeDefined();

    spy.calls.length = 0;
    await upsertSession({
      id: "S1",
      started_at: "2026-09-28T09:00:00.000Z",
      time_budget_min: 45,
    } as never);
    spy.setHandler("session_sets", () => ({ error: null }));
    await flush(USER);
    expect(spy.calls[0]!.table).toBe("sessions");
  });
});

describe("AC-C8 token expiry", () => {
  it("a 401 keeps the queue and blocks retries until SIGNED_IN/TOKEN_REFRESHED", async () => {
    const db = offlineDb();
    await db.sets.put(setRow());
    spy.setHandler("session_sets", () => ({
      error: { code: "PGRST301", message: "jwt" },
      status: 401,
    }));

    await flush(USER);
    expect(await db.sets.count()).toBe(1);

    spy.calls.length = 0;
    const outcome = await flush(USER);
    expect(outcome).toBe("blocked-auth");
    expect(spy.calls).toHaveLength(0);

    clearAuthBlocked(USER);
    spy.setHandler("session_sets", () => ({ error: null }));
    const outcome2 = await flush(USER);
    expect(outcome2).toBe("flushed");
    expect(await db.sets.count()).toBe(0);
  });
});

describe("AC-C9 ten days offline", () => {
  it("keeps 40 sets queued with no TTL and flushes all of them", async () => {
    const db = offlineDb();
    const rows = Array.from({ length: 40 }, (_, i) =>
      setRow({
        clientId: `old-${i}`,
        key: `${USER}:old-${i}`,
        completedAt: "2026-09-18T10:00:00.000Z",
        editedAt: "2026-09-18T10:00:00.000Z",
      }),
    );
    await db.sets.bulkPut(rows);

    expect(await db.sets.count()).toBe(40);
    await flush(USER);
    expect(await db.sets.count()).toBe(0);
  });
});

describe("AC-C11 rejected row kept", () => {
  it("keeps rows 1 and 3, marks row 2 rejected, and excludes it from later flushes", async () => {
    const db = offlineDb();
    await db.sets.bulkPut([
      setRow({ clientId: "r1", key: `${USER}:r1`, editedAt: "2026-09-28T10:00:00.000Z" }),
      setRow({ clientId: "r2", key: `${USER}:r2`, editedAt: "2026-09-28T10:00:01.000Z" }),
      setRow({ clientId: "r3", key: `${USER}:r3`, editedAt: "2026-09-28T10:00:02.000Z" }),
    ]);

    let batchCall = 0;
    spy.setHandler("session_sets", (rows) => {
      batchCall += 1;
      if (batchCall === 1) {
        // Whole-batch failure.
        return { error: { code: "23514", message: "check" } };
      }
      const row = rows[0] as { client_id: string };
      if (row.client_id === "r2") return { error: { code: "23514", message: "check" } };
      return { error: null };
    });

    await flush(USER);

    const r1 = await db.sets.get(`${USER}:r1`);
    const r2 = await db.sets.get(`${USER}:r2`);
    const r3 = await db.sets.get(`${USER}:r3`);
    expect(r1).toBeUndefined();
    expect(r3).toBeUndefined();
    expect(r2?.status).toBe("rejected");

    spy.calls.length = 0;
    await flush(USER);
    const setCalls = spy.calls.filter((c) => c.table === "session_sets");
    expect(setCalls).toHaveLength(0);
  });
});
