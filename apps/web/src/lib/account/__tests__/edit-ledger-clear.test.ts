// T-1007 AC10: sign-out and account deletion empty this user's edit ledger (dirty entries
// included, no confirm) and leave another user's entries on the device alone.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { OfflineDb } from "../../offline/db.js";
import { freshOfflineDb } from "../../offline/__tests__/test-helpers.js";
import { signOutAndClearDevice, wipeLocalUserData } from "../index.js";
import type { AccountClient } from "../deps.js";
import { U, V } from "./fixtures.js";

let db: OfflineDb;
beforeEach(() => {
  db = freshOfflineDb();
});
afterEach(() => {
  window.localStorage.clear();
});

const entry = (userId: string) => ({
  key: `${userId}:removal:X`,
  userId,
  ledgerKey: "removal:X",
  kind: "removal" as const,
  exerciseId: "X",
  toExerciseId: null,
  count: 2,
  windowStart: "2026-01-01T00:00:00.000Z",
  lastSeen: "2026-01-02T00:00:00.000Z",
  askedAt: null,
  dirty: true,
  visits: ["v1", "v2"],
});
async function seed() {
  for (const u of [U, V]) {
    await db.editLedger.put(entry(u));
    await db.editLedgerMeta.put({ userId: u, deviceId: `dev-${u}` });
  }
}
async function expectOnlyV() {
  expect((await db.editLedger.toArray()).map((r) => r.userId)).toEqual([V]);
  expect((await db.editLedgerMeta.toArray()).map((r) => r.userId)).toEqual([V]);
}

describe("T-1007 AC10 clearing", () => {
  it("sign-out drops this user's dirty entries and device id, not another user's", async () => {
    await seed();
    const client = {
      auth: { signOut: async () => ({ error: null }) },
    } as unknown as AccountClient;
    const r = await signOutAndClearDevice({ userId: U }, { supabase: client, db });
    expect(r.cleared).toBe(true);
    await expectOnlyV();
  });

  it("account deletion's wipe does the same", async () => {
    await seed();
    await wipeLocalUserData(U, { db });
    await expectOnlyV();
  });
});
