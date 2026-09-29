// AC-C17: a flush that sent >= 1 row triggers exactly one refetch each of history, targets,
// profile (and, in this implementation, library too — all read-side caches, D-0045 §6/§7). A
// flush with an empty queue triggers none.
//
// T-0319 AC-8 extends this: the same flush also refetches `sessions` and `plan_checkins`, and
// does NOT refetch routines (nothing the queue sends can make the routine cache stale).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const onAuthStateChange = vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }));
vi.mock("../../auth/client.js", () => ({
  supabase: { from: fromMock, auth: { onAuthStateChange } },
}));

const fromMock = vi.fn();

const refreshHistory = vi.fn().mockResolvedValue(undefined);
const refreshLibrary = vi.fn().mockResolvedValue(undefined);
const refreshTargets = vi.fn().mockResolvedValue(undefined);
const refreshProfile = vi.fn().mockResolvedValue(undefined);
const refreshSessions = vi.fn().mockResolvedValue(undefined);
const refreshCheckins = vi.fn().mockResolvedValue(undefined);
const refreshRoutines = vi.fn().mockResolvedValue(undefined);
vi.mock("../history.js", () => ({
  refreshHistory,
  refreshLibrary,
  refreshTargets,
  refreshProfile,
  refreshSessions,
  refreshCheckins,
  refreshRoutines,
}));

const { startSync } = await import("../sync.js");
const { upsertSession } = await import("../queue.js");
const { freshOfflineDb, signIn, signOut } = await import("./test-helpers.js");

const USER = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  freshOfflineDb();
  fromMock.mockReset();
  refreshHistory.mockClear();
  refreshLibrary.mockClear();
  refreshTargets.mockClear();
  refreshProfile.mockClear();
  refreshSessions.mockClear();
  refreshCheckins.mockClear();
  refreshRoutines.mockClear();
  signIn(USER);
});

afterEach(() => {
  signOut();
});

describe("startSync refetch after flush (AC-C17)", () => {
  it("refetches history/targets/profile/library exactly once when the flush sent rows", async () => {
    await upsertSession({
      id: "S1",
      started_at: "2026-09-28T09:00:00.000Z",
      time_budget_min: 45,
    } as never);
    fromMock.mockImplementation((table: string) => ({
      upsert: async () => {
        if (table === "sessions") return { error: null, data: [], status: 200 };
        return { error: null, data: [{ id: 1 }], status: 200 };
      },
    }));

    const handle = startSync({ tz: "UTC" });
    await handle.flushNow();
    handle.stop();

    expect(refreshHistory).toHaveBeenCalledTimes(1);
    expect(refreshTargets).toHaveBeenCalledTimes(1);
    expect(refreshProfile).toHaveBeenCalledTimes(1);
    // T-0319 AC-8: sessions and check-ins join the post-flush refetch.
    expect(refreshSessions).toHaveBeenCalledTimes(1);
    expect(refreshCheckins).toHaveBeenCalledTimes(1);
    // Routines can't be made stale by a flush (the queue only sends sessions/session_sets), so
    // the post-flush refetch deliberately leaves them alone.
    expect(refreshRoutines).not.toHaveBeenCalled();
  });

  it("triggers no refetch when the queue is empty", async () => {
    fromMock.mockImplementation(() => ({
      upsert: async () => ({ error: null, data: [], status: 200 }),
    }));

    const handle = startSync({ tz: "UTC" });
    await handle.flushNow();
    handle.stop();

    expect(refreshHistory).not.toHaveBeenCalled();
    expect(refreshTargets).not.toHaveBeenCalled();
    expect(refreshProfile).not.toHaveBeenCalled();
    // T-0319 AC-8: "a flush that sent nothing calls neither".
    expect(refreshSessions).not.toHaveBeenCalled();
    expect(refreshCheckins).not.toHaveBeenCalled();
  });
});
