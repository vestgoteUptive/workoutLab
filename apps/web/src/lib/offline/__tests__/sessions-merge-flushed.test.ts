// T-0431 UF-03.3: a flushed queued session row defers to a cache refreshed after its flush, and an
// absent queued `ended_at` key has no say in the finish (D-0151, amends D-0148).
//
// Setup per the ticket: the `sessions-merge.test.ts` harness (fake-indexeddb, the select-spy
// supabase mock, signIn(USER_A)), NOW 2026-09-27T10:00:00.000Z, TZ Europe/Stockholm. S1 starts
// 2026-09-17T09:00:00.000Z with a 45-minute budget. "Flush S1" calls the real `flush` with an
// upsert stub, so the entry is written exactly as the flush writes it. "A refresh" is
// `spy.setRows("sessions", […])` + `refreshSessions(NOW, TZ)`.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSelectSpy } from "./select-spy.js";

const spy = createSelectSpy();
const upsert = vi.fn(async () => ({ error: null, status: 201 }));
// The select spy plus an `upsert` stub, so the real `flush` can write the `pending: false` entry.
vi.mock("../../auth/client.js", () => ({
  supabase: { from: (table: string) => ({ ...spy.from(table), upsert }) },
}));

const { refreshSessions } = await import("../history.js");
const { loadSessions } = await import("../feature-loaders.js");
const { upsertSession, syncStatus } = await import("../queue.js");
const { flush } = await import("../flush.js");
const { offlineDb } = await import("../db.js");
const { freshOfflineDb, signIn, signOut } = await import("./test-helpers.js");

const USER_A = "aaaaaaaa-1111-4111-8111-111111111111";
const USER_B = "bbbbbbbb-2222-4222-8222-222222222222";
const NOW = new Date("2026-09-27T10:00:00.000Z");
const TZ = "Europe/Stockholm";
const STARTED_AT = "2026-09-17T09:00:00.000Z";
const E = "2026-09-17T10:40:00.000Z";

const S1 = {
  id: "S1",
  started_at: STARTED_AT,
  ended_at: null as string | null,
  time_budget_min: 45,
  effort_rating: null as number | null,
  energy: "normal",
};

function s1Row(endedAt: string | null, effortRating: number | null) {
  return {
    id: "S1",
    started_at: STARTED_AT,
    ended_at: endedAt,
    time_budget_min: 45,
    energy: "normal",
    effort_rating: effortRating,
  };
}

/** A refresh whose server row for S1 is `{...S1, ...fields}`. */
async function refreshS1(fields: Partial<typeof S1>): Promise<void> {
  spy.setRows("sessions", [{ ...S1, ...fields }]);
  await refreshSessions(NOW, TZ);
}

async function flushA(): Promise<void> {
  await expect(flush(USER_A)).resolves.toBe("flushed");
}

/** Queues S1 at `endedAt` / `effortRating` through `upsertSession`, then flushes it. */
async function queueAndFlushS1(endedAt: string, effortRating: number | null): Promise<void> {
  await upsertSession(s1Row(endedAt, effortRating));
  await flushA();
}

async function entryS1() {
  const entry = await offlineDb().sessions.get("S1");
  expect(entry).toBeDefined();
  return entry!;
}

async function loadS1() {
  const rows = await loadSessions();
  expect(rows.map((r) => r.id)).toEqual(["S1"]);
  return rows[0]!;
}

beforeEach(() => {
  freshOfflineDb();
  signIn(USER_A);
  spy.reset();
  upsert.mockClear();
});

afterEach(() => signOut());

