// T-1008 (D-0281 §2, §4, UF-08.2, UF-11.4): the edit ledger's sync. Two simulated devices (two
// IndexedDB databases, so two `deviceId`s) against an in-memory fake of `edit_signals`.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ fake: null as unknown }));
vi.mock("../../auth/client.js", () => ({
  supabase: {
    from: (t: string) => (h.fake as { from: (t: string) => unknown }).from(t),
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  },
}));

import * as ledger from "../edit-ledger.js";
import * as sync from "../edit-ledger-sync.js";
import { offlineDb, resetOfflineDbForTest } from "../db.js";
import { refreshProfile } from "../history.js";
import { recordSet } from "../queue.js";
import { signOutAndClearDevice } from "../../account/sign-out.js";
import { createAccountFake } from "./edit-signals-fake.js";
import { signIn, signOut } from "./test-helpers.js";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 1);
const day = (n: number): Date => new Date(T0 + n * DAY);

let fake: ReturnType<typeof createAccountFake>;
let run = 0;
const dbName = (d: string) => `wl-t1008-${run}-${d}`;
/** Makes the named device's database the current one (its ledger, cache and device id). */
const asDevice = async (d: "A" | "B" | "C", withProfile = true) => {
  resetOfflineDbForTest(dbName(d));
  if (withProfile) await refreshProfile();
};
const online = (on: boolean) => vi.spyOn(navigator, "onLine", "get").mockReturnValue(on) as unknown;
const swaps = async (n: number, from = "X", to = "Y", offset = 0) => {
  for (let i = 0; i < n; i++)
    await ledger.recordSwap(from, to, null, `v${offset + i}`, day(offset + i));
};
const signalRows = () => [...fake.rows.values()];
const upserts = () => fake.log.filter((r) => r.op === "upsert");
const NOW = day(10);

beforeEach(async () => {
  run += 1;
  fake = createAccountFake();
  h.fake = fake;
  signIn(USER);
  // "Now" is day 10, so the fixtures' windows are open (a pull deletes lapsed rows).
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  sync.invalidateLedgerProfile();
  await asDevice("A");
});
afterEach(() => {
  signOut();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("T-1008 AC1 sum across devices", () => {
  it("A has 2, B has 1: after both flush and B pulls the total is 3 and the key is pending", async () => {
    await swaps(2);
    expect(await sync.flushLedger()).toBe("sent");
    await asDevice("B");
    await swaps(1, "X", "Y", 5);
    await sync.flushLedger();
    expect(
      signalRows()
        .map((r) => r.count)
        .sort(),
    ).toEqual([1, 2]);
    expect(await sync.pullLedger(NOW)).toBe("pulled");
    const p = await sync.pendingFromAccount(NOW);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ key: "swap:X:Y", total: 3 });
  });
  it("A's flush replayed 5 times leaves the total at 3; nothing is sent when nothing is dirty", async () => {
    await swaps(2);
    await sync.flushLedger();
    await asDevice("B");
    await swaps(1, "X", "Y", 5);
    await sync.flushLedger();
    await asDevice("A", false);
    // Force 5 replays of A's entry as dirty again.
    for (let i = 0; i < 5; i++) {
      const row = (await offlineDb().editLedger.toArray())[0]!;
      await offlineDb().editLedger.put({ ...row, dirty: true });
      await sync.flushLedger();
    }
    await asDevice("B");
    await sync.pullLedger(NOW);
    expect((await sync.pendingFromAccount(NOW))[0]?.total).toBe(3);
    const before = upserts().length;
    expect(await sync.flushLedger()).toBe("empty");
    expect(upserts()).toHaveLength(before);
  });
  it("each upsert targets the unique key as absolute values of this device's own row", async () => {
    await swaps(2);
    await sync.flushLedger();
    const [u] = upserts();
    expect(u?.opts).toEqual({ onConflict: "user_id,device_id,key" });
    expect(u?.body).toMatchObject({ key: "swap:X:Y", count: 2, user_id: USER });
    expect((u?.body as { device_id: string }).device_id).toBe(await ledger.deviceId());
  });
});

