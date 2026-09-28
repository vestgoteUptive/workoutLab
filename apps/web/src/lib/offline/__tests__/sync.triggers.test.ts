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
const { markAuthBlocked } = await import("../flush.js");
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

/** Lets the queued microtasks from a fire-and-forget event handler settle. */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
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

afterEach(() => signOut());

describe("the online event listener (AC-C9, AC-C10)", () => {
  it("a real window 'online' event flushes the queue", async () => {
    const db = offlineDb();
    await db.sets.put(setRow("c-1", "2026-09-28T10:00:00.000Z"));

    const handle = startSync({ tz: "UTC" });
    try {
      window.dispatchEvent(new Event("online"));
      await settle();

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
      await settle();

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
    await settle();

    expect(spy.calls).toHaveLength(0);
    expect(await db.sets.count()).toBe(1);
    expect(unsubscribe).toHaveBeenCalled();
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
        await settle();

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
      await settle();

      expect(spy.calls).toHaveLength(0);
      expect(await db.sets.count()).toBe(1);
    } finally {
      handle.stop();
    }
  });
});