describe("AC-1 a flushed, then refreshed entry defers to the cache (D-0151 §2 §4)", () => {
  it("a refresh at E / null clears the flushed 3, and marks the entry", async () => {
    await queueAndFlushS1(E, 3);
    expect(await entryS1()).toMatchObject({ pending: false });
    expect(Object.hasOwn(await entryS1(), "cacheCurrent")).toBe(false);

    await refreshS1({ ended_at: E, effort_rating: null });

    const s1 = await loadS1();
    expect(s1.endedAt).toBe(E);
    expect(s1.effortRating).toBeNull();
    expect((await entryS1()).cacheCurrent).toBe(true);
  });

  it("the pair: a refresh at E / 5 gives 5", async () => {
    await queueAndFlushS1(E, 3);
    await refreshS1({ ended_at: E, effort_rating: 5 });

    const s1 = await loadS1();
    expect(s1.endedAt).toBe(E);
    expect(s1.effortRating).toBe(5);
    expect((await entryS1()).cacheCurrent).toBe(true);
  });

  it("other fields: energy, time budget and start come from the cached row", async () => {
    await queueAndFlushS1(E, 3);
    await refreshS1({
      ended_at: E,
      effort_rating: 3,
      energy: "high",
      time_budget_min: 30,
      started_at: "2026-09-17T09:01:00.000Z",
    });

    await expect(loadSessions()).resolves.toEqual([
      {
        id: "S1",
        startedAt: "2026-09-17T09:01:00.000Z",
        endedAt: E,
        timeBudgetMin: 30,
        effortRating: 3,
        energy: "high",
      },
    ]);
  });
});

describe("AC-2 a cache older than the flush doesn't win (D-0151 §5)", () => {
  it("a refresh at E / 3, then a flushed entry at E / null written after it, gives null", async () => {
    await refreshS1({ ended_at: E, effort_rating: 3 });
    await queueAndFlushS1(E, null);

    const entry = await entryS1();
    expect(entry.pending).toBe(false);
    expect(Object.hasOwn(entry, "cacheCurrent")).toBe(false);
    expect((await loadS1()).effortRating).toBeNull();
  });

  for (const saved of [null, 4] as const) {
    it(`the T-0420 sequence with a saved ${String(saved)}: the Save wins while pending, after its flush, and after the next refresh`, async () => {
      await queueAndFlushS1(E, 3);
      await refreshS1({ ended_at: E, effort_rating: 3 });
      expect((await entryS1()).cacheCurrent).toBe(true);

      // UF-03.3 Save: re-sends the stored row with the same ended_at and a new or cleared rating.
      const stored = await entryS1();
      await upsertSession({ ...stored.row, effort_rating: saved });
      let entry = await entryS1();
      expect(entry.pending).toBe(true);
      expect(Object.hasOwn(entry, "cacheCurrent")).toBe(false);
      expect((await loadS1()).effortRating).toBe(saved);

      await flushA();
      entry = await entryS1();
      expect(entry.pending).toBe(false);
      expect(Object.hasOwn(entry, "cacheCurrent")).toBe(false);
      const afterFlush = await loadS1();
      expect(afterFlush.effortRating).toBe(saved);
      expect(afterFlush.endedAt).toBe(E);

      // The server now holds the saved rating.
      await refreshS1({ ended_at: E, effort_rating: saved });
      expect((await entryS1()).cacheCurrent).toBe(true);
      expect((await loadS1()).effortRating).toBe(saved);
    });
  }

  it("an older build: a pending:false entry without the field keeps its own value (D-0148 §3)", async () => {
    await refreshS1({ ended_at: E, effort_rating: 5 });
    await offlineDb().sessions.put({
      id: "S1",
      userId: USER_A,
      row: s1Row(E, 3) as never,
      finished: true,
      pending: false,
    });

    expect((await loadS1()).effortRating).toBe(3);
  });
});

describe("AC-3 a finish never disappears under the mark (D-0151 §4, D-0053 §7)", () => {
  it("a refresh with ended_at null / 2 gives endedAt E and the cached 2", async () => {
    await queueAndFlushS1(E, 3);
    await refreshS1({ ended_at: null, effort_rating: 2 });

    const s1 = await loadS1();
    expect(s1.endedAt).toBe(E);
    expect(s1.effortRating).toBe(2);
  });

  it("the pair: a refresh at 10:50 / 2 gives endedAt 10:50 and 2", async () => {
    await queueAndFlushS1(E, 3);
    await refreshS1({ ended_at: "2026-09-17T10:50:00.000Z", effort_rating: 2 });

    const s1 = await loadS1();
    expect(s1.endedAt).toBe("2026-09-17T10:50:00.000Z");
    expect(s1.effortRating).toBe(2);
  });
});

