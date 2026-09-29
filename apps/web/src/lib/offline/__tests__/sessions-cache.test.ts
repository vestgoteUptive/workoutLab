// T-0319 AC-3: the 56-local-day `sessions` window, and the queued row winning by id.
//
// Clock per the ticket: tz Europe/Stockholm, now 2026-09-27T12:00:00+02:00, so
// `windowStartInstant(now, tz, 56)` is 2026-08-03 00:00 local = 2026-08-02T22:00:00.000Z
// (today − 55). The two boundary rows straddle that instant by 30 minutes each way.
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
const USER_B = "bbbbbbbb-2222-4222-8222-222222222222";

const NOW = new Date("2026-09-27T10:00:00.000Z"); // 12:00 +02:00
const TZ = "Europe/Stockholm";
const WINDOW_START = "2026-08-02T22:00:00.000Z";

/** S1: comfortably inside the window (10 days ago — the "returning after 10 days off" case). */
const S1 = {
  id: "S1",
  started_at: "2026-09-17T09:00:00.000Z",
  ended_at: null,
  time_budget_min: 45,
  effort_rating: null,
  energy: "normal",
};
/** S2: 2026-08-03 00:30 local, the first day of the window. Included. */
const S2 = {
  id: "S2",
  started_at: "2026-08-02T22:30:00.000Z",
  ended_at: "2026-08-02T23:20:00.000Z",
  time_budget_min: 30,
  effort_rating: 3,
  energy: "low",
};
/** S3: 2026-08-02 23:30 local, one day earlier. Excluded — the server filter drops it. */
const S3 = {
  id: "S3",
  started_at: "2026-08-02T21:30:00.000Z",
  ended_at: null,
  time_budget_min: 30,
  effort_rating: null,
  energy: "normal",
};

beforeEach(() => {
  freshOfflineDb();
  signIn(USER_A);
  spy.reset();
});

afterEach(() => signOut());

describe("AC-3 refreshSessions window", () => {
  it("filters on started_at >= windowStartInstant(now, tz, 56)", async () => {
    spy.setRows("sessions", [S1, S2]);
    await refreshSessions(NOW, TZ);

    const call = spy.calls.find((c) => c.table === "sessions")!;
    expect(call.gte).toEqual(["started_at", WINDOW_START]);
  });

  it("caches only the rows the server returned (S1 and S2, not S3)", async () => {
    // The spy honours the filter the way PostgREST would: it returns what the server would send.
    spy.setRows("sessions", [S1, S2, S3].filter((s) => s.started_at >= WINDOW_START));
    await refreshSessions(NOW, TZ);

    expect((await loadSessions()).map((s) => s.id)).toEqual(["S2", "S1"]);
  });

  it("maps every field of a cached row", async () => {
    spy.setRows("sessions", [S2]);
    await refreshSessions(NOW, TZ);

    await expect(loadSessions()).resolves.toEqual([
      {
        id: "S2",
        startedAt: "2026-08-02T22:30:00.000Z",
        endedAt: "2026-08-02T23:20:00.000Z",
        timeBudgetMin: 30,
        effortRating: 3,
        energy: "low",
      },
    ]);
  });

  it("returns [] on a fresh database (zero history)", async () => {
    await expect(loadSessions()).resolves.toEqual([]);
  });
});