describe("T-1008 AC2 order and replay", () => {
  it("a flush the server applied but whose response was lost leaves the row as it was on retry", async () => {
    await swaps(2);
    fake.state.loseResponse = true;
    expect(await sync.flushLedger()).toBe("error");
    expect((await ledger.dirtyEntries(USER)).length).toBe(1);
    const applied = JSON.stringify(signalRows());
    fake.state.loseResponse = false;
    expect(await sync.flushLedger()).toBe("sent");
    expect(JSON.stringify(signalRows())).toBe(applied);
    expect((await ledger.dirtyEntries(USER)).length).toBe(0);
  });
  it("a late write with an older last_seen leaves the row unchanged (both values: older, newer)", async () => {
    await swaps(3);
    await sync.flushLedger();
    const stored = signalRows()[0]!;
    // A reordered older write: the fake's trigger ignores it.
    const table = (h.fake as typeof fake).from("edit_signals") as unknown as {
      upsert: (row: unknown, opts: unknown) => Promise<unknown>;
    };
    await table.upsert(
      { ...stored, count: 1, last_seen: day(0).toISOString() },
      { onConflict: "user_id,device_id,key" },
    );
    expect(signalRows()[0]).toEqual(stored);
    await table.upsert(
      { ...stored, count: 9, last_seen: day(30).toISOString() },
      { onConflict: "user_id,device_id,key" },
    );
    expect(signalRows()[0]?.count).toBe(9);
  });
  it("one flush in flight: a second does not start until it ends, then runs once more", async () => {
    await swaps(1);
    let release!: () => void;
    fake.state.hold = new Promise<void>((r) => (release = r));
    const first = sync.flushLedger();
    await vi.waitFor(() => expect(upserts()).toHaveLength(1));
    const second = sync.flushLedger();
    await ledger.recordSwap("X", "Y", null, "later", day(20));
    await new Promise((r) => setTimeout(r, 40));
    expect(upserts()).toHaveLength(1);
    fake.state.hold = null;
    release();
    await Promise.all([first, second]);
    // The signal counted while the first push was in flight was sent by the follow-up run.
    expect(upserts()).toHaveLength(2);
    expect(signalRows()[0]?.count).toBe(2);
  });
  it("ackSynced clears dirty only when lastSeen (and count) are unchanged", async () => {
    await swaps(1);
    const e = (await ledger.dirtyEntries(USER))[0]!;
    await ledger.recordSwap("X", "Y", null, "during-flight", day(40));
    expect(await ledger.ackSynced(e.key, e.lastSeen, undefined, USER)).toBe(false);
    expect((await ledger.dirtyEntries(USER)).length).toBe(1);
    const now = (await ledger.dirtyEntries(USER))[0]!;
    expect(await ledger.ackSynced(now.key, now.lastSeen, undefined, USER)).toBe(true);
    expect((await ledger.dirtyEntries(USER)).length).toBe(0);
    expect(await ledger.ackSynced("swap:nope:nope", now.lastSeen, undefined, USER)).toBe(false);
  });
  it("an asked mark made during a push keeps the entry dirty (same lastSeen)", async () => {
    await swaps(1);
    const e = (await ledger.dirtyEntries(USER))[0]!;
    await ledger.markAsked(e.key, day(30));
    expect(await ledger.ackSynced(e.key, e.lastSeen, { count: e.count, askedAt: null }, USER)).toBe(
      false,
    );
    expect((await ledger.dirtyEntries(USER)).length).toBe(1);
  });
  it("a rejected row (check or missing exercise) is cleaned and does not block the next entry", async () => {
    await swaps(1, "X", "Y");
    await swaps(1, "P", "Q", 3);
    fake.state.upsertError = { code: "23503", message: "fk" };
    expect(await sync.flushLedger()).toBe("empty");
    expect(await ledger.dirtyEntries(USER)).toHaveLength(0);
    expect(upserts()).toHaveLength(2);
  });
});