describe("AC-4 the scope of the mark (D-0151 §2 §3)", () => {
  it("a failed refresh marks nothing and the loader stays at 3", async () => {
    await refreshS1({ ended_at: E, effort_rating: null });
    await queueAndFlushS1(E, 3);
    spy.fail("sessions", { code: "08006", message: "offline" });

    await expect(refreshSessions(NOW, TZ)).rejects.toMatchObject({ code: "08006" });

    expect(Object.hasOwn(await entryS1(), "cacheCurrent")).toBe(false);
    expect((await loadS1()).effortRating).toBe(3);
  });

  it("the pair: the same refresh succeeding marks the entry and gives null", async () => {
    await refreshS1({ ended_at: E, effort_rating: null });
    await queueAndFlushS1(E, 3);

    await refreshS1({ ended_at: E, effort_rating: null });

    expect((await entryS1()).cacheCurrent).toBe(true);
    expect((await loadS1()).effortRating).toBeNull();
  });

  it("a pending entry is never marked, and keeps its 3 (D-0148 §3)", async () => {
    await upsertSession(s1Row(E, 3));
    await refreshS1({ ended_at: E, effort_rating: null });

    const entry = await entryS1();
    expect(entry.pending).toBe(true);
    expect(Object.hasOwn(entry, "cacheCurrent")).toBe(false);
    expect((await loadS1()).effortRating).toBe(3);
  });

  it("an entry pending at the snapshot and flushed during the request is not marked", async () => {
    await upsertSession(s1Row(E, 3));
    spy.setRows("sessions", [{ ...S1, ended_at: E, effort_rating: null }]);
    spy.hold("sessions");
    const refreshing = refreshSessions(NOW, TZ);
    await vi.waitFor(() => expect(spy.countFor("sessions")).toBe(1));

    await flushA();
    spy.release("sessions");
    await refreshing;

    const entry = await entryS1();
    expect(entry.pending).toBe(false);
    expect(Object.hasOwn(entry, "cacheCurrent")).toBe(false);
    expect((await loadS1()).effortRating).toBe(3);
  });

  it("re-queued during the request: pending, unmarked, loader 4", async () => {
    await queueAndFlushS1(E, 3);
    spy.setRows("sessions", [{ ...S1, ended_at: E, effort_rating: 3 }]);
    spy.hold("sessions");
    const refreshing = refreshSessions(NOW, TZ);
    await vi.waitFor(() => expect(spy.countFor("sessions")).toBe(1));

    await upsertSession(s1Row(E, 4));
    spy.release("sessions");
    await refreshing;

    const entry = await entryS1();
    expect(entry.pending).toBe(true);
    expect(Object.hasOwn(entry, "cacheCurrent")).toBe(false);
    expect((await loadS1()).effortRating).toBe(4);
  });

  it("re-queued and flushed during the request: pending:false, unmarked, loader 4 (the structural compare)", async () => {
    await queueAndFlushS1(E, 3);
    spy.setRows("sessions", [{ ...S1, ended_at: E, effort_rating: 3 }]);
    spy.hold("sessions");
    const refreshing = refreshSessions(NOW, TZ);
    await vi.waitFor(() => expect(spy.countFor("sessions")).toBe(1));

    await upsertSession(s1Row(E, 4));
    await flushA();
    spy.release("sessions");
    await refreshing;

    const entry = await entryS1();
    expect(entry.pending).toBe(false);
    expect(Object.hasOwn(entry, "cacheCurrent")).toBe(false);
    expect((await loadS1()).effortRating).toBe(4);
  });

  it("the pair: unchanged during a held request, the entry is marked", async () => {
    await queueAndFlushS1(E, 3);
    spy.setRows("sessions", [{ ...S1, ended_at: E, effort_rating: null }]);
    spy.hold("sessions");
    const refreshing = refreshSessions(NOW, TZ);
    await vi.waitFor(() => expect(spy.countFor("sessions")).toBe(1));
    spy.release("sessions");
    await refreshing;

    expect((await entryS1()).cacheCurrent).toBe(true);
    expect((await loadS1()).effortRating).toBeNull();
  });

  it("another user: USER_B's flushed S1-B is untouched by USER_A's refresh, USER_A's S1 is marked", async () => {
    await offlineDb().sessions.put({
      id: "S1-B",
      userId: USER_B,
      row: { ...s1Row(E, 3), id: "S1-B" } as never,
      finished: true,
      pending: false,
    });
    await queueAndFlushS1(E, 3);
    spy.setRows("sessions", [
      { ...S1, ended_at: E, effort_rating: null },
      { ...S1, id: "S1-B", ended_at: E, effort_rating: null },
    ]);
    await refreshSessions(NOW, TZ);

    const b = await offlineDb().sessions.get("S1-B");
    expect(b).toEqual({
      id: "S1-B",
      userId: USER_B,
      row: { ...s1Row(E, 3), id: "S1-B" },
      finished: true,
      pending: false,
    });
    expect((await entryS1()).cacheCurrent).toBe(true);
  });

  it("no cached row: a marked entry whose id the refresh didn't return is used as is (D-0148 §5)", async () => {
    await queueAndFlushS1(E, 3);
    spy.setRows("sessions", []);
    await refreshSessions(NOW, TZ);

    expect((await entryS1()).cacheCurrent).toBe(true);
    const s1 = await loadS1();
    expect(s1.endedAt).toBe(E);
    expect(s1.effortRating).toBe(3);
  });
});

