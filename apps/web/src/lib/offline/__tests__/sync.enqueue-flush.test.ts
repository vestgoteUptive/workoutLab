// T-0385 UF-08.4 / UF-09 (D-0116): flush soon after an online enqueue. `upsertSession`,
// `recordSet`, `editSet` and `deleteSet` notify the running sync handle once IndexedDB commits;
// the handle flushes 250 ms after the last notify, with at most one such flush in flight.
//
// Only `setTimeout`/`clearTimeout` are faked: fake-indexeddb schedules on `setImmediate`, so
// Dexie keeps running on real macrotasks while the debounce runs on the fake clock. `flush` is
// wrapped (the real one runs underneath) so a test can count how many flushes *started*.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseSpy } from "./supabase-spy.js";

const spy = createSupabaseSpy();
const unsubscribe = vi.fn();
const onAuthStateChange = vi.fn(() => ({ data: { subscription: { unsubscribe } } }));

vi.mock("../../auth/client.js", () => ({
  supabase: { from: spy.from, auth: { onAuthStateChange } },
}));

vi.mock("../history.js", () => ({
  refreshHistory: vi.fn().mockResolvedValue(undefined),
  refreshLibrary: vi.fn().mockResolvedValue(undefined),
  refreshTargets: vi.fn().mockResolvedValue(undefined),
  refreshProfile: vi.fn().mockResolvedValue(undefined),
  refreshSessions: vi.fn().mockResolvedValue(undefined),
  refreshCheckins: vi.fn().mockResolvedValue(undefined),
}));

const flushStarts = vi.fn();
vi.mock("../flush.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../flush.js")>();
  return {
    ...actual,
    flush: vi.fn((...args: Parameters<typeof actual.flush>) => {
      flushStarts();
      return actual.flush(...args);
    }),
  };
});

const { startSync } = await import("../sync.js");
type SyncHandle = import("../sync.js").SyncHandle;
const { flush } = await import("../flush.js");
const { recordSet, editSet, deleteSet, upsertSession, onQueueWrite } = await import("../queue.js");
type RecordSetInput = import("../queue.js").RecordSetInput;
type SessionInsert = import("../queue.js").SessionInsert;
const { offlineDb } = await import("../db.js");
const { freshOfflineDb, signIn, signOut } = await import("./test-helpers.js");

const USER = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";

// Captured before any test fakes the clock: the 50 ms waits below are real macrotask waits.
const realSetTimeout = globalThis.setTimeout;
const realWait = (ms = 50) => new Promise<void>((resolve) => realSetTimeout(resolve, ms));

const SET: RecordSetInput = {
  sessionId: SESSION_ID,
  exerciseId: "back-squat",
  setIndex: 0,
  kind: "reps",
  reps: 8,
  weightKg: 60,
  isWarmup: false,
  backoff: false,
};

function sessionRow(): SessionInsert {
  return {
    id: SESSION_ID,
    user_id: USER,
    started_at: "2026-10-02T10:00:00.000Z",
    time_budget_min: 30,
  };
}

function sentSessionIds(): string[] {
  return spy.calls
    .filter((c) => c.table === "sessions")
    .flatMap((c) => c.rows as Array<{ id: string }>)
    .map((r) => r.id);
}

function sentSetIds(): string[] {
  return spy.calls
    .filter((c) => c.table === "session_sets")
    .flatMap((c) => c.rows as Array<{ client_id: string }>)
    .map((r) => r.client_id);
}

function setOnline(value: boolean): void {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(value);
}

let rejections: unknown[] = [];
const onRejection = (reason: unknown) => {
  rejections.push(reason);
};

let handles: SyncHandle[] = [];
function start(): SyncHandle {
  const handle = startSync({ tz: "UTC" });
  handles.push(handle);
  return handle;
}