describe("T-1008 AC3 offline and online", () => {
  it("offline: signals stay dirty, nothing is sent, pending uses the cached rows", async () => {
    await asDevice("B");
    await swaps(2, "X", "Y");
    await sync.flushLedger();
    await asDevice("A");
    await sync.pullLedger(NOW);
    online(false);
    await swaps(1, "X", "Y", 5);
    expect(await sync.flushLedger()).toBe("offline");
    expect(upserts().length).toBe(1);
    expect((await ledger.dirtyEntries(USER)).length).toBe(1);
    expect(await sync.pullLedger(NOW)).toBe("offline");
    expect((await sync.pendingFromAccount(NOW))[0]?.total).toBe(3);
  });
  it("the online event sends the dirty entries without a reload", async () => {
    const spy = online(false) as { mockReturnValue: (v: boolean) => void };
    const handle = sync.startLedgerSync();
    await swaps(2);

    expect(upserts()).toHaveLength(0);
    spy.mockReturnValue(true);
    window.dispatchEvent(new Event("online"));
    await handle.settled();
    expect(signalRows()[0]?.count).toBe(2);
    handle.stop();
  });
  it("online: a signal reaches the fake after the debounce", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const handle = sync.startLedgerSync();
    await handle.settled();
    await swaps(1);
    expect(upserts()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(sync.LEDGER_FLUSH_DEBOUNCE_MS + 10);
    await handle.settled();
    expect(upserts()).toHaveLength(1);
    handle.stop();
  });
  it("a failed push backs off and retries by itself", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const handle = sync.startLedgerSync();
    await handle.settled();
    fake.state.failUpsert = true;
    await swaps(1);
    await vi.advanceTimersByTimeAsync(sync.LEDGER_FLUSH_DEBOUNCE_MS + 10);
    await handle.settled();
    expect(signalRows()).toHaveLength(0);
    fake.state.failUpsert = false;
    await vi.advanceTimersByTimeAsync(2100);
    // IndexedDB's own timers are faked too: keep the clock moving until the retry has finished.
    for (let i = 0; i < 20 && signalRows().length === 0; i++) await vi.advanceTimersByTimeAsync(50);
    await handle.settled();
    expect(signalRows()).toHaveLength(1);
    handle.stop();
  });
});

describe("T-1008 AC4 asked syncs", () => {
  it("A answers: the key is not pending on B, also with B's own count of 2", async () => {
    await swaps(3);
    await ledger.markAsked("swap:X:Y", day(8));
    await sync.flushLedger();
    await asDevice("B");
    await sync.pullLedger(NOW);
    expect(await sync.pendingFromAccount(NOW)).toEqual([]);
    await swaps(2, "X", "Y", 6);
    expect(await sync.pendingFromAccount(NOW)).toEqual([]);
  });
  it("without an answer the same counts are pending (the other value)", async () => {
    await swaps(3);
    await sync.flushLedger();
    await asDevice("B");
    await sync.pullLedger(NOW);
    expect((await sync.pendingFromAccount(NOW)).map((p) => p.key)).toEqual(["swap:X:Y"]);
  });
  it("an asked mark with no count (count 0) is sent", async () => {
    await asDevice("B");
    await ledger.markAsked("swap:X:Y", day(8));
    await sync.flushLedger();
    expect(signalRows()[0]).toMatchObject({ count: 0 });
    expect(signalRows()[0]?.asked_at).not.toBeNull();
  });
});

