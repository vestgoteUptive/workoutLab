// AC-C12: user isolation, sign-out doesn't clear the queue.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseSpy } from "./supabase-spy.js";

const spy = createSupabaseSpy();
vi.mock("../../auth/client.js", () => ({ supabase: { from: spy.from } }));

const { flush, clearAuthBlocked } = await import("../flush.js");
const { recordSet } = await import("../queue.js");
const { loadEngineHistory } = await import("../engine-feed.js");
const { offlineDb } = await import("../db.js");
const { freshOfflineDb, signIn, signOut } = await import("./test-helpers.js");

const USER_A = "aaaaaaaa-1111-4111-8111-111111111111";
const USER_B = "bbbbbbbb-2222-4222-8222-222222222222";

beforeEach(() => {
  freshOfflineDb();
  spy.calls.length = 0;
  spy.setHandler("sessions", () => ({ error: null }));
  spy.setHandler("session_sets", () => ({ error: null }));
  clearAuthBlocked(USER_A);
  clearAuthBlocked(USER_B);
});

afterEach(() => signOut());

describe("AC-C12 user isolation", () => {
  it("B's flush and engine feed never include A's rows; A's rows survive sign-out", async () => {
    signIn(USER_A);
    await recordSet(
      {
        sessionId: "S1",
        exerciseId: "back-squat",
        setIndex: 0,
        kind: "reps",
        reps: 8,
        weightKg: 60,
        isWarmup: false,
        backoff: false,
      },
      { now: new Date("2026-09-28T10:00:00.000Z") },
    );
    await recordSet(
      {
        sessionId: "S1",
        exerciseId: "back-squat",
        setIndex: 1,
        kind: "reps",
        reps: 8,
        weightKg: 60,
        isWarmup: false,
        backoff: false,
      },
      { now: new Date("2026-09-28T10:01:00.000Z") },
    );

    signOut();
    signIn(USER_B);

    await flush(USER_B);
    const setCalls = spy.calls.filter((c) => c.table === "session_sets");
    expect(setCalls).toHaveLength(0);

    const bHistory = await loadEngineHistory();
    expect(bHistory).toHaveLength(0);

    signOut();
    signIn(USER_A);
    const db = offlineDb();
    expect(await db.sets.where({ userId: USER_A }).count()).toBe(2);

    spy.calls.length = 0;
    await flush(USER_A);
    const aSetCalls = spy.calls.filter((c) => c.table === "session_sets");
    expect(aSetCalls).toHaveLength(1);
    expect(
      (aSetCalls[0]!.rows as Array<{ user_id: string }>).every((r) => r.user_id === USER_A),
    ).toBe(true);
  });
});
