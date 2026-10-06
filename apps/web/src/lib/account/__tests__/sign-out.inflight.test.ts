// T-0530 (D-0195): a cache refresh in flight when sign-out starts must not write after the clear.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountClient } from "../deps.js";
import { U } from "./fixtures.js";

type Result = { data: unknown; error: null };
let release: (r: Result) => void = () => undefined;

// Both refreshes below wait on one deferred fetch, so the test decides when it resolves.
function deferredQuery() {
  const pending = new Promise<Result>((resolve) => {
    release = resolve;
  });
  return {
    gte: () => pending,
    maybeSingle: () => pending,
  };
}
const from = vi.fn(() => ({ select: () => deferredQuery() }));
vi.mock("../../auth/client.js", () => ({ supabase: { from } }));

const { refreshHistory, refreshProfile } = await import("../../offline/history.js");
const { freshOfflineDb, signIn, signOut } = await import("../../offline/__tests__/test-helpers.js");
const { signOutAndClearDevice } = await import("../index.js");

const SET_ROW = {
  client_id: "c-1",
  session_id: "S1",
  exercise_id: "back-squat",
  is_warmup: false,
  completed_at: "2026-10-20T10:00:00.000Z",
  edited_at: "2026-10-20T10:00:00.000Z",
  deleted_at: null,
  reps: 8,
  weight_kg: 60,
  duration_s: null,
};
const PROFILE_ROW = {
  goal: "build_muscle",
  level: "beginner",
  equipment: [],
  rhythm_min: 3,
  rhythm_max: 4,
  priority_areas: [],
  onboarded_at: "2026-09-01T00:00:00.000Z",
  plan_changed_at: "2026-09-01T00:00:00.000Z",
};

const client = {
  auth: { signOut: vi.fn(async () => ({ error: null })) },
} as unknown as AccountClient;
const unhandled: unknown[] = [];
const onUnhandled = (e: unknown) => unhandled.push(e);

beforeEach(() => {
  unhandled.length = 0;
  process.on("unhandledRejection", onUnhandled);
  freshOfflineDb();
  signIn(U);
});

afterEach(() => {
  process.off("unhandledRejection", onUnhandled);
  signOut();
});

describe("T-0530 sign-out vs an in-flight refresh", () => {
  it("T-0530 AC-1 AC-2 a history refresh whose fetch resolves after the clear writes no rows and does not reject", async () => {
    const db = freshOfflineDb();
    const refresh = refreshHistory(new Date("2026-10-26T08:00:00Z"), "Europe/Stockholm");
    const result = await signOutAndClearDevice({ userId: U }, { supabase: client, db });
    expect(result).toEqual({ cleared: true });

    release({ data: [SET_ROW], error: null });
    await expect(refresh).resolves.toBeUndefined();
    await new Promise((r) => setTimeout(r, 0));

    expect(await db.historyCache.where({ userId: U }).count()).toBe(0);
    expect(await db.syncMeta.get(U)).toBeUndefined();
    expect(unhandled).toEqual([]);
  });

  it("T-0530 AC-1 AC-2 a profile refresh (single put) resolving after the clear writes nothing", async () => {
    const db = freshOfflineDb();
    const refresh = refreshProfile();
    await signOutAndClearDevice({ userId: U }, { supabase: client, db });

    release({ data: PROFILE_ROW, error: null });
    await expect(refresh).resolves.toBeUndefined();
    await new Promise((r) => setTimeout(r, 0));

    expect(await db.profileCache.get(U)).toBeUndefined();
    expect(unhandled).toEqual([]);
  });

  it("T-0530 a refresh started after sign-out (the next sign-in) writes normally", async () => {
    const db = freshOfflineDb();
    await signOutAndClearDevice({ userId: U }, { supabase: client, db });

    const refresh = refreshProfile();
    release({ data: PROFILE_ROW, error: null });
    await refresh;

    expect(await db.profileCache.get(U)).toBeDefined();
  });
});
