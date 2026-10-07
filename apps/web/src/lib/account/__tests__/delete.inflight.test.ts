// T-0531 (D-0195, D-0136): a cache refresh in flight when the account is deleted must not write
// its rows after the wipe.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountClient } from "../deps.js";
import { U } from "./fixtures.js";

const h = vi.hoisted(() => ({
  gate: Promise.resolve() as Promise<void>,
  open: () => undefined as void,
}));

const TARGETS = [
  { area_id: "quads", sets_per_14d: 10, source: "default", updated_at: "2026-09-01T00:00:00.000Z" },
];
function query() {
  const result = async () => {
    await h.gate;
    return { data: TARGETS, error: null };
  };
  return {
    gte: () => result(),
    maybeSingle: async () => ({ data: null, error: null }),
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => result().then(res, rej),
  };
}
vi.mock("../../auth/client.js", () => ({
  isSupabaseConfigured: () => true,
  supabase: { from: () => ({ select: () => query() }) },
}));

const history = await import("../../offline/history.js");
const { freshOfflineDb, signIn, signOut } = await import("../../offline/__tests__/test-helpers.js");
const { deleteAccountAndSignOut, wipeLocalUserData } = await import("../index.js");

const unhandled: unknown[] = [];
const onUnhandled = (e: unknown) => unhandled.push(e);

function client(onSignOut?: () => void): AccountClient {
  return {
    auth: {
      getSession: async () => ({
        data: { session: { access_token: "tok", user: { id: U } } },
        error: null,
      }),
      signOut: async () => {
        onSignOut?.();
        return { error: null };
      },
    },
  } as unknown as AccountClient;
}

const fetch204 = (async () => new Response(null, { status: 204 })) as typeof globalThis.fetch;

async function targets(db: ReturnType<typeof freshOfflineDb>): Promise<number> {
  return db.targetCache.where("userId").equals(U).count();
}

beforeEach(() => {
  unhandled.length = 0;
  process.on("unhandledRejection", onUnhandled);
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-k");
  h.gate = new Promise<void>((resolve) => {
    h.open = resolve;
  });
  signIn(U);
});

afterEach(() => {
  process.off("unhandledRejection", onUnhandled);
  vi.unstubAllEnvs();
  signOut();
});

describe("T-0531 deleteAccountAndSignOut vs an in-flight refresh", () => {
  it("control: without a delete the refresh writes its cache", async () => {
    const db = freshOfflineDb();
    const refresh = history.refreshTargets();
    h.open();
    await refresh;
    expect(await targets(db)).toBeGreaterThan(0);
  });

  it("T-0531 AC-1 a refresh that resolves after the wipe writes nothing", async () => {
    const db = freshOfflineDb();
    const refresh = history.refreshTargets();
    const outcome = await deleteAccountAndSignOut(
      { userId: U },
      { supabase: client(), db, fetch: fetch204 },
    );
    expect(outcome).toBe("deleted");
    h.open();
    await expect(refresh).resolves.toBeUndefined();
    await new Promise((r) => setTimeout(r, 0));
    expect(await targets(db)).toBe(0);
    expect(unhandled).toEqual([]);
  });

  it("T-0531 AC-1 a refresh started while signOut is awaited writes nothing", async () => {
    const db = freshOfflineDb();
    let refresh: Promise<void> = Promise.resolve();
    await deleteAccountAndSignOut(
      { userId: U },
      {
        supabase: client(() => {
          refresh = history.refreshTargets();
        }),
        db,
        fetch: fetch204,
      },
    );
    h.open();
    await refresh;
    await new Promise((r) => setTimeout(r, 0));
    expect(await targets(db)).toBe(0);
  });

  it("T-0531 AC-1 wipeLocalUserData called alone also invalidates the refresh", async () => {
    const db = freshOfflineDb();
    const refresh = history.refreshTargets();
    await wipeLocalUserData(U, { db });
    h.open();
    await refresh;
    await new Promise((r) => setTimeout(r, 0));
    expect(await targets(db)).toBe(0);
  });
});
