// T-0310c AC8 (D-0136 §5, NFR-PRIV-5, NFR-OFF-4): the wipe on a device shared by two users.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Table } from "dexie";
import type { OfflineDb } from "../../offline/db.js";
import { freshOfflineDb } from "../../offline/__tests__/test-helpers.js";
import { wipeLocalUserData } from "../index.js";
import { U, V } from "./fixtures.js";
import { OFFLINE_TABLES, countFor, seedBothUsers } from "./dexie-seed.js";

let db: OfflineDb;

beforeEach(() => {
  db = freshOfflineDb();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("T-0310c AC8 the wipe, two users on one device", () => {
  it("T-0310c AC8 the table list is the 12 tables of offlineDb() (a new table must be added here)", () => {
    expect(db.tables.map((t) => t.name).sort()).toEqual([...OFFLINE_TABLES].sort());
  });

  it("T-0310c AC8 removes every U row and every wl- key; V's rows and other keys stay", async () => {
    await seedBothUsers(db);
    for (const t of OFFLINE_TABLES) {
      expect(await countFor(db, t, U), `${t} seeded U`).toBe(1);
      expect(await countFor(db, t, V), `${t} seeded V`).toBe(1);
    }
    expect(await db.sets.where("[userId+status]").equals([U, "rejected"]).count()).toBe(1);
    window.localStorage.setItem("wl-last-email", "u@test.local");
    window.localStorage.setItem("wl-onboarding", "{}");
    window.localStorage.setItem("wl-focus-prefs", "{}");
    window.localStorage.setItem("other-app", "keep");
    window.sessionStorage.setItem("wl-return-to", "/plan");
    window.sessionStorage.setItem("other-tab", "keep");

    await wipeLocalUserData(U, { db });

    for (const t of OFFLINE_TABLES) {
      expect(await countFor(db, t, U), `${t} U`).toBe(0);
      expect(await countFor(db, t, V), `${t} V`).toBe(1);
      expect(await db.table(t).count(), `${t} total`).toBe(1);
    }
    for (const k of ["wl-last-email", "wl-onboarding", "wl-focus-prefs"]) {
      expect(window.localStorage.getItem(k), k).toBeNull();
    }
    expect(window.sessionStorage.getItem("wl-return-to")).toBeNull();
    expect(window.localStorage.getItem("other-app")).toBe("keep");
    expect(window.sessionStorage.getItem("other-tab")).toBe("keep");
  });

  it("T-0310c AC8 runs in one rw transaction over every table", async () => {
    const spy = vi.spyOn(db, "transaction");
    await wipeLocalUserData(U, { db });
    expect(spy).toHaveBeenCalledTimes(1);
    const [mode, tables] = spy.mock.calls[0] as unknown as [string, Table[]];
    expect(mode).toBe("rw");
    expect(tables.map((t) => t.name).sort()).toEqual([...OFFLINE_TABLES].sort());
  });

  it("T-0310c AC8 a rerun on an already-wiped user resolves", async () => {
    await seedBothUsers(db);
    await wipeLocalUserData(U, { db });
    await expect(wipeLocalUserData(U, { db })).resolves.toBeUndefined();
    for (const t of OFFLINE_TABLES) expect(await countFor(db, t, V), t).toBe(1);
  });

  it("T-0310c AC8 a failing table rejects, rolls the Dexie part back, and still clears wl- keys", async () => {
    await seedBothUsers(db);
    window.localStorage.setItem("wl-onboarding", "{}");
    // `db.table(name)` is the instance `db.tables` hands the transaction (not `db.profileCache`).
    vi.spyOn(db.table("profileCache"), "delete").mockImplementation(() => {
      throw new Error("idb boom");
    });
    await expect(wipeLocalUserData(U, { db })).rejects.toThrow("idb boom");
    // One transaction: nothing of U's was half-deleted.
    for (const t of OFFLINE_TABLES) expect(await countFor(db, t, U), t).toBe(1);
    expect(window.localStorage.getItem("wl-onboarding")).toBeNull();
  });
});