describe("T-1008 AC5 reset epoch and flag", () => {
  it("forgetAll online: no rows, learn_reset_at touched, an offline device drops its older entries", async () => {
    await swaps(2);
    await sync.flushLedger();
    await asDevice("B");
    await swaps(1, "X", "Y", 3);
    await sync.flushLedger();
    await asDevice("C");
    online(false);
    await swaps(2, "P", "Q", 1); // offline, dirty, older than the reset
    online(true);
    await asDevice("A");
    expect(await sync.forgetAll()).toEqual({ ok: true });
    expect(signalRows()).toHaveLength(0);
    expect(fake.profile.learn_reset_at).not.toBeNull();
    expect((await ledger.entries()).length).toBe(0);
    // C comes back: its profile read drops entries at or before the epoch; nothing is sent.
    fake.profile.learn_reset_at = new Date(T0 + 365 * DAY).toISOString();
    await asDevice("C", false);
    const before = upserts().length;
    await refreshProfile();
    expect(await offlineDb().editLedger.count()).toBe(0); // dropped from the store, not just hidden
    expect(await ledger.entries()).toEqual([]);
    expect(await sync.flushLedger()).toBe("empty");
    expect(upserts()).toHaveLength(before);
  });
  it("a newer epoch keeps an entry counted after it (the other value)", async () => {
    await asDevice("C");
    await swaps(1, "P", "Q", 5);
    fake.profile.learn_reset_at = day(2).toISOString();
    await refreshProfile();
    expect((await ledger.entries()).map((e) => e.key)).toEqual(["swap:P:Q"]);
  });
  it("turnLearningOff: rows deleted, flag false, local ledger and cache empty", async () => {
    await swaps(3);
    await sync.flushLedger();
    await sync.pullLedger(NOW);
    expect(await sync.turnLearningOff()).toEqual({ ok: true });
    expect(signalRows()).toHaveLength(0);
    expect(fake.profile.learn_from_edits).toBe(false);
    expect(await ledger.entries()).toEqual([]);
    expect(await sync.cachedRemoteRows(USER)).toEqual([]);
    expect(await ledger.recordSwap("X", "Y", null, "z", day(1))).toBe(false);
    expect(await sync.flushLedger()).toBe("off");
  });
  it("a device that was offline during learning-off reads the flag and sends nothing", async () => {
    await asDevice("C");
    online(false);
    await swaps(2, "P", "Q");
    online(true);
    fake.profile.learn_from_edits = false;
    await refreshProfile();
    expect(await offlineDb().editLedger.count()).toBe(0);
    expect(await sync.flushLedger()).toBe("off");
    expect(upserts()).toHaveLength(0);
  });
  it("offline: neither call changes anything and both report offline", async () => {
    await swaps(2);
    await sync.flushLedger();
    online(false);
    const before = fake.log.length;
    expect(await sync.forgetAll()).toEqual({ ok: false, reason: "offline" });
    expect(await sync.turnLearningOff()).toEqual({ ok: false, reason: "offline" });
    expect(fake.log.length).toBe(before);
    expect(signalRows()).toHaveLength(1);
    expect((await ledger.entries()).length).toBe(1);
  });
});

describe("T-1008 AC6 failure", () => {
  it("Forget: the row delete fails, so learn_reset_at is not touched and the error is reported", async () => {
    await swaps(2);
    await sync.flushLedger();
    fake.state.failDeleteSignals = true;
    expect(await sync.forgetAll()).toEqual({ ok: false, reason: "error" });
    expect(fake.profile.learn_reset_at).toBeNull();
    expect(fake.log.some((r) => r.table === "profiles" && r.op === "update")).toBe(false);
    expect((await ledger.entries()).length).toBe(1);
    expect(signalRows()).toHaveLength(1);
  });
  it("Forget: the epoch write fails after the deletes, the error is reported and the device keeps its entries", async () => {
    await swaps(2);
    await sync.flushLedger();
    fake.state.failProfileUpdate = true;
    expect(await sync.forgetAll()).toEqual({ ok: false, reason: "error" });
    expect(fake.profile.learn_reset_at).toBeNull();
    expect((await ledger.entries()).length).toBe(1);
  });
  it("turnLearningOff: the flag write fails after the deletes, the flag is unchanged and the error reported", async () => {
    await swaps(2);
    await sync.flushLedger();
    fake.state.failProfileUpdate = true;
    expect(await sync.turnLearningOff()).toEqual({ ok: false, reason: "error" });
    expect(fake.profile.learn_from_edits).toBe(true);
    expect((await ledger.loadLearning()).learnFromEdits).toBe(true);
    expect((await ledger.entries()).length).toBe(1);
  });
  it("success path of both (the other value) writes only the changed field", async () => {
    await sync.forgetAll();
    await sync.turnLearningOff();
    const writes = fake.log.filter((r) => r.table === "profiles" && r.op === "update");
    expect(writes.map((w) => Object.keys(w.body as object))).toEqual([
      ["learn_reset_at"],
      ["learn_from_edits"],
    ]);
  });
});

