// T-0310c AC7 (D-0135 §1, §6) and AC9 (D-0136 §4): the delete request and the step order.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OfflineDb } from "../../offline/db.js";
import { freshOfflineDb } from "../../offline/__tests__/test-helpers.js";
import type { AccountClient } from "../deps.js";
import {
  ACCOUNT_DELETED_KEY,
  deleteAccountAndSignOut,
  requestAccountDeletion,
  wipeLocalUserData,
} from "../index.js";
import { OFFLINE_TABLES, countFor, seedBothUsers } from "./dexie-seed.js";
import { U, V } from "./fixtures.js";

type FetchSpy = ReturnType<typeof vi.fn<typeof globalThis.fetch>>;

let log: string[];
let fetchSpy: FetchSpy;
let signOut: ReturnType<typeof vi.fn>;
let token: string | null;
let status: number;

function client(): AccountClient {
  return {
    from: () => {
      throw new Error("no PostgREST call expected");
    },
    auth: {
      getSession: async () => ({
        data: { session: token ? { access_token: token } : null },
        error: null,
      }),
      signOut,
    },
  } as unknown as AccountClient;
}

let onLine: boolean;

beforeEach(() => {
  log = [];
  token = "tok-u";
  status = 204;
  onLine = true;
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => onLine);
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:54321/");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-k");
  fetchSpy = vi.fn<typeof globalThis.fetch>(async (_input, init) => {
    log.push(`fetch ${init?.method}`);
    return new Response(null, { status });
  });
  // The default `fetch` dep is `globalThis.fetch`, so the spy goes there.
  vi.stubGlobal("fetch", fetchSpy);
  signOut = vi.fn(async (opts: unknown) => {
    log.push(`signOut(${JSON.stringify(opts)})`);
    return { error: null };
  });
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("T-0310c AC7 the delete request", () => {
  it("T-0310c AC7 one DELETE to /functions/v1/account (single slash), bearer + apikey, no body", async () => {
    expect(await requestAccountDeletion({ supabase: client() })).toBe("deleted");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("http://127.0.0.1:54321/functions/v1/account");
    expect(init?.method).toBe("DELETE");
    expect(init?.headers).toEqual({ Authorization: "Bearer tok-u", apikey: "anon-k" });
    expect(init && "body" in init).toBe(false);
  });

  it("T-0310c AC7 a URL without a trailing slash gives the same endpoint", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:54321");
    await requestAccountDeletion({ supabase: client() });
    expect(fetchSpy.mock.calls[0]![0]).toBe("http://127.0.0.1:54321/functions/v1/account");
  });

  it.each([
    [204, "deleted"],
    [401, "unauthorized"],
    [200, "failed"],
    [404, "failed"],
    [500, "failed"],
  ] as const)("T-0310c AC7 status %i → %s", async (code, outcome) => {
    status = code;
    expect(await requestAccountDeletion({ supabase: client() })).toBe(outcome);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("T-0310c AC7 a rejected fetch → failed", async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await requestAccountDeletion({ supabase: client() })).toBe("failed");
  });

  it("T-0310c AC7 offline → offline, zero fetch calls", async () => {
    onLine = false;
    expect(await requestAccountDeletion({ supabase: client() })).toBe("offline");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("T-0310c AC7 no session → unauthorized, zero fetch calls", async () => {
    token = null;
    expect(await requestAccountDeletion({ supabase: client() })).toBe("unauthorized");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("T-0310c AC7 unconfigured env → failed, zero fetch calls", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
    expect(await requestAccountDeletion({ supabase: client() })).toBe("failed");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("T-0310c AC7 getSession rejecting → failed, zero fetch calls", async () => {
    const c = client();
    c.auth.getSession = () => Promise.reject(new Error("storage"));
    expect(await requestAccountDeletion({ supabase: c })).toBe("failed");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("T-0310c AC9 order of the steps (D-0136 §4)", () => {
  let db: OfflineDb;

  beforeEach(async () => {
    db = freshOfflineDb();
    await seedBothUsers(db);
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (this === window.sessionStorage) log.push(`setItem(${key}, ${value})`);
      original.call(this, key, value);
    });
  });

  const wipe = async (userId: string, deps: Parameters<typeof wipeLocalUserData>[1]) => {
    log.push(`wipe(${userId === U ? "U" : userId})`);
    await wipeLocalUserData(userId, deps);
  };

  it("T-0310c AC9 204 → fetch, wipe(U), setItem(1), signOut({scope: local}); deleted", async () => {
    const outcome = await deleteAccountAndSignOut({ userId: U }, { supabase: client(), db, wipe });
    expect(outcome).toBe("deleted");
    expect(log).toEqual([
      "fetch DELETE",
      "wipe(U)",
      "setItem(wl-account-deleted, 1)",
      'signOut({"scope":"local"})',
    ]);
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(window.sessionStorage.getItem(ACCOUNT_DELETED_KEY)).toBe("1");
    for (const t of OFFLINE_TABLES) {
      expect(await countFor(db, t, U), t).toBe(0);
      expect(await countFor(db, t, V), t).toBe(1);
    }
  });

  it.each([
    ["401", "unauthorized", (): void => void (status = 401)],
    ["500", "failed", (): void => void (status = 500)],
    ["offline", "offline", (): void => void (onLine = false)],
    ["no session", "unauthorized", (): void => void (token = null)],
  ] as const)(
    "T-0310c AC9 %s → no wipe, no setItem, no signOut; %s",
    async (_n, outcome, arrange) => {
      arrange();
      window.localStorage.setItem("wl-onboarding", "{}");
      log.length = 0;
      expect(await deleteAccountAndSignOut({ userId: U }, { supabase: client(), db, wipe })).toBe(
        outcome,
      );
      expect(log.filter((l) => l !== "fetch DELETE")).toEqual([]);
      expect(signOut).not.toHaveBeenCalled();
      expect(window.sessionStorage.getItem(ACCOUNT_DELETED_KEY)).toBeNull();
      expect(window.localStorage.getItem("wl-onboarding")).toBe("{}");
      for (const t of OFFLINE_TABLES) expect(await countFor(db, t, U), t).toBe(1);
    },
  );

  it("T-0310c AC9 the wipe rejecting → setItem(partial), then signOut; still deleted", async () => {
    // `db.table(name)` is the instance `db.tables` hands the transaction (not `db.profileCache`).
    vi.spyOn(db.table("profileCache"), "delete").mockImplementation(() => {
      throw new Error("idb boom");
    });
    const outcome = await deleteAccountAndSignOut({ userId: U }, { supabase: client(), db, wipe });
    expect(outcome).toBe("deleted");
    expect(log).toEqual([
      "fetch DELETE",
      "wipe(U)",
      "setItem(wl-account-deleted, partial)",
      'signOut({"scope":"local"})',
    ]);
    expect(window.sessionStorage.getItem(ACCOUNT_DELETED_KEY)).toBe("partial");
  });

  it("T-0310c AC9 signOut rejecting still resolves deleted (no unhandled rejection)", async () => {
    signOut.mockRejectedValueOnce(new Error("network"));
    await expect(
      deleteAccountAndSignOut({ userId: U }, { supabase: client(), db, wipe }),
    ).resolves.toBe("deleted");
  });

  it("T-0310c AC9 two concurrent calls send one fetch and share the outcome", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    fetchSpy.mockImplementation(async (_i, init) => {
      log.push(`fetch ${init?.method}`);
      await gate;
      return new Response(null, { status: 204 });
    });
    const deps = { supabase: client(), db, wipe };
    const a = deleteAccountAndSignOut({ userId: U }, deps);
    const b = deleteAccountAndSignOut({ userId: U }, deps);
    release();
    expect(await Promise.all([a, b])).toEqual(["deleted", "deleted"]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(log.filter((l) => l.startsWith("wipe"))).toHaveLength(1);
  });

  it("T-0310c AC9 a call after the first settled sends a new request (no stuck lock)", async () => {
    status = 500;
    const deps = { supabase: client(), db, wipe };
    expect(await deleteAccountAndSignOut({ userId: U }, deps)).toBe("failed");
    status = 204;
    expect(await deleteAccountAndSignOut({ userId: U }, deps)).toBe("deleted");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
