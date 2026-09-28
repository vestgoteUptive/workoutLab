// AC-C17: a flush that sent >= 1 row triggers exactly one refetch each of history, targets,
// profile (and, in this implementation, library too — all read-side caches, D-0045 §6/§7). A
// flush with an empty queue triggers none.
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
vi.mock("../history.js", () => ({
  refreshHistory,
  refreshLibrary,
  refreshTargets,
  refreshProfile,
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
  });
});