describe("T-1008 AC7 cleanup", () => {
  const old = (over: object) => ({
    id: "old-1",
    user_id: USER,
    device_id: "dev-old",
    key: "swap:X:Y",
    kind: "swap",
    exercise_id: "X",
    to_exercise_id: "Y",
    count: 2,
    window_start: day(-80).toISOString(),
    last_seen: day(-79).toISOString(),
    asked_at: null,
    ...over,
  });
  it("a row with a window older than 60 days and no asked_at is deleted by a pull", async () => {
    fake.rows.set("a", old({}));
    await sync.pullLedger(NOW);
    expect(signalRows()).toHaveLength(0);
    expect(await sync.cachedRemoteRows(USER)).toEqual([]);
  });
  it("with asked_at it is kept and not counted", async () => {
    fake.rows.set("a", old({ asked_at: day(-70).toISOString() }));
    fake.rows.set(
      "b",
      old({
        id: "old-2",
        device_id: "dev-2",
        count: 5,
        window_start: day(5).toISOString(),
        last_seen: day(6).toISOString(),
      }),
    );
    await sync.pullLedger(NOW);
    expect(signalRows()).toHaveLength(2);
    expect(await sync.pendingFromAccount(NOW)).toEqual([]); // asked wins; and the old one adds 0
  });
  it("this device's rows beyond the cap of 200 are deleted, oldest first", async () => {
    await swaps(1);
    await sync.flushLedger();
    const dev = (await ledger.deviceId())!;
    for (let i = 0; i < 201; i++) {
      fake.rows.set(
        `r${i}`,
        old({
          id: `r-${i}`,
          device_id: dev,
          key: `removal:E${i}`,
          kind: "removal",
          exercise_id: `E${i}`,
          to_exercise_id: null,
          count: 1,
          window_start: day(5).toISOString(),
          last_seen: day(5 + i / 1000).toISOString(),
        }),
      );
    }
    await sync.pullLedger(NOW);
    expect(signalRows().filter((r) => r.device_id === dev)).toHaveLength(200);
    expect(signalRows().some((r) => r.key === "removal:E0")).toBe(false);
  });
});

describe("T-1008 AC8 privacy", () => {
  it("a flush writes only edit_signals columns, to no other table; record* makes no request", async () => {
    await swaps(2);
    await ledger.markAsked("swap:X:Y", day(9));
    expect(fake.log).toHaveLength(1); // the refreshProfile select of setup only
    await sync.flushLedger();
    expect(fake.log.filter((r) => r.op !== "select").every((r) => r.table === "edit_signals")).toBe(
      true,
    );
    const cols = [
      "user_id",
      "device_id",
      "key",
      "kind",
      "exercise_id",
      "to_exercise_id",
      "count",
      "window_start",
      "last_seen",
      "asked_at",
    ];
    for (const u of upserts())
      expect(Object.keys(u.body as object).sort()).toEqual([...cols].sort());
    expect(JSON.stringify(upserts())).not.toMatch(/name|note|Bench/i);
  });
  it("sign-out drops unsynced entries and sends nothing", async () => {
    await swaps(2);
    await asDevice("A");
    await signOutAndClearDevice({ userId: USER }, { db: offlineDb() } as never).catch(
      () => undefined,
    );
    signOut();
    const before = upserts().length;
    expect(await sync.flushLedger()).toBe("signed-out");
    expect(upserts()).toHaveLength(before);
    expect(await offlineDb().editLedger.count()).toBe(0);
  });
  it("another user on the same device never sees or sends the first user's entries", async () => {
    await swaps(2);
    signOut();
    signIn(OTHER);
    expect(await sync.flushLedger()).toBe("empty");
    expect(upserts()).toHaveLength(0);
    expect(await sync.cachedRemoteRows(OTHER)).toEqual([]);
  });
});

