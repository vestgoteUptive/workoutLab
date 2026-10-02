// T-0324 UF-03.3: the loadSessions merge of a cached and a queued row for the same id (D-0148).
//
// Setup per the ticket: the `sessions-cache.test.ts` harness (fake-indexeddb, the select-spy
// supabase mock, signIn(USER_A), refreshSessions(NOW, TZ) to fill the cache). S1 starts
// 2026-09-17T09:00:00.000Z with a 45-minute budget. Every case is IndexedDB only.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSelectSpy } from "./select-spy.js";

const spy = createSelectSpy();
vi.mock("../../auth/client.js", () => ({ supabase: { from: spy.from } }));

const { refreshSessions } = await import("../history.js");
const { loadSessions } = await import("../feature-loaders.js");
const { upsertSession } = await import("../queue.js");
const { offlineDb } = await import("../db.js");
const { freshOfflineDb, signIn, signOut } = await import("./test-helpers.js");

const USER_A = "aaaaaaaa-1111-4111-8111-111111111111";
const NOW = new Date("2026-09-27T10:00:00.000Z");
const TZ = "Europe/Stockholm";
const STARTED_AT = "2026-09-17T09:00:00.000Z";

const S1 = {
  id: "S1",
  started_at: STARTED_AT,
  ended_at: null as string | null,
  time_budget_min: 45,
  effort_rating: null as number | null,
  energy: "normal",
};

async function cacheS1(endedAt: string, effortRating: number | null): Promise<void> {
  spy.setRows("sessions", [{ ...S1, ended_at: endedAt, effort_rating: effortRating }]);
  await refreshSessions(NOW, TZ);
}

/** A queued S1 that was already finished and flushed (`finished: true`, `pending: false`). */
async function queueFlushedS1(endedAt: string, effortRating: number | null): Promise<void> {
  await offlineDb().sessions.put({
    id: "S1",
    userId: USER_A,
    row: {
      id: "S1",
      started_at: STARTED_AT,
      ended_at: endedAt,
      time_budget_min: 45,
      energy: "normal",
      effort_rating: effortRating,
    } as never,
    finished: true,
    pending: false,
  });
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
});

afterEach(() => signOut());

describe("AC-1 a present queued effort_rating key wins, null included (D-0148 §3)", () => {
  const END = "2026-09-17T10:05:00.000Z";

  it("an explicit null clears the cached rating 5", async () => {
    await cacheS1(END, 5);
    await upsertSession({
      id: "S1",
      started_at: STARTED_AT,
      ended_at: END,
      time_budget_min: 45,
      energy: "normal",
      effort_rating: null,
    });

    const s1 = await loadS1();
    expect(s1.effortRating).toBeNull();
    expect(s1.endedAt).toBe(END);
  });

  it("the pair: a queued value 2 replaces the cached 5", async () => {
    await cacheS1(END, 5);
    await upsertSession({
      id: "S1",
      started_at: STARTED_AT,
      ended_at: END,
      time_budget_min: 45,
      energy: "normal",
      effort_rating: 2,
    });

    const s1 = await loadS1();
    expect(s1.effortRating).toBe(2);
    expect(s1.endedAt).toBe(END);
  });

  it("the pair: an absent effort_rating key keeps the cached 5", async () => {
    await cacheS1(END, 5);
    await upsertSession({
      id: "S1",
      started_at: STARTED_AT,
      ended_at: END,
      time_budget_min: 45,
      energy: "normal",
    });

    const s1 = await loadS1();
    expect(s1.effortRating).toBe(5);
    expect(s1.endedAt).toBe(END);
  });
});

describe("AC-2 a strictly later cached finish wins whole (D-0148 §1 §2)", () => {
  it("cached 10:40 / null beats a queued 10:31 / 4 (another device finished later)", async () => {
    await cacheS1("2026-09-17T10:40:00.000Z", null);
    await queueFlushedS1("2026-09-17T10:31:00.000Z", 4);

    const s1 = await loadS1();
    expect(s1.endedAt).toBe("2026-09-17T10:40:00.000Z");
    expect(s1.effortRating).toBeNull();
  });

  it("the pair: a later queued 10:50 / 4 beats the cached 10:40 / null", async () => {
    await cacheS1("2026-09-17T10:40:00.000Z", null);
    await queueFlushedS1("2026-09-17T10:50:00.000Z", 4);

    const s1 = await loadS1();
    expect(s1.endedAt).toBe("2026-09-17T10:50:00.000Z");
    expect(s1.effortRating).toBe(4);
  });

  it("equal instants: the queued explicit null clears the cached 3", async () => {
    await cacheS1("2026-09-17T10:40:00.000Z", 3);
    await queueFlushedS1("2026-09-17T10:40:00.000Z", null);

    const s1 = await loadS1();
    expect(s1.endedAt).toBe("2026-09-17T10:40:00.000Z");
    expect(s1.effortRating).toBeNull();
  });

  it("equal instants, the pair: the queued 1 replaces the cached 3", async () => {
    await cacheS1("2026-09-17T10:40:00.000Z", 3);
    await queueFlushedS1("2026-09-17T10:40:00.000Z", 1);

    const s1 = await loadS1();
    expect(s1.endedAt).toBe("2026-09-17T10:40:00.000Z");
    expect(s1.effortRating).toBe(1);
  });

  it("a queued ended_at null with a present rating never un-finishes, and the cached finish keeps its rating", async () => {
    await cacheS1("2026-09-17T10:05:00.000Z", 5);
    await offlineDb().sessions.put({
      id: "S1",
      userId: USER_A,
      row: {
        id: "S1",
        started_at: STARTED_AT,
        ended_at: null,
        time_budget_min: 45,
        effort_rating: 2,
      } as never,
      finished: false,
      pending: true,
    });

    const s1 = await loadS1();
    expect(s1.endedAt).toBe("2026-09-17T10:05:00.000Z");
    expect(s1.effortRating).toBe(5);
  });
});