describe("AC-5 an absent queued ended_at key (D-0151 §6)", () => {
  async function queueS1Without(keys: Array<"ended_at" | "effort_rating">, rating = 2) {
    const row: Record<string, unknown> = s1Row(null, rating);
    for (const k of keys) delete row[k];
    await offlineDb().sessions.put({
      id: "S1",
      userId: USER_A,
      row: row as never,
      finished: false,
      pending: true,
    });
  }

  it("absent ended_at with effort_rating 2 gives the cached 10:05 and 2", async () => {
    await refreshS1({ ended_at: "2026-09-17T10:05:00.000Z", effort_rating: 5 });
    await queueS1Without(["ended_at"]);

    const s1 = await loadS1();
    expect(s1.endedAt).toBe("2026-09-17T10:05:00.000Z");
    expect(s1.effortRating).toBe(2);
  });

  it("the pair: an explicit ended_at null gives 10:05 / 5 (D-0148 §2)", async () => {
    await refreshS1({ ended_at: "2026-09-17T10:05:00.000Z", effort_rating: 5 });
    await queueS1Without([]);

    const s1 = await loadS1();
    expect(s1.endedAt).toBe("2026-09-17T10:05:00.000Z");
    expect(s1.effortRating).toBe(5);
  });

  it("both keys absent give 10:05 / 5", async () => {
    await refreshS1({ ended_at: "2026-09-17T10:05:00.000Z", effort_rating: 5 });
    await queueS1Without(["ended_at", "effort_rating"]);

    const s1 = await loadS1();
    expect(s1.endedAt).toBe("2026-09-17T10:05:00.000Z");
    expect(s1.effortRating).toBe(5);
  });

  it("no cached row: absent ended_at with effort_rating 2 gives null / 2", async () => {
    await queueS1Without(["ended_at"]);

    const s1 = await loadS1();
    expect(s1.endedAt).toBeNull();
    expect(s1.effortRating).toBe(2);
  });
});