describe("T-1008 AC9 not in focus mode", () => {
  it("a push that hangs does not block a set write and renders nothing", async () => {
    await swaps(1);
    let release!: () => void;
    fake.state.hold = new Promise<void>((r) => (release = r));
    const flush = sync.flushLedger();
    await vi.waitFor(() => expect(upserts()).toHaveLength(1));
    const t0 = document.body.innerHTML;
    await expect(
      recordSet({
        sessionId: "S1",
        clientId: "c1",
        exerciseId: "bench-press",
        setIndex: 0,
        kind: "reps",
        reps: 8,
        weightKg: 60,
        completedAt: day(1).toISOString(),
        isWarmup: false,
      } as never),
    ).resolves.toBeDefined();
    expect(document.body.innerHTML).toBe(t0);
    fake.state.hold = null;
    release();
    await flush;
  });
  it("a failing flush and a failing pull never reject", async () => {
    await swaps(1);
    fake.state.failUpsert = true;
    fake.state.failProfileSelect = true;
    await expect(sync.flushLedger()).resolves.toBe("error");
    h.fake = {
      from: () => {
        throw new Error("boom");
      },
    };
    await expect(sync.pullLedger()).resolves.toBe("error");
    await expect(sync.syncLedgerNow()).resolves.toBeUndefined();
  });
});

describe("T-1008 learning-column writes send only the changed fields", () => {
  it("no source file writes learn_* except the sync module (no full profile upsert)", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const root = join(__dirname, "../../..");
    const hits: string[] = [];
    const walk = (d: string): void => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) {
          if (f !== "__tests__" && f !== "__e2e__") walk(p);
        } else if (
          /\.tsx?$/.test(f) &&
          /learn_from_edits|learn_reset_at/.test(readFileSync(p, "utf8")) &&
          /\.(upsert|update)\(/.test(readFileSync(p, "utf8"))
        ) {
          hits.push(p.slice(root.length));
        }
      }
    };
    walk(root);
    expect(hits.sort()).toEqual(["/lib/offline/edit-ledger-sync.ts"]);
  });
});

