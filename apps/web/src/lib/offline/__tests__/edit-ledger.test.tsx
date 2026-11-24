// T-1007 (D-0281, D-0277, UF-08.2, UF-11.4): the on-device edit ledger. AC1-AC9, AC11, AC12.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";

const net = vi.hoisted(() => ({ calls: 0 }));
vi.mock("../../auth/client.js", () => ({
  supabase: {
    from: () => {
      net.calls += 1;
      throw new Error("no network in the edit ledger");
    },
  },
}));

import * as ledger from "../edit-ledger.js";
import { useLearnFlag } from "../edit-ledger-hooks.js";
import { offlineDb, resetOfflineDbForTest, userScopedKey } from "../db.js";
import { MAX_ENTRIES, type RemoteSignal } from "../edit-ledger-rules.js";
import { freshOfflineDb, signIn, signOut } from "./test-helpers.js";

const USER = "11111111-1111-4111-8111-111111111111";
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 1);
const day = (n: number): Date => new Date(T0 + n * DAY);

const profile = (learning?: { learnFromEdits: boolean; learnResetAt: string | null }) =>
  offlineDb().profileCache.put({
    userId: USER,
    profile: {} as never,
    ...(learning ? { learning } : {}),
  });

beforeEach(() => {
  freshOfflineDb();
  signIn(USER);
  net.calls = 0;
});
afterEach(() => {
  cleanup();
  signOut();
  vi.restoreAllMocks();
});

const swaps = async (n: number, from = "A", to = "B", reason: never | null = null) => {
  for (let i = 0; i < n; i++) await ledger.recordSwap(from, to, reason, `v${i}`, day(i));
};
const remote = (over: Partial<RemoteSignal>): RemoteSignal => ({
  device_id: "dev-other",
  key: "swap:A:B",
  kind: "swap",
  exercise_id: "A",
  to_exercise_id: "B",
  count: 1,
  window_start: day(0).toISOString(),
  last_seen: day(0).toISOString(),
  asked_at: null,
  ...over,
});

describe("T-1007 AC1 swap threshold", () => {
  it("2 signals in 2 visits are not pending; the third is; 3 in one visit count 1", async () => {
    await swaps(2);
    expect(await ledger.pending([], day(3))).toEqual([]);
    await ledger.recordSwap("A", "B", null, "v2", day(2));
    const p = await ledger.pending([], day(3));
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ kind: "swap", exerciseId: "A", toExerciseId: "B", total: 3 });

    for (let i = 0; i < 3; i++) await ledger.recordSwap("C", "D", null, "same-visit", day(i));
    const cd = (await ledger.entries()).find((e) => e.key === "swap:C:D");
    expect(cd?.count).toBe(1);
  });
});

describe("T-1007 AC2 reasons", () => {
  it("none and discomfort count; equipment_taken, variety and short_on_time do not", async () => {
    expect(await ledger.recordSwap("A", "B", "none", "v1", day(0))).toBe(true);
    expect(await ledger.recordSwap("A", "B", "discomfort", "v2", day(1))).toBe(true);
    for (const reason of ["equipment_taken", "variety", "short_on_time"] as const) {
      expect(await ledger.recordSwap("A", "B", reason, `r-${reason}`, day(2))).toBe(false);
    }
    expect((await ledger.entries())[0]?.count).toBe(2);
  });
});

describe("T-1007 AC3 removal", () => {
  it("1 removal is not pending; a second visit makes it pending", async () => {
    await ledger.recordRemoval("X", "v1", day(0));
    expect(await ledger.pending([], day(1))).toEqual([]);
    await ledger.recordRemoval("X", "v2", day(1));
    expect((await ledger.pending([], day(2))).map((p) => p.key)).toEqual(["removal:X"]);
  });

  it("the API has no method for Not today, a stepper remove or a dropped exercise", () => {
    expect(Object.keys(ledger).sort()).toEqual(
      [
        // T-1008: the sync's helpers (none is a signal source).
        "ackSynced",
        "applyProfileLearning",
        "dirtyEntries",
        "pruneEntries",
        "onLedgerWrite",
        "purgeResetNow",
        "setMemoryLearning",
        "clearLocal",
        "deviceId",
        "entries",
        "loadLearning",
        "markAsked",
        "pending",
        "recordRemoval",
        "recordSwap",
      ].sort(),
    );
    expect(Object.keys(ledger).join(" ")).not.toMatch(/notToday|stepper|drop|skip/i);
  });
});

