// The event glue in `sync.ts` (AC-C8 2nd half, AC-C9, AC-C10 "an online event flushes
// immediately"). `retry.test.ts` covers the RetryScheduler in isolation and `flush.test.ts`
// covers flush() called directly; neither ever fires a real `online` event or invokes the
// `onAuthStateChange` callback, so the listeners registered in `startSync()` were unverified.
//
// These tests drive the *real* wiring: `window.dispatchEvent(new Event("online"))` and the
// callback that `startSync` handed to `supabase.auth.onAuthStateChange`.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseSpy } from "./supabase-spy.js";

const spy = createSupabaseSpy();

/** Captures the callback `startSync()` registers, so a test can emit auth events like supabase-js. */
type AuthEvent = "SIGNED_IN" | "TOKEN_REFRESHED" | "SIGNED_OUT";
type AuthCallback = (event: AuthEvent, session: { user: { id: string } } | null) => void;
let authCallback: AuthCallback | null = null;
const unsubscribe = vi.fn();

const onAuthStateChange = vi.fn((cb: AuthCallback) => {
  authCallback = cb;
  return { data: { subscription: { unsubscribe } } };
});

vi.mock("../../auth/client.js", () => ({
  supabase: { from: spy.from, auth: { onAuthStateChange } },
}));

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
type SyncHandle = import("../sync.js").SyncHandle;
const { markAuthBlocked, clearAuthBlocked } = await import("../flush.js");
const { offlineDb } = await import("../db.js");
const { freshOfflineDb, signIn, signOut } = await import("./test-helpers.js");

const USER = "11111111-1111-4111-8111-111111111111";

function setRow(clientId: string, editedAt: string) {
  return {
    key: `${USER}:${clientId}`,
    userId: USER,
    clientId,
    sessionId: "S1",
    exerciseId: "back-squat",
    setIndex: 0,
    kind: "reps" as const,
    reps: 8,
    weightKg: 60,
    durationS: null,
    rir: null,
    isWarmup: false,
    backoff: false,
    completedAt: editedAt,
    editedAt,
    deletedAt: null,
    status: "queued" as const,
  };
}

/** Waits for the work an event handler kicked off, by awaiting the handle's own in-flight
 *  tracking rather than guessing at a number of ticks.
 *
 *  Draining microtasks (the previous approach) can never be correct here: IndexedDB requests
 *  complete on the *macrotask* queue, so `await Promise.resolve()` in a loop returns before Dexie
 *  has done anything at all, and the single trailing `setTimeout(0)` only happened to be enough
 *  when the worker was idle. Under a full suite it wasn't, and the flush landed in the *next*
 *  test — which is exactly the T-0311 flake. `settled()` is an actual completion signal. */
async function settle(handle: SyncHandle): Promise<void> {
  await handle.settled();
}

beforeEach(() => {
  freshOfflineDb();
  authCallback = null;
  spy.calls.length = 0;
  spy.from.mockClear();
  spy.deleteSpy.mockClear();
  onAuthStateChange.mockClear();
  unsubscribe.mockClear();
  spy.setHandler("sessions", () => ({ error: null }));
  spy.setHandler("session_sets", () => ({ error: null }));
  signIn(USER);
});

afterEach(() => {
  signOut();
  // `authBlocked` in flush.js is module-level state that outlives a test. Clearing it here, in
  // teardown, means each test hands back a clean module rather than depending on what ran before
  // it (clearing in `beforeEach` instead would leave the block set for whoever ran next).
  clearAuthBlocked(USER);
});