describe("T-1008 security review", () => {
  it("1: after a failed run with onLine true and a Forget elsewhere, the next run sends nothing", async () => {
    await asDevice("C");
    await swaps(2, "P", "Q");
    fake.state.failUpsert = true;
    expect(await sync.flushLedger()).toBe("error");
    fake.state.failUpsert = false;
    // Another device runs Forget meanwhile: the epoch moves past this device's entries.
    fake.profile.learn_reset_at = day(30).toISOString();
    const before = upserts().length;
    expect(await sync.flushLedger()).toBe("empty");
    expect(upserts()).toHaveLength(before);
    expect(await offlineDb().editLedger.count()).toBe(0);
  });
  it("1: a fresh profile read within 30 s is reused; after the throttle it is read again", async () => {
    await asDevice("C");
    await swaps(1, "P", "Q");
    await sync.flushLedger();
    const reads = () => fake.log.filter((r) => r.table === "profiles" && r.op === "select").length;
    const n = reads();
    await swaps(1, "P", "Q", 3);
    await sync.flushLedger();
    expect(reads()).toBe(n); // fresh: no second read
    vi.setSystemTime(new Date(NOW.getTime() + sync.PROFILE_FRESH_MS + 1));
    await swaps(1, "P", "Q", 6);
    await sync.flushLedger();
    expect(reads()).toBe(n + 1);
  });
  it("1/10: a failed profile read sends nothing; syncLedgerNow reads the profile first", async () => {
    await asDevice("C");
    await swaps(1, "P", "Q");
    sync.invalidateLedgerProfile();
    fake.state.failProfileSelect = true;
    expect(await sync.flushLedger()).toBe("error");
    expect(upserts()).toHaveLength(0);
    fake.state.failProfileSelect = false;
    fake.profile.learn_reset_at = day(30).toISOString();
    await sync.syncLedgerNow();
    expect(upserts()).toHaveLength(0);
  });
  it("3: a pull that started before Forget drops its result (cache stays empty)", async () => {
    await swaps(3);
    await sync.flushLedger();
    let release!: () => void;
    fake.state.holdSelect = new Promise<void>((r) => (release = r));
    const pull = sync.pullLedger(NOW);
    await vi.waitFor(() =>
      expect(fake.log.some((r) => r.op === "select" && r.table === "edit_signals")).toBe(true),
    );
    fake.state.holdSelect = null;
    expect(await sync.forgetAll()).toEqual({ ok: true });
    release();
    expect(await pull).toBe("busy");
    expect(await sync.cachedRemoteRows(USER)).toEqual([]);
  });
  it("3: a pull during the change is busy; with learning off a pull clears the cache", async () => {
    await swaps(2);
    await sync.flushLedger();
    await sync.pullLedger(NOW);
    expect((await sync.cachedRemoteRows(USER)).length).toBe(1);
    let release!: () => void;
    fake.state.hold = new Promise<void>((r) => (release = r));
    // Hold the delete step instead: Forget in progress.
    const origFrom = fake.from;
    let inDelete!: () => void;
    const reached = new Promise<void>((r) => (inDelete = r));
    h.fake = {
      ...fake,
      from: (t: string) => {
        const b = origFrom(t) as { delete?: () => unknown };
        if (t !== "edit_signals" || !b.delete) return b;
        return {
          ...b,
          delete: () => {
            inDelete();
            return {
              eq: (...a: unknown[]) =>
                fake.state.hold!.then(() =>
                  (b.delete!() as { eq: (...x: unknown[]) => unknown }).eq(...a),
                ),
            };
          },
        };
      },
    };
    const forget = sync.forgetAll();
    await reached;
    expect(await sync.pullLedger(NOW)).toBe("busy");
    fake.state.hold = null;
    release();
    await forget;
    h.fake = fake;
    // Learning off: a later pull deletes whatever the cache holds instead of just answering.
    await offlineDb().editSignalsCache.put({
      key: "k",
      userId: USER,
      row: {
        id: "z",
        device_id: "d",
        key: "swap:X:Y",
        kind: "swap",
        exercise_id: "X",
        to_exercise_id: "Y",
        count: 1,
        window_start: day(9).toISOString(),
        last_seen: day(9).toISOString(),
        asked_at: null,
      },
    });
    await sync.turnLearningOff();
    await offlineDb().editSignalsCache.put({
      key: "k",
      userId: USER,
      row: {
        id: "z",
        device_id: "d",
        key: "swap:X:Y",
        kind: "swap",
        exercise_id: "X",
        to_exercise_id: "Y",
        count: 1,
        window_start: day(9).toISOString(),
        last_seen: day(9).toISOString(),
        asked_at: null,
      },
    });
    expect(await sync.pullLedger(NOW)).toBe("off");
    expect(await sync.cachedRemoteRows(USER)).toEqual([]);
  });
  it("4: the device caches the server's learn_reset_at, not its own clock", async () => {
    fake.state.failProfileSelect = true; // so the cache cannot be refilled by a profile read
    await sync.forgetAll();
    const cached = (await offlineDb().profileCache.get(USER))?.learning?.learnResetAt;
    expect(cached).toBe(fake.profile.learn_reset_at);
  });
  it("10: syncLedgerNow reads the profile first, so a pull never refills the cache after learning went off elsewhere", async () => {
    await offlineDb().editSignalsCache.put({
      key: "k",
      userId: USER,
      row: {
        id: "z",
        device_id: "d",
        key: "swap:X:Y",
        kind: "swap",
        exercise_id: "X",
        to_exercise_id: "Y",
        count: 1,
        window_start: day(9).toISOString(),
        last_seen: day(9).toISOString(),
        asked_at: null,
      },
    });
    fake.rows.set("o", {
      id: "o1",
      user_id: USER,
      device_id: "d",
      key: "swap:X:Y",
      kind: "swap",
      exercise_id: "X",
      to_exercise_id: "Y",
      count: 1,
      window_start: day(9).toISOString(),
      last_seen: day(9).toISOString(),
      asked_at: null,
    });
    fake.profile.learn_from_edits = false;
    await sync.syncLedgerNow();
    expect(await sync.cachedRemoteRows(USER)).toEqual([]);
  });
  it("5: with no cached profile row, turning learning off still holds until a profile read", async () => {
    await offlineDb().profileCache.clear();
    await swaps(1);
    expect(await sync.turnLearningOff()).toEqual({ ok: true });
    // refreshProfile (best effort) re-cached the server's answer: off.
    expect((await ledger.loadLearning(USER)).learnFromEdits).toBe(false);
    await offlineDb().profileCache.clear();
    fake.state.failProfileSelect = true;
    await sync.turnLearningOff().catch(() => undefined);
    expect((await ledger.loadLearning(USER)).learnFromEdits).toBe(false);
    expect(await ledger.recordSwap("X", "Y", null, "n", day(1))).toBe(false);
  });
  it("6: learning turned off while a flush is running stops the remaining entries", async () => {
    await swaps(1, "A", "B");
    await swaps(1, "C", "D", 3);
    let release!: () => void;
    fake.state.hold = new Promise<void>((r) => (release = r));
    const flush = sync.flushLedger();
    await vi.waitFor(() => expect(upserts()).toHaveLength(1));
    const row = (await offlineDb().profileCache.get(USER))!;
    await offlineDb().profileCache.put({
      ...row,
      learning: { learnFromEdits: false, learnResetAt: null },
    });
    fake.state.hold = null;
    release();
    expect(await flush).toBe("off");
    expect(upserts()).toHaveLength(1);
  });
  it("8: a lapsed server row prunes the local entry only when the windows match", async () => {
    await swaps(1, "X", "Y", 0); // local window starts day 0
    await sync.flushLedger();
    const dev = (await ledger.deviceId())!;
    fake.rows.clear();
    const lapsed = (ws: string) => ({
      id: "l1",
      user_id: USER,
      device_id: dev,
      key: "swap:X:Y",
      kind: "swap",
      exercise_id: "X",
      to_exercise_id: "Y",
      count: 1,
      window_start: ws,
      last_seen: ws,
      asked_at: null,
    });
    // Server row has an older window (day -90): the local entry (day 0, open) stays.
    fake.rows.set("a", lapsed(day(-90).toISOString()));
    await sync.pullLedger(NOW);
    expect(await offlineDb().editLedger.count()).toBe(1);
    // Same window and lapsed (now far later): both go.
    const later = new Date(day(0).getTime() + 90 * DAY);
    vi.setSystemTime(later);
    fake.rows.set("a", lapsed(day(0).toISOString()));
    await sync.pullLedger(later);
    expect(await offlineDb().editLedger.count()).toBe(0);
  });
  it("9: a 23514 is dropped with a dev warning; a 22P02 or 23502 stays dirty and reports an error", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await swaps(1);
    fake.state.upsertError = { code: "23514", message: "check" };
    expect(await sync.flushLedger()).toBe("empty");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(await ledger.dirtyEntries(USER)).toHaveLength(0);
    for (const code of ["22P02", "23502"]) {
      await swaps(1, "P", "Q", 4);
      fake.state.upsertError = { code, message: "bug" };
      expect(await sync.flushLedger()).toBe("error");
      expect(await ledger.dirtyEntries(USER)).toHaveLength(1);
      await offlineDb().editLedger.clear();
    }
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
