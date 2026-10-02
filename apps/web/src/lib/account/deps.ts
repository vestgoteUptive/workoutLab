// The injectable seams of `lib/account` (T-0310c). Every function takes an optional deps
// object, so tests pass fakes; the defaults are the real supabase-js client, `globalThis.fetch`
// and `offlineDb()`. The client type is structural on purpose: only the calls this module makes.
import { supabase } from "../auth/client.js";
import { offlineDb, type OfflineDb } from "../offline/db.js";

export interface PageResult {
  data: unknown[] | null;
  error: unknown;
}

export interface RangeQuery {
  range(from: number, to: number): PromiseLike<PageResult>;
}

export interface AccountClient {
  from(table: string): {
    select(columns: string): {
      order(column: string, options: { ascending: boolean }): RangeQuery;
    };
  };
  auth: {
    getSession(): PromiseLike<{
      data: {
        session: { access_token?: string | null; user?: { id?: string | null } | null } | null;
      };
      error: unknown;
    }>;
    signOut(options: { scope: "local" | "global" | "others" }): PromiseLike<{ error: unknown }>;
  };
}

export interface AccountDeps {
  supabase?: AccountClient;
  fetch?: typeof globalThis.fetch;
  db?: OfflineDb;
  /** Only `exportAccountData` reads a clock, and only when `now` isn't passed. */
  clock?: () => Date;
  localStorage?: Storage;
  sessionStorage?: Storage;
  /** `navigator.onLine`, read at call time. */
  isOnline?: () => boolean;
}

export function clientOf(deps: AccountDeps): AccountClient {
  return deps.supabase ?? (supabase as unknown as AccountClient);
}

export function dbOf(deps: AccountDeps): OfflineDb {
  return deps.db ?? offlineDb();
}

export function fetchOf(deps: AccountDeps): typeof globalThis.fetch {
  return deps.fetch ?? ((input, init) => globalThis.fetch(input, init));
}

export function isOnline(deps: AccountDeps): boolean {
  if (deps.isOnline) return deps.isOnline();
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

export function localStorageOf(deps: AccountDeps): Storage | undefined {
  if (deps.localStorage) return deps.localStorage;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function sessionStorageOf(deps: AccountDeps): Storage | undefined {
  if (deps.sessionStorage) return deps.sessionStorage;
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

export interface SessionInfo {
  token: string | null;
  userId: string | null;
}

/**
 * The access token and the user id from **one** `getSession()` result (T-0310c L1). Every
 * user-scoped step (the DELETE, the wipe, the export's device section) is checked against this
 * one read, so a tab that switched accounts between render and confirm can't pair user B's
 * token with user A's local rows. Rejects if `getSession()` rejects.
 */
export async function readSession(deps: AccountDeps): Promise<SessionInfo> {
  const { data } = await clientOf(deps).auth.getSession();
  const session = data.session;
  const token =
    typeof session?.access_token === "string" && session.access_token ? session.access_token : null;
  const id = session?.user?.id;
  return { token, userId: typeof id === "string" && id ? id : null };
}