beforeEach(() => {
  freshOfflineDb();
  rejections = [];
  process.on("unhandledRejection", onRejection);
  spy.calls.length = 0;
  spy.from.mockClear();
  spy.setHandler("sessions", () => ({ error: null }));
  spy.setHandler("session_sets", () => ({ error: null }));
  flushStarts.mockClear();
  vi.mocked(flush).mockClear();
  setOnline(true);
  signIn(USER);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(async () => {
  for (const h of handles) h.stop();
  handles = [];
  vi.useRealTimers();
  vi.restoreAllMocks();
  signOut();
  // One real macrotask turn so Node can report a rejection from this test before we detach.
  await realWait();
  process.off("unhandledRejection", onRejection);
  expect(rejections).toHaveLength(0);
});

describe("AC1 an online upsertSession flushes once, 250 ms after the commit", () => {
  it("no flush at 249 ms, exactly one at 250 ms, and it sends that row", async () => {
    const handle = start();

    await upsertSession(sessionRow());
    await vi.advanceTimersByTimeAsync(249);
    expect(flushStarts).toHaveBeenCalledTimes(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(flushStarts).toHaveBeenCalledTimes(1);

    await handle.settled();
    expect(sentSessionIds()).toEqual([SESSION_ID]);
    expect((await offlineDb().sessions.get(SESSION_ID))?.pending).toBe(false);

    await vi.advanceTimersByTimeAsync(1000);
    expect(flushStarts).toHaveBeenCalledTimes(1);
  });
});

describe("AC2 a burst of writes inside the window gives one flush", () => {
  it("recordSet, editSet, deleteSet at 0, 50, 100 ms → one flush, at 350 ms", async () => {
    const handle = start();

    const set = await recordSet(SET);
    await vi.advanceTimersByTimeAsync(50);
    await editSet(set.clientId, { reps: 9 });
    await vi.advanceTimersByTimeAsync(50);
    await deleteSet(set.clientId);

    await vi.advanceTimersByTimeAsync(249);
    expect(flushStarts).toHaveBeenCalledTimes(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(flushStarts).toHaveBeenCalledTimes(1);

    await handle.settled();
    expect(sentSetIds()).toEqual([set.clientId]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(flushStarts).toHaveBeenCalledTimes(1);
  });

  /** A queued set written straight to IDB, so the write under test is the only notify. */
  async function seededSet(): Promise<string> {
    const clientId = "c-seeded";
    const at = "2026-10-02T10:00:00.000Z";
    await offlineDb().sets.put({
      key: `${USER}:${clientId}`,
      userId: USER,
      clientId,
      sessionId: SESSION_ID,
      exerciseId: "back-squat",
      setIndex: 0,
      kind: "reps",
      reps: 8,
      weightKg: 60,
      durationS: null,
      rir: null,
      isWarmup: false,
      backoff: false,
      completedAt: at,
      editedAt: at,
      deletedAt: null,
      status: "queued",
    });
    return clientId;
  }

  const writes: Array<[string, () => Promise<unknown>]> = [
    ["recordSet", () => recordSet(SET)],
    ["editSet", async () => editSet(await seededSet(), { reps: 10 })],
    ["deleteSet", async () => deleteSet(await seededSet())],
  ];
  it.each(writes)("%s on its own notifies the handle", async (_name, write) => {
    const handle = start();
    await write();
    await vi.advanceTimersByTimeAsync(249);
    expect(flushStarts).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(flushStarts).toHaveBeenCalledTimes(1);
    await handle.settled();
    expect(sentSetIds().length).toBeGreaterThan(0);
  });
});

describe("AC3 the write never waits for the flush", () => {
  it("upsertSession resolves on the IDB commit while the send never settles", async () => {
    spy.setHandler("sessions", () => new Promise(() => undefined));
    start();

    const entry = await upsertSession(sessionRow());
    expect(entry.pending).toBe(true);
    expect(spy.calls).toHaveLength(0);
    expect(await offlineDb().sessions.get(SESSION_ID)).toBeDefined();

    // The flush does start afterwards, and hangs, without having held the write up.
    await vi.advanceTimersByTimeAsync(250);
    expect(flushStarts).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(spy.calls).toHaveLength(1));
  });
});

describe("AC4 offline at notify time", () => {
  it("offline: no flush after 1 s; the online event then flushes exactly once", async () => {
    setOnline(false);
    const handle = start();

    const set = await recordSet(SET);
    await vi.advanceTimersByTimeAsync(1000);
    expect(flushStarts).toHaveBeenCalledTimes(0);

    setOnline(true);
    window.dispatchEvent(new Event("online"));
    await handle.settled();
    expect(flushStarts).toHaveBeenCalledTimes(1);
    expect(sentSetIds()).toEqual([set.clientId]);

    await vi.advanceTimersByTimeAsync(1000);
    expect(flushStarts).toHaveBeenCalledTimes(1);
  });

  it("online (the other value): the same recordSet flushes at 250 ms", async () => {
    const handle = start();
    const set = await recordSet(SET);
    await vi.advanceTimersByTimeAsync(250);
    expect(flushStarts).toHaveBeenCalledTimes(1);
    await handle.settled();
    expect(sentSetIds()).toEqual([set.clientId]);
  });
});

describe("AC5 no running handle", () => {
  it("never started: upsertSession then 1 s gives no flush", async () => {
    await upsertSession(sessionRow());
    await vi.advanceTimersByTimeAsync(1000);
    expect(flushStarts).toHaveBeenCalledTimes(0);
    expect(spy.calls).toHaveLength(0);
  });

  it("stopped: upsertSession then 1 s gives no flush; a live handle does flush it", async () => {
    const stopped = startSync({ tz: "UTC" });
    stopped.stop();

    await upsertSession(sessionRow());
    await vi.advanceTimersByTimeAsync(1000);
    expect(flushStarts).toHaveBeenCalledTimes(0);

    // Positive control: a running handle on the same queue does flush on the next write.
    const live = start();
    await upsertSession(sessionRow());
    await vi.advanceTimersByTimeAsync(250);
    expect(flushStarts).toHaveBeenCalledTimes(1);
    await live.settled();
    expect(sentSessionIds()).toEqual([SESSION_ID]);
  });

  it("stop() at 100 ms cancels the pending debounce: no flush at 250 ms", async () => {
    const handle = startSync({ tz: "UTC" });
    await upsertSession(sessionRow());
    await vi.advanceTimersByTimeAsync(100);
    handle.stop();

    await vi.advanceTimersByTimeAsync(150);
    expect(flushStarts).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(flushStarts).toHaveBeenCalledTimes(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("signed out: the write rejects and no flush runs (signed in is AC1)", async () => {
    start();
    signOut();
    await expect(recordSet(SET)).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(1000);
    expect(flushStarts).toHaveBeenCalledTimes(0);
  });
});

describe("AC6 at most one enqueue-triggered flush in flight", () => {
  it("a write during a hanging flush starts exactly one more once it settles", async () => {
    let release: (() => void) | null = null;
    spy.setHandler(
      "session_sets",
      () =>
        new Promise<{ error: null }>((resolve) => {
          release = () => resolve({ error: null });
        }),
    );
    const handle = start();

    const first = await recordSet(SET);
    await vi.advanceTimersByTimeAsync(250);
    expect(flushStarts).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(release).not.toBeNull());

    const second = await recordSet({ ...SET, setIndex: 1 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(flushStarts).toHaveBeenCalledTimes(1);

    // From here every send resolves at once.
    spy.setHandler("session_sets", () => ({ error: null }));
    release!();
    await handle.settled();

    expect(flushStarts).toHaveBeenCalledTimes(2);
    expect(sentSetIds()).toEqual([first.clientId, second.clientId]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(flushStarts).toHaveBeenCalledTimes(2);
  });

  it("a write after the flush settled (not in flight) debounces again as normal", async () => {
    const handle = start();
    await recordSet(SET);
    await vi.advanceTimersByTimeAsync(250);
    await handle.settled();
    expect(flushStarts).toHaveBeenCalledTimes(1);

    await recordSet({ ...SET, setIndex: 1 });
    await vi.advanceTimersByTimeAsync(249);
    expect(flushStarts).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(flushStarts).toHaveBeenCalledTimes(2);
    await handle.settled();
  });
});

describe("AC7 failures", () => {
  it("network-error: the RetryScheduler's 2 s retry is the only follow-up", async () => {
    spy.setHandler("session_sets", () => {
      throw new TypeError("Failed to fetch");
    });
    const handle = start();

    await recordSet(SET);
    await vi.advanceTimersByTimeAsync(250);
    expect(flushStarts).toHaveBeenCalledTimes(1);
    await handle.settled();
    expect(await vi.mocked(flush).mock.results[0]!.value).toBe("network-error");
    // Only the backoff timer is pending: this path added no flush of its own.
    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(1999);
    expect(flushStarts).toHaveBeenCalledTimes(1);
    spy.setHandler("session_sets", () => ({ error: null }));
    await vi.advanceTimersByTimeAsync(1);
    expect(flushStarts).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => expect(sentSetIds()).toHaveLength(1));
  });

  it("a rejecting flush is swallowed: no unhandled rejection, and settled() resolves", async () => {
    vi.mocked(flush).mockImplementationOnce(() => {
      flushStarts();
      return Promise.reject(new Error("refetch failed"));
    });
    const handle = start();

    await recordSet(SET);
    await vi.advanceTimersByTimeAsync(250);
    expect(flushStarts).toHaveBeenCalledTimes(1);
    await expect(handle.settled()).resolves.toBeUndefined();

    vi.useRealTimers();
    await realWait();
    expect(rejections).toHaveLength(0);

    // The single-flight flag was released: the next write still flushes.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await recordSet({ ...SET, setIndex: 1 });
    await vi.advanceTimersByTimeAsync(250);
    expect(flushStarts).toHaveBeenCalledTimes(2);
    await handle.settled();
    expect(sentSetIds()).toHaveLength(2);
  });
});

describe("AC8 a failed IDB write", () => {
  it("recordSet rejects as today and no flush runs", async () => {
    start();
    vi.spyOn(offlineDb().sets, "put").mockRejectedValueOnce(new Error("QuotaExceededError"));

    await expect(recordSet(SET)).rejects.toThrow("QuotaExceededError");
    await vi.advanceTimersByTimeAsync(1000);
    expect(flushStarts).toHaveBeenCalledTimes(0);
  });

  it("upsertSession rejects as today and no flush runs", async () => {
    start();
    vi.spyOn(offlineDb().sessions, "put").mockRejectedValueOnce(new Error("AbortError"));

    await expect(upsertSession(sessionRow())).rejects.toThrow("AbortError");
    await vi.advanceTimersByTimeAsync(1000);
    expect(flushStarts).toHaveBeenCalledTimes(0);
  });
});

describe("rework: a session re-queued while its flush is in flight is not lost (D-0053 §7)", () => {
  /** A `sessions` handler that hangs until `release()`; later calls resolve at once. */
  function hangFirstSessionsSend(): { release: () => void; started: () => boolean } {
    let release: (() => void) | null = null;
    let calls = 0;
    spy.setHandler("sessions", () => {
      calls += 1;
      if (calls > 1) return { error: null };
      return new Promise<{ error: null }>((resolve) => {
        release = () => resolve({ error: null });
      });
    });
    return { release: () => release!(), started: () => release !== null };
  }

  const ENDED_AT = "2026-10-02T10:40:00.000Z";

  it("a Finish during the in-flight send is sent next and stored finished, pending=false", async () => {
    const hang = hangFirstSessionsSend();
    const handle = start();

    await upsertSession(sessionRow());
    await vi.advanceTimersByTimeAsync(250);
    await vi.waitFor(() => expect(hang.started()).toBe(true));

    // Finish lands while the first request is still in flight.
    await upsertSession({ ...sessionRow(), ended_at: ENDED_AT });
    await vi.advanceTimersByTimeAsync(1000);
    expect(flushStarts).toHaveBeenCalledTimes(1);

    hang.release();
    await handle.settled();

    const sends = spy.calls.filter((c) => c.table === "sessions");
    expect(sends).toHaveLength(2);
    expect((sends[0]!.rows[0] as { ended_at?: string | null }).ended_at ?? null).toBeNull();
    expect((sends[1]!.rows[0] as { ended_at?: string | null }).ended_at).toBe(ENDED_AT);

    const stored = await offlineDb().sessions.get(SESSION_ID);
    expect(stored).toMatchObject({ pending: false, finished: true });
    expect(stored!.row.ended_at).toBe(ENDED_AT);
  });

  it("the pair: no write during the send still clears pending, with one request", async () => {
    const hang = hangFirstSessionsSend();
    const handle = start();

    await upsertSession(sessionRow());
    await vi.advanceTimersByTimeAsync(250);
    await vi.waitFor(() => expect(hang.started()).toBe(true));
    hang.release();
    await handle.settled();

    expect(spy.calls.filter((c) => c.table === "sessions")).toHaveLength(1);
    const stored = await offlineDb().sessions.get(SESSION_ID);
    expect(stored).toMatchObject({ pending: false, finished: false });
    expect(stored!.row).toEqual(sessionRow());
  });

  it("flush() directly: a re-queue during the request stays pending with the newer row", async () => {
    spy.setHandler("sessions", async () => {
      await upsertSession({ ...sessionRow(), ended_at: ENDED_AT });
      return { error: null };
    });
    await upsertSession(sessionRow());

    await flush(USER);

    const stored = await offlineDb().sessions.get(SESSION_ID);
    expect(stored).toMatchObject({ pending: true, finished: true });
    expect(stored!.row.ended_at).toBe(ENDED_AT);
  });

  it("flush() directly, the pair: an identical re-queue (same content) is cleared", async () => {
    spy.setHandler("sessions", async () => {
      // Same fields, different key order: still the row that was sent.
      const { time_budget_min, ...rest } = sessionRow();
      await upsertSession({ time_budget_min, ...rest });
      return { error: null };
    });
    await upsertSession(sessionRow());

    await flush(USER);

    expect(await offlineDb().sessions.get(SESSION_ID)).toMatchObject({ pending: false });
  });
});

describe("rework: a throwing onQueueWrite listener never fails the write", () => {
  it("recordSet and upsertSession still resolve, and other listeners still run", async () => {
    const after = vi.fn();
    const offThrowing = onQueueWrite(() => {
      throw new Error("listener boom");
    });
    const offAfter = onQueueWrite(after);
    try {
      const set = await recordSet(SET);
      expect(await offlineDb().sets.get(set.key)).toBeDefined();
      const session = await upsertSession(sessionRow());
      expect(session.pending).toBe(true);
      expect(after).toHaveBeenCalledTimes(2);
    } finally {
      offThrowing();
      offAfter();
    }
  });

  it("the pair: with no throwing listener, the same writes resolve and notify", async () => {
    const after = vi.fn();
    const off = onQueueWrite(after);
    try {
      await recordSet(SET);
      await upsertSession(sessionRow());
      expect(after).toHaveBeenCalledTimes(2);
    } finally {
      off();
    }
  });
});

describe("rework: a network-error that resolves after stop() schedules no retry", () => {
  function hangThenNetworkError(): { fail: () => void; started: () => boolean } {
    let fail: (() => void) | null = null;
    spy.setHandler(
      "session_sets",
      () =>
        new Promise<never>((_resolve, reject) => {
          fail = () => reject(new TypeError("Failed to fetch"));
        }),
    );
    return { fail: () => fail!(), started: () => fail !== null };
  }

  it("stopped while in flight: no backoff timer and no further flush", async () => {
    const net = hangThenNetworkError();
    const handle = start();
    await recordSet(SET);
    await vi.advanceTimersByTimeAsync(250);
    await vi.waitFor(() => expect(net.started()).toBe(true));

    handle.stop();
    net.fail();
    await handle.settled();

    expect(await vi.mocked(flush).mock.results[0]!.value).toBe("network-error");
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(flushStarts).toHaveBeenCalledTimes(1);
  });

  it("the pair: still running, the same network-error arms the 2 s retry", async () => {
    const net = hangThenNetworkError();
    const handle = start();
    await recordSet(SET);
    await vi.advanceTimersByTimeAsync(250);
    await vi.waitFor(() => expect(net.started()).toBe(true));

    net.fail();
    await handle.settled();

    expect(vi.getTimerCount()).toBe(1);
    spy.setHandler("session_sets", () => ({ error: null }));
    await vi.advanceTimersByTimeAsync(2000);
    expect(flushStarts).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => expect(sentSetIds()).toHaveLength(2));
  });
});