describe("the online event listener (AC-C9, AC-C10)", () => {
  it("a real window 'online' event flushes the queue", async () => {
    const db = offlineDb();
    await db.sets.put(setRow("c-1", "2026-09-28T10:00:00.000Z"));

    const handle = startSync({ tz: "UTC" });
    try {
      window.dispatchEvent(new Event("online"));
      await settle(handle);

      expect(spy.calls.some((c) => c.table === "session_sets")).toBe(true);
      expect(await db.sets.count()).toBe(0);
    } finally {
      handle.stop();
    }
  });

  it("40 sets queued 10 days ago all flush on a real 'online' event (AC-C9)", async () => {
    const db = offlineDb();
    await db.sets.bulkPut(
      Array.from({ length: 40 }, (_, i) =>
        setRow(`c-${i}`, `2026-09-18T10:${String(i).padStart(2, "0")}:00.000Z`),
      ),
    );
    // No TTL: everything queued 10 days ago is still there.
    expect(await db.sets.count()).toBe(40);

    const handle = startSync({ tz: "UTC" });
    try {
      window.dispatchEvent(new Event("online"));
      await settle(handle);

      const sent = spy.calls
        .filter((c) => c.table === "session_sets")
        .flatMap((c) => c.rows as Array<{ client_id: string }>);
      expect(sent).toHaveLength(40);
      expect(await db.sets.count()).toBe(0);
    } finally {
      handle.stop();
    }
  });

  it("stop() removes the listener, so a later 'online' event flushes nothing", async () => {
    const db = offlineDb();
    await db.sets.put(setRow("c-1", "2026-09-28T10:00:00.000Z"));

    const handle = startSync({ tz: "UTC" });
    handle.stop();

    window.dispatchEvent(new Event("online"));
    // A stopped handle tracks nothing, so `settled()` resolves immediately and on its own would
    // prove nothing (it would also pass if the event were simply slow). The positive control
    // below is what gives this test teeth: a *live* handle on the same queue must flush the row.
    await settle(handle);

    expect(spy.calls).toHaveLength(0);
    expect(await db.sets.count()).toBe(1);
    expect(unsubscribe).toHaveBeenCalled();

    // Positive control: the row really is flushable and an `online` event really does reach a
    // listener that is still registered. So the assertions above pin `stop()`'s teardown, not a
    // queue that was empty or an event that never fired.
    const live = startSync({ tz: "UTC" });
    try {
      window.dispatchEvent(new Event("online"));
      await settle(live);

      expect(spy.calls.some((c) => c.table === "session_sets")).toBe(true);
      expect(await db.sets.count()).toBe(0);
    } finally {
      live.stop();
    }
  });
});

describe("the onAuthStateChange listener (AC-C8, 2nd half)", () => {
  it.each(["SIGNED_IN", "TOKEN_REFRESHED"] as const)(
    "%s clears the auth block and flushes every row automatically",
    async (event) => {
      const db = offlineDb();
      await db.sets.put(setRow("c-1", "2026-09-28T10:00:00.000Z"));
      await db.sets.put(setRow("c-2", "2026-09-28T10:01:00.000Z"));
      // A prior 401 blocked this user's queue.
      markAuthBlocked(USER);

      const handle = startSync({ tz: "UTC" });
      try {
        expect(onAuthStateChange).toHaveBeenCalledTimes(1);
        expect(authCallback).toBeTypeOf("function");

        // A flush while still blocked sends nothing.
        await handle.flushNow();
        expect(spy.calls).toHaveLength(0);

        // supabase-js emits the event: the real callback runs.
        authCallback!(event, { user: { id: USER } });
        await settle(handle);

        const sent = spy.calls
          .filter((c) => c.table === "session_sets")
          .flatMap((c) => c.rows as Array<{ client_id: string }>);
        expect(sent.map((r) => r.client_id).sort()).toEqual(["c-1", "c-2"]);
        expect(await db.sets.count()).toBe(0);
      } finally {
        handle.stop();
      }
    },
  );

  it("SIGNED_OUT neither unblocks nor flushes", async () => {
    const db = offlineDb();
    await db.sets.put(setRow("c-1", "2026-09-28T10:00:00.000Z"));
    markAuthBlocked(USER);

    const handle = startSync({ tz: "UTC" });
    try {
      authCallback!("SIGNED_OUT", null);
      await settle(handle);

      expect(spy.calls).toHaveLength(0);
      expect(await db.sets.count()).toBe(1);
    } finally {
      handle.stop();
    }
  });
});