describe("AC-3 queued rows win, and sorting", () => {
  it("a queued S1 with ended_at and effort_rating 4 wins over the server S1", async () => {
    spy.setRows("sessions", [S1]);
    await refreshSessions(NOW, TZ);

    await upsertSession({
      id: "S1",
      started_at: S1.started_at,
      ended_at: "2026-09-17T10:05:00.000Z",
      time_budget_min: 45,
      effort_rating: 4,
      energy: "high",
    } as never);

    await expect(loadSessions()).resolves.toEqual([
      {
        id: "S1",
        startedAt: "2026-09-17T09:00:00.000Z",
        endedAt: "2026-09-17T10:05:00.000Z",
        timeBudgetMin: 45,
        effortRating: 4,
        energy: "high",
      },
    ]);
  });

  it("includes a queued-only S4 that was never flushed", async () => {
    spy.setRows("sessions", [S1]);
    await refreshSessions(NOW, TZ);

    await upsertSession({
      id: "S4",
      started_at: "2026-09-26T18:00:00.000Z",
      time_budget_min: 20,
      energy: "normal",
    } as never);

    const rows = await loadSessions();
    expect(rows.map((r) => r.id)).toEqual(["S1", "S4"]);
    expect(rows.find((r) => r.id === "S4")).toEqual({
      id: "S4",
      startedAt: "2026-09-26T18:00:00.000Z",
      endedAt: null,
      timeBudgetMin: 20,
      effortRating: null,
      energy: "normal",
    });
  });

  it("includes an already-flushed queued row (pending: false), so a just-finished session shows", async () => {
    // A successful flush keeps the row and only clears `pending` (D-0053 §7). Filtering on
    // `pending` here would hide the finish until the next refreshSessions.
    await upsertSession({
      id: "S5",
      started_at: "2026-09-25T09:00:00.000Z",
      ended_at: "2026-09-25T10:00:00.000Z",
      time_budget_min: 40,
      energy: "normal",
    } as never);
    await offlineDb().sessions.update("S5", { pending: false });
    expect((await offlineDb().sessions.get("S5"))?.pending).toBe(false);

    const rows = await loadSessions();
    expect(rows.map((r) => r.id)).toEqual(["S5"]);
    expect(rows[0]!.endedAt).toBe("2026-09-25T10:00:00.000Z");
  });

  it("sorts by startedAt, then id", async () => {
    spy.setRows("sessions", [
      { ...S1, id: "S-b", started_at: "2026-09-20T09:00:00.000Z" },
      { ...S1, id: "S-a", started_at: "2026-09-20T09:00:00.000Z" },
      { ...S1, id: "S-early", started_at: "2026-09-10T09:00:00.000Z" },
      { ...S1, id: "S-late", started_at: "2026-09-26T09:00:00.000Z" },
    ]);
    await refreshSessions(NOW, TZ);

    expect((await loadSessions()).map((s) => s.id)).toEqual([
      "S-early",
      "S-a",
      "S-b",
      "S-late",
    ]);
  });

  it("never lets a queued metadata edit un-finish a cached session (D-0053 §7)", async () => {
    // `upsertSession` guards `ended_at` once a session has been queued finished. If a future
    // refactor ever queued a bare `ended_at: null` edit, the cached finish is the fallback, so
    // UF-03.3/UF-06 still show the session as finished.
    spy.setRows("sessions", [
      { ...S1, ended_at: "2026-09-17T10:05:00.000Z", effort_rating: 5 },
    ]);
    await refreshSessions(NOW, TZ);

    await offlineDb().sessions.put({
      id: "S1",
      userId: USER_A,
      row: {
        id: "S1",
        started_at: S1.started_at,
        ended_at: null,
        time_budget_min: 45,
      } as never,
      finished: false,
      pending: true,
    });

    const rows = await loadSessions();
    expect(rows[0]!.endedAt).toBe("2026-09-17T10:05:00.000Z");
    expect(rows[0]!.effortRating).toBe(5);
  });
});

describe("AC-6/AC-7 for sessions", () => {
  it("a second refresh replaces, and a rejecting select keeps the previous rows", async () => {
    spy.setRows("sessions", [S1, S2]);
    await refreshSessions(NOW, TZ);
    expect(await loadSessions()).toHaveLength(2);

    spy.setRows("sessions", [S1]);
    await refreshSessions(NOW, TZ);
    expect((await loadSessions()).map((s) => s.id)).toEqual(["S1"]);

    spy.fail("sessions", { code: "PGRST301", message: "JWT expired" });
    await expect(refreshSessions(NOW, TZ)).rejects.toMatchObject({ code: "PGRST301" });
    expect((await loadSessions()).map((s) => s.id)).toEqual(["S1"]);
  });

  it("B never sees A's sessions, and B's refresh keeps A's rows", async () => {
    spy.setRows("sessions", [S1, S2]);
    await refreshSessions(NOW, TZ);

    signOut();
    signIn(USER_B);
    expect(await loadSessions()).toEqual([]);

    spy.setRows("sessions", []);
    await refreshSessions(NOW, TZ);

    signOut();
    signIn(USER_A);
    expect((await loadSessions()).map((s) => s.id)).toEqual(["S2", "S1"]);
  });

  it("returns [] when signed out", async () => {
    spy.setRows("sessions", [S1]);
    await refreshSessions(NOW, TZ);
    signOut();
    expect(await loadSessions()).toEqual([]);
  });
});