describe("T-1007 AC4 window and cap", () => {
  it("day 0, 30, 59 count 3; day 61 restarts at 1 with windowStart day 61", async () => {
    for (const [i, d] of [0, 30, 59].entries())
      await ledger.recordSwap("A", "B", null, `v${i}`, day(d));
    expect((await ledger.entries())[0]?.count).toBe(3);
    await ledger.recordSwap("A", "B", null, "v9", day(61));
    const [e] = await ledger.entries();
    expect(e).toMatchObject({ count: 1, windowStart: day(61).toISOString() });
  });

  it("an entry whose window is over and has no new signal contributes 0", async () => {
    await swaps(3);
    expect(await ledger.pending([], day(10))).toHaveLength(1);
    expect(await ledger.pending([], day(63))).toEqual([]);
  });

  it("the 201st entry drops the oldest", async () => {
    const rows = Array.from({ length: MAX_ENTRIES }, (_, i) => {
      const id = `E${String(i).padStart(3, "0")}`;
      return {
        key: userScopedKey(USER, `removal:${id}`),
        userId: USER,
        ledgerKey: `removal:${id}`,
        kind: "removal" as const,
        exerciseId: id,
        toExerciseId: null,
        count: 1,
        windowStart: day(i).toISOString(),
        lastSeen: day(i).toISOString(),
        askedAt: null,
        dirty: true,
        visits: ["v"],
      };
    });
    await offlineDb().editLedger.bulkPut(rows);
    await ledger.recordRemoval("NEW", "v", day(300));
    const all = await ledger.entries();
    expect(all).toHaveLength(MAX_ENTRIES);
    expect(all.map((e) => e.key)).not.toContain("removal:E000");
    expect(all.map((e) => e.key)).toContain("removal:NEW");
  });
});

describe("T-1007 AC5 sum across devices", () => {
  it("own 1 + two other devices 1 + 1 is 3; one window older than 60 days makes it 2", async () => {
    await ledger.recordSwap("A", "B", null, "v1", day(10));
    const rows = [remote({ device_id: "d2" }), remote({ device_id: "d3" })];
    const p = await ledger.pending(rows, day(11));
    expect(p).toHaveLength(1);
    expect(p[0]?.total).toBe(3);
    const stale = [
      remote({ device_id: "d2" }),
      remote({
        device_id: "d3",
        window_start: day(-60).toISOString(),
        last_seen: day(-59).toISOString(),
      }),
    ];
    expect(await ledger.pending(stale, day(11))).toEqual([]);
  });

  it("this device's own row in the remote cache is not counted twice", async () => {
    await ledger.recordSwap("A", "B", null, "v1", day(10));
    const id = await ledger.deviceId();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const rows = [remote({ device_id: id!, count: 1 }), remote({ device_id: "d2" })];
    expect(await ledger.pending(rows, day(11))).toEqual([]);
  });
});

describe("T-1007 AC6 asked for good", () => {
  it("markAsked removes it from pending and later signals never bring it back", async () => {
    await swaps(3);
    expect(await ledger.pending([], day(4))).toHaveLength(1);
    await ledger.markAsked("swap:A:B", day(4));
    expect(await ledger.pending([], day(5))).toEqual([]);
    for (let i = 10; i < 20; i++) await ledger.recordSwap("A", "B", null, `v${i}`, day(i));
    expect(await ledger.pending([], day(21))).toEqual([]);
    // Even after the window restarts.
    await ledger.recordSwap("A", "B", null, "late", day(100));
    await ledger.recordSwap("A", "B", null, "late2", day(101));
    await ledger.recordSwap("A", "B", null, "late3", day(102));
    expect(await ledger.pending([], day(103))).toEqual([]);
  });

  it("an asked mark for a key with no local entry is kept as a count-0 entry", async () => {
    await ledger.markAsked("removal:Z", day(1));
    const [e] = await ledger.entries();
    expect(e).toMatchObject({ key: "removal:Z", count: 0, dirty: true });
    expect(e?.askedAt).not.toBeNull();
  });

  it("a remote row with askedAt keeps the key from being pending", async () => {
    await swaps(3);
    expect(
      await ledger.pending(
        [remote({ device_id: "d2", count: 0, asked_at: day(2).toISOString() })],
        day(4),
      ),
    ).toEqual([]);
  });
});

describe("T-1007 AC7 already decided", () => {
  it("a swap-in that is a favorite, or an excluded exercise, raises nothing", async () => {
    await swaps(3);
    await ledger.recordRemoval("X", "r1", day(0));
    await ledger.recordRemoval("X", "r2", day(1));
    expect(await ledger.pending([], day(5))).toHaveLength(2);
    const row = (id: string) => ({
      key: userScopedKey(USER, id),
      userId: USER,
      exerciseId: id,
      createdAt: day(0).toISOString(),
    });
    await offlineDb().favoriteCache.put(row("B"));
    expect((await ledger.pending([], day(5))).map((p) => p.key)).toEqual(["removal:X"]);
    await offlineDb().excludedCache.put(row("X"));
    expect(await ledger.pending([], day(5))).toEqual([]);
  });
});

