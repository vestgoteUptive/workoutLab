// T-0528 (D-0195 §2-§3, GitHub #35, UF-11.4): signOutAndClearDevice and hasUnsyncedWork.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { OfflineDb } from "../../offline/db.js";
import { freshOfflineDb } from "../../offline/__tests__/test-helpers.js";
import { hasUnsyncedWork, signOutAndClearDevice } from "../index.js";
import type { AccountClient } from "../deps.js";
import { U, V } from "./fixtures.js";
import { OFFLINE_TABLES, countFor, seedBothUsers } from "./dexie-seed.js";

const CACHES = OFFLINE_TABLES.filter((t) => t !== "sessions" && t !== "sets");

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

function fakeClient(log: string[] = [], impl?: () => Promise<{ error: unknown }>) {
  const signOut = vi.fn(async (options: { scope: "local" | "global" | "others" }) => {
    log.push(`signOut(${JSON.stringify(options)})`);
    return impl ? impl() : { error: null };
  });
  return {
    signOut,
    client: { auth: { signOut } } as unknown as AccountClient,
  };
}

function seedStorage(): void {
  window.localStorage.setItem("wl-last-email", "u@test.local");
  window.localStorage.setItem("wl-onboarding", "{}");
  window.localStorage.setItem("wl-focus-prefs", "{}");
  window.localStorage.setItem("other-app", "keep");
  window.sessionStorage.setItem("wl-return-to", "/plan");
}

describe("T-0528 signOutAndClearDevice", () => {
  it("T-0528 AC-1 clears U's caches and wl- keys; the queue and V's rows stay", async () => {
    await seedBothUsers(db);
    await db.sets.update(`${U}:sets`, { status: "queued" });
    seedStorage();
    const { client } = fakeClient();

    const result = await signOutAndClearDevice(
      { userId: U },
      {
        supabase: client,
        db,
        localStorage: window.localStorage,
        sessionStorage: window.sessionStorage,
      },
    );

    expect(result).toEqual({ cleared: true });
    for (const t of CACHES) {
      expect(await countFor(db, t, U), `${t} U`).toBe(0);
      expect(await countFor(db, t, V), `${t} V`).toBe(1);
    }
    for (const t of ["sessions", "sets"]) {
      expect(await countFor(db, t, U), `${t} U`).toBe(1);
      expect(await countFor(db, t, V), `${t} V`).toBe(1);
    }
    expect(window.localStorage.length).toBe(1);
    expect(window.localStorage.getItem("other-app")).toBe("keep");
    expect(window.sessionStorage.length).toBe(0);
  });

  it("T-0528 AC-2 calls signOut once with { scope: local }, before the Dexie delete and the storage removal", async () => {
    await seedBothUsers(db);
    seedStorage();
    const log: string[] = [];
    const { client, signOut } = fakeClient(log);
    const realTx = db.transaction.bind(db) as (...a: unknown[]) => Promise<unknown>;
    vi.spyOn(db, "transaction").mockImplementation(((...args: unknown[]) => {
      log.push("dexie transaction");
      return realTx(...args);
    }) as never);
    const removeItem = vi.spyOn(Storage.prototype, "removeItem");
    removeItem.mockImplementation(function () {
      if (!log.includes("storage removal")) log.push("storage removal");
    });

    await signOutAndClearDevice({ userId: U }, { supabase: client, db });

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(log).toEqual(['signOut({"scope":"local"})', "dexie transaction", "storage removal"]);
  });

  it("T-0528 AC-3 offline with real supabase-js: the local session is gone and the caches are cleared", async () => {
    await seedBothUsers(db);
    const store = new Map<string, string>();
    const memory = {
      get length() {
        return store.size;
      },
      key: (i: number) => [...store.keys()][i] ?? null,
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    } as Storage;
    const client = createClient("https://abcdefgh.supabase.co", "anon-key", {
      auth: {
        storage: memory,
        persistSession: true,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: { fetch: () => Promise.reject(new TypeError("Failed to fetch")) },
    });
    const storageKey = "sb-abcdefgh-auth-token";
    store.set(
      storageKey,
      JSON.stringify({
        access_token: "at",
        refresh_token: "rt",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: U, aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "" },
      }),
    );
    expect((await client.auth.getSession()).data.session).not.toBeNull();

    await signOutAndClearDevice(
      { userId: U },
      {
        supabase: client as unknown as AccountClient,
        db,
        localStorage: window.localStorage,
        sessionStorage: window.sessionStorage,
      },
    );

    expect((await client.auth.getSession()).data.session).toBeNull();
    expect(store.has(storageKey)).toBe(false);
    for (const t of CACHES) expect(await countFor(db, t, U), t).toBe(0);
  });

  it("T-0528 AC-5 a rejecting Dexie transaction resolves cleared:false, signOut ran first, wl- keys still go", async () => {
    seedStorage();
    const log: string[] = [];
    const { client, signOut } = fakeClient(log);
    vi.spyOn(db, "transaction").mockRejectedValue(new Error("idb boom") as never);

    const result = await signOutAndClearDevice({ userId: U }, { supabase: client, db });

    expect(result).toEqual({ cleared: false });
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem("wl-last-email")).toBeNull();
    expect(window.localStorage.getItem("other-app")).toBe("keep");
    expect(window.sessionStorage.getItem("wl-return-to")).toBeNull();
  });

  it("T-0528 AC-5 a throwing localStorage.removeItem resolves cleared:false; U's rows are still deleted", async () => {
    await seedBothUsers(db);
    seedStorage();
    const { client } = fakeClient();
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("denied");
    });

    const result = await signOutAndClearDevice({ userId: U }, { supabase: client, db });

    expect(result).toEqual({ cleared: false });
    for (const t of CACHES) expect(await countFor(db, t, U), t).toBe(0);
  });

  it("T-0528 AC-5 a rejecting signOut still resolves and clears U's rows", async () => {
    await seedBothUsers(db);
    const { client } = fakeClient([], () => Promise.reject(new Error("boom")));

    await expect(signOutAndClearDevice({ userId: U }, { supabase: client, db })).resolves.toEqual({
      cleared: true,
    });
    for (const t of CACHES) expect(await countFor(db, t, U), t).toBe(0);
  });
});

describe("T-0528 AC-4 hasUnsyncedWork", () => {
  const set = (key: string, userId: string, status: string) =>
    db.table("sets").put({ key, id: key, userId, status });
  const session = (id: string, userId: string, pending: boolean) =>
    db.table("sessions").put({ id, userId, pending, finished: false, row: {} });

  it("T-0528 AC-4 empty is false", async () => {
    expect(await hasUnsyncedWork(U, { db })).toBe(false);
  });

  it("T-0528 AC-4 rejected sets, non-pending sessions and other users' queued sets don't count; U's queued set does", async () => {
    await set("s1", U, "rejected");
    await session("a", U, false);
    expect(await hasUnsyncedWork(U, { db })).toBe(false);
    await set("s2", V, "queued");
    expect(await hasUnsyncedWork(U, { db })).toBe(false);
    await set("s3", U, "queued");
    expect(await hasUnsyncedWork(U, { db })).toBe(true);
  });

  it("T-0528 AC-4 a pending session alone is true", async () => {
    await session("b", U, true);
    expect(await hasUnsyncedWork(U, { db })).toBe(true);
  });

  it("T-0528 AC-4 a failing sets read resolves false", async () => {
    vi.spyOn(db.sets, "where").mockImplementation(() => {
      throw new Error("idb boom");
    });
    await expect(hasUnsyncedWork(U, { db })).resolves.toBe(false);
  });
});