describe("rework: each refresh recomputes the marks, so concurrent refreshes can't leave a stale one (D-0151 §1 §2)", () => {
  /** Finish S1 at E / null and flush it, start refresh A (cache E / null) and hold it, then Save
   *  4 and flush it, and start refresh B (cache E / 4) on its own gate. */
  async function startAThenSaveThenStartB() {
    await queueAndFlushS1(E, null);

    spy.setRows("sessions", [{ ...S1, ended_at: E, effort_rating: null }]);
    const releaseA = spy.hold("sessions");
    const refreshA = refreshSessions(NOW, TZ);
    await vi.waitFor(() => expect(spy.countFor("sessions")).toBe(1));

    // UF-03.3 Save, then its flush.
    await upsertSession({ ...(await entryS1()).row, effort_rating: 4 });
    await flushA();

    spy.setRows("sessions", [{ ...S1, ended_at: E, effort_rating: 4 }]);
    const releaseB = spy.hold("sessions");
    const refreshB = refreshSessions(NOW, TZ);
    await vi.waitFor(() => expect(spy.countFor("sessions")).toBe(2));
    return { releaseA, refreshA, releaseB, refreshB };
  }

  it("(a) the older refresh A lands last: B's mark is cleared and the saved 4 still shows", async () => {
    const { releaseA, refreshA, releaseB, refreshB } = await startAThenSaveThenStartB();

    releaseB();
    await refreshB;
    expect((await entryS1()).cacheCurrent).toBe(true);
    expect((await loadS1()).effortRating).toBe(4);

    releaseA();
    await refreshA;
    const s1 = await loadS1();
    expect(s1.endedAt).toBe(E);
    expect(s1.effortRating).toBe(4);
    const entry = await entryS1();
    expect(entry.pending).toBe(false);
    expect(Object.hasOwn(entry, "cacheCurrent")).toBe(false);
  });

  it("(b) the pair: A lands first, then B; the rating is 4 and the entry is marked", async () => {
    const { releaseA, refreshA, releaseB, refreshB } = await startAThenSaveThenStartB();

    releaseA();
    await refreshA;
    expect(Object.hasOwn(await entryS1(), "cacheCurrent")).toBe(false);
    expect((await loadS1()).effortRating).toBe(4);

    releaseB();
    await refreshB;
    expect((await entryS1()).cacheCurrent).toBe(true);
    expect((await loadS1()).effortRating).toBe(4);
  });

  it("(c) a stale mark is cleared by a refresh whose snapshot doesn't match the entry", async () => {
    // A mark on an entry that no longer passes the compare: pending again (not reachable through
    // upsertSession, which writes a fresh entry, but a mark this refresh didn't earn all the same).
    await offlineDb().sessions.put({
      id: "S1",
      userId: USER_A,
      row: s1Row(E, 3) as never,
      finished: true,
      pending: true,
      cacheCurrent: true,
    });
    await refreshS1({ ended_at: E, effort_rating: null });

    expect(Object.hasOwn(await entryS1(), "cacheCurrent")).toBe(false);
    expect((await loadS1()).effortRating).toBe(3);
  });

  it("(c) the pair: a matching snapshot keeps the mark, and other users' marks are untouched", async () => {
    await offlineDb().sessions.put({
      id: "S1-B",
      userId: USER_B,
      row: { ...s1Row(E, 3), id: "S1-B" } as never,
      finished: true,
      pending: true,
      cacheCurrent: true,
    });
    await queueAndFlushS1(E, 3);
    await refreshS1({ ended_at: E, effort_rating: null });
    await refreshS1({ ended_at: E, effort_rating: null });

    expect((await entryS1()).cacheCurrent).toBe(true);
    expect((await loadS1()).effortRating).toBeNull();
    expect((await offlineDb().sessions.get("S1-B"))?.cacheCurrent).toBe(true);
  });
});

describe("AC-6 syncStatus counts only pending:true entries, marked or not", () => {
  it("a marked flushed entry is not counted", async () => {
    await queueAndFlushS1(E, 3);
    await refreshS1({ ended_at: E, effort_rating: 3 });
    expect((await entryS1()).cacheCurrent).toBe(true);

    expect((await syncStatus()).sessions).toBe(0);
  });

  it("the pair: a pending entry is counted, with or without the field", async () => {
    await upsertSession(s1Row(E, 3));
    await refreshS1({ ended_at: E, effort_rating: 3 });
    expect((await syncStatus()).sessions).toBe(1);

    await offlineDb().sessions.put({ ...(await entryS1()), cacheCurrent: true });
    expect((await syncStatus()).sessions).toBe(1);
  });
});