describe("T-1007 AC8 learning on/off", () => {
  it("flag false: nothing is written and the store is emptied; true: counted", async () => {
    await ledger.recordSwap("A", "B", null, "v0", day(0));
    expect(await offlineDb().editLedger.count()).toBe(1);
    await profile({ learnFromEdits: false, learnResetAt: null });
    expect(await ledger.recordSwap("A", "B", null, "v1", day(1))).toBe(false);
    expect(await ledger.recordRemoval("X", "v1", day(1))).toBe(false);
    expect(await offlineDb().editLedger.count()).toBe(0);
    expect(await offlineDb().editLedgerMeta.count()).toBe(0);
    expect(await ledger.markAsked("removal:X", day(1))).toBe(false);
    await profile({ learnFromEdits: true, learnResetAt: null });
    expect(await ledger.recordRemoval("X", "v2", day(2))).toBe(true);
  });

  it("a missing profile or missing columns mean true (hook and loader)", async () => {
    expect(await ledger.loadLearning()).toEqual({ learnFromEdits: true, learnResetAt: null });
    await profile();
    expect(await ledger.loadLearning()).toEqual({ learnFromEdits: true, learnResetAt: null });
    const { result } = renderHook(() => useLearnFlag(USER));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current).toMatchObject({ enabled: true, resetAt: null });
  });

  it("the hook follows the cached profile", async () => {
    await profile({ learnFromEdits: false, learnResetAt: "2026-01-05T00:00:00.000Z" });
    const { result } = renderHook(() => useLearnFlag(USER));
    await waitFor(() => expect(result.current.enabled).toBe(false));
    expect(result.current.resetAt).toBe("2026-01-05T00:00:00.000Z");
  });
});

describe("T-1007 AC9 reset epoch", () => {
  it("entries at or before learn_reset_at are dropped for good; later ones stay", async () => {
    await ledger.recordSwap("A", "B", null, "v1", day(1));
    await ledger.recordRemoval("X", "v1", day(5));
    await profile({ learnFromEdits: true, learnResetAt: day(3).toISOString() });
    expect((await ledger.entries()).map((e) => e.key)).toEqual(["removal:X"]);
    // The next write purges the stored row, so it can never be pushed.
    await ledger.recordRemoval("Y", "v2", day(6));
    const stored = (await offlineDb().editLedger.toArray()).map((r) => r.ledgerKey).sort();
    expect(stored).toEqual(["removal:X", "removal:Y"]);
  });

  it("an entry exactly at the epoch is dropped; remote rows at or before it are ignored", async () => {
    await swaps(2);
    await profile({ learnFromEdits: true, learnResetAt: day(1).toISOString() });
    const rows = [
      remote({ device_id: "d2", last_seen: day(1).toISOString() }),
      remote({ device_id: "d3", last_seen: day(2).toISOString() }),
    ];
    // own entry (lastSeen day 1) dropped; only d3 counts: 1 < 3
    expect(await ledger.pending(rows, day(3))).toEqual([]);
    expect(await ledger.entries()).toEqual([]);
  });
});

describe("T-1007 AC11 offline and online", () => {
  it.each([false, true])(
    "navigator.onLine=%s: counting and pending work, no network",
    async (online) => {
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(online);
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      await swaps(3);
      expect(await ledger.pending([], day(4))).toHaveLength(1);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(net.calls).toBe(0);
    },
  );
});

describe("T-1007 AC12 persistence and device id", () => {
  it("counts, dirty flags, asked marks and the deviceId survive a reload; clearLocal makes a new id", async () => {
    const name = "wl-ledger-reload";
    resetOfflineDbForTest(name);
    await swaps(2);
    await ledger.markAsked("swap:A:B", day(3));
    const before = await ledger.entries();
    const id = await ledger.deviceId();
    offlineDb().close();
    resetOfflineDbForTest(name);
    expect(await ledger.entries()).toEqual(before);
    expect(before[0]).toMatchObject({ count: 2, dirty: true });
    expect(before[0]?.askedAt).not.toBeNull();
    expect(await ledger.deviceId()).toBe(id);

    await ledger.clearLocal();
    expect(await ledger.entries()).toEqual([]);
    expect(await ledger.deviceId()).toBeNull();
    await ledger.recordRemoval("X", "v", day(9));
    const next = await ledger.deviceId();
    expect(next).not.toBeNull();
    expect(next).not.toBe(id);
  });
});

describe("T-1008 re-review: reset comparison is by instant, not by string", () => {
  it("an entry 200 ms after a server-format reset ('+00:00', microseconds) survives; one at the same instant does not", async () => {
    const { afterReset } = await import("../edit-ledger-rules.js");
    const reset = "2026-11-24T10:00:00.123456+00:00";
    const after = { lastSeen: "2026-11-24T10:00:00.323Z" };
    const same = { lastSeen: "2026-11-24T10:00:00.123Z" };
    // As strings "…00.323Z" < "…00.123456+00:00" is false only by luck; check the instants.
    expect(afterReset([after, same], reset)).toEqual([after]);
  });
});
