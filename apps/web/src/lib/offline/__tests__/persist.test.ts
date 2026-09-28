// AC-C18: navigator.storage.persist() called once, on the first finished session; survives a
// simulated reload (the flag lives in IDB); no throw when navigator.storage is undefined.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { upsertSession } from "../queue.js";
import { offlineDb, resetOfflineDbForTest } from "../db.js";
import { freshOfflineDb, signIn, signOut } from "./test-helpers.js";

const USER = "11111111-1111-4111-8111-111111111111";

describe("ensurePersistentStorage via upsertSession (AC-C18)", () => {
  let dbName: string;
  let persistSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dbName = freshOfflineDb().name;
    signIn(USER);
    persistSpy = vi.fn().mockResolvedValue(true);
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: { persist: persistSpy },
    });
  });

  afterEach(() => {
    signOut();
    Reflect.deleteProperty(navigator, "storage");
  });

  it("calls persist() once on the first finished session", async () => {
    await upsertSession({
      id: "S1",
      started_at: "2026-09-28T09:00:00.000Z",
      ended_at: "2026-09-28T09:45:00.000Z",
      time_budget_min: 45,
    } as never);

    expect(persistSpy).toHaveBeenCalledTimes(1);
  });

  it("does not call persist() again for a second finished session, even after a reload", async () => {
    await upsertSession({
      id: "S1",
      started_at: "2026-09-28T09:00:00.000Z",
      ended_at: "2026-09-28T09:45:00.000Z",
      time_budget_min: 45,
    } as never);
    expect(persistSpy).toHaveBeenCalledTimes(1);

    // Simulate a reload: a fresh Dexie instance on the same database name.
    resetOfflineDbForTest(dbName);

    await upsertSession({
      id: "S2",
      started_at: "2026-09-28T11:00:00.000Z",
      ended_at: "2026-09-28T11:30:00.000Z",
      time_budget_min: 30,
    } as never);

    expect(persistSpy).toHaveBeenCalledTimes(1);
  });

  it("never throws when navigator.storage is undefined", async () => {
    Reflect.deleteProperty(navigator, "storage");
    await expect(
      upsertSession({
        id: "S3",
        started_at: "2026-09-28T09:00:00.000Z",
        ended_at: "2026-09-28T09:45:00.000Z",
        time_budget_min: 45,
      } as never),
    ).resolves.toBeDefined();
  });

  it("does not call persist() for a session still in progress (no ended_at)", async () => {
    await upsertSession({
      id: "S4",
      started_at: "2026-09-28T09:00:00.000Z",
      time_budget_min: 45,
    } as never);
    expect(persistSpy).not.toHaveBeenCalled();
  });
});

describe("offlineDb", () => {
  it("uses the DB_NAME constant by default", async () => {
    const db = offlineDb();
    expect(db.name).toBeTruthy();
  });
});