describe("AC-3 endedAt compares instants, not strings (D-0148 §1)", () => {
  it("cached 10:40+00:00 / 2 beats a queued 12:31+02:00 (10:31 UTC) / 4", async () => {
    await cacheS1("2026-09-17T10:40:00+00:00", 2);
    await queueFlushedS1("2026-09-17T12:31:00+02:00", 4);

    const s1 = await loadS1();
    expect(s1.endedAt).toBe("2026-09-17T10:40:00+00:00");
    expect(s1.effortRating).toBe(2);
  });

  it("the pair: a queued 12:50+02:00 (10:50 UTC) / 4 beats the cached 10:40+00:00", async () => {
    await cacheS1("2026-09-17T10:40:00+00:00", 2);
    await queueFlushedS1("2026-09-17T12:50:00+02:00", 4);

    const s1 = await loadS1();
    expect(s1.endedAt).toBe("2026-09-17T12:50:00+02:00");
    expect(s1.effortRating).toBe(4);
  });
});

describe("AC-4 an unparsable endedAt (D-0148 §1)", () => {
  it('a queued "not-a-date" wins over a valid cached instant, without throwing', async () => {
    await cacheS1("2026-09-17T10:40:00.000Z", 2);
    await queueFlushedS1("not-a-date", 4);

    const s1 = await loadS1();
    expect(s1.endedAt).toBe("not-a-date");
    expect(s1.effortRating).toBe(4);
  });

  it("the pair: a valid later queued instant wins", async () => {
    await cacheS1("2026-09-17T10:40:00.000Z", 2);
    await queueFlushedS1("2026-09-17T10:45:00.000Z", 4);

    const s1 = await loadS1();
    expect(s1.endedAt).toBe("2026-09-17T10:45:00.000Z");
    expect(s1.effortRating).toBe(4);
  });
});

describe("AC-5 unchanged behaviour (D-0148 §4 §5)", () => {
  it("a queued-only S9 with an explicit null rating and no cached row is used as is", async () => {
    await upsertSession({
      id: "S9",
      started_at: "2026-09-26T09:00:00.000Z",
      time_budget_min: 30,
      effort_rating: null,
    });

    await expect(loadSessions()).resolves.toEqual([
      {
        id: "S9",
        startedAt: "2026-09-26T09:00:00.000Z",
        endedAt: null,
        timeBudgetMin: 30,
        effortRating: null,
        energy: "normal",
      },
    ]);
  });

  it("a queued-only row with a rating keeps it (no cached row to fall back to)", async () => {
    await upsertSession({
      id: "S9",
      started_at: "2026-09-26T09:00:00.000Z",
      ended_at: "2026-09-26T09:40:00.000Z",
      time_budget_min: 30,
      effort_rating: 3,
    });

    const rows = await loadSessions();
    expect(rows[0]!.effortRating).toBe(3);
    expect(rows[0]!.endedAt).toBe("2026-09-26T09:40:00.000Z");
  });

  it("energy keeps the cached high when the queued row omits it, and a present energy wins", async () => {
    spy.setRows("sessions", [
      { ...S1, energy: "high" },
      { ...S1, id: "S2", started_at: "2026-09-18T09:00:00.000Z", energy: "high" },
    ]);
    await refreshSessions(NOW, TZ);
    await upsertSession({ id: "S1", started_at: STARTED_AT, time_budget_min: 45 });
    await upsertSession({
      id: "S2",
      started_at: "2026-09-18T09:00:00.000Z",
      time_budget_min: 45,
      energy: "low",
    });

    const rows = await loadSessions();
    expect(rows.map((r) => [r.id, r.energy])).toEqual([
      ["S1", "high"],
      ["S2", "low"],
    ]);
  });

  it("sorts merged rows by startedAt, then id", async () => {
    spy.setRows("sessions", [
      {
        ...S1,
        id: "S-b",
        started_at: "2026-09-20T09:00:00.000Z",
        ended_at: "2026-09-20T10:00:00.000Z",
      },
      { ...S1, id: "S-late", started_at: "2026-09-26T09:00:00.000Z" },
    ]);
    await refreshSessions(NOW, TZ);
    await upsertSession({
      id: "S-b",
      started_at: "2026-09-20T09:00:00.000Z",
      ended_at: "2026-09-20T09:50:00.000Z",
      time_budget_min: 45,
      effort_rating: 4,
    });
    await upsertSession({ id: "S-a", started_at: "2026-09-20T09:00:00.000Z", time_budget_min: 30 });

    const rows = await loadSessions();
    expect(rows.map((r) => r.id)).toEqual(["S-a", "S-b", "S-late"]);
    // The cached S-b finish (10:00) is later than the queued 09:50, so it wins whole.
    expect(rows[1]).toMatchObject({ endedAt: "2026-09-20T10:00:00.000Z", effortRating: null });
  });
});
