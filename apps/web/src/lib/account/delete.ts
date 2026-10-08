// NFR-PRIV-5 deletion (D-0135 §1/§6, D-0136 §4, UF-11.4).
//
// `requestAccountDeletion` calls `DELETE ${VITE_SUPABASE_URL}/functions/v1/account` with the
// caller's access token and the anon key, no body. Only 204 is "deleted"; 401 is
// "unauthorized"; any other status or a network error is "failed". It never throws.
//
// `deleteAccountAndSignOut` runs D-0136 §4 steps (1)–(4). Navigation, step (5), is the caller's.
import { isSupabaseConfigured } from "../auth/client.js";
import {
  clientOf,
  fetchOf,
  isOnline,
  localStorageOf,
  readSession,
  sessionStorageOf,
  type AccountDeps,
  type SessionInfo,
} from "./deps.js";
import { invalidateCacheWrites } from "../offline/cache-generation.js";
import { wipeLocalUserData } from "./wipe.js";

export type DeletionOutcome = "deleted" | "unauthorized" | "offline" | "failed";

export const ACCOUNT_DELETED_KEY = "wl-account-deleted";

function env(name: "VITE_SUPABASE_URL" | "VITE_SUPABASE_ANON_KEY"): string {
  const value = import.meta.env[name] as string | undefined;
  return typeof value === "string" ? value.trim() : "";
}

/**
 * `expectedUserId` (T-0310c L1): when given, the session's user must be that user, or the
 * request is never sent and the outcome is `"failed"`. A session with no user id can't be
 * verified, so it fails the check too.
 */
async function requestDeletion(
  deps: AccountDeps,
  expectedUserId: string | undefined,
): Promise<DeletionOutcome> {
  if (!isOnline(deps)) return "offline";
  if (!isSupabaseConfigured()) return "failed";
  let session: SessionInfo;
  try {
    session = await readSession(deps);
  } catch {
    return "failed";
  }
  if (!session.token) return "unauthorized";
  if (expectedUserId !== undefined && session.userId !== expectedUserId) return "failed";
  const url = `${env("VITE_SUPABASE_URL").replace(/\/+$/, "")}/functions/v1/account`;
  try {
    const response = await fetchOf(deps)(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.token}`, apikey: env("VITE_SUPABASE_ANON_KEY") },
    });
    if (response.status === 204) return "deleted";
    if (response.status === 401) return "unauthorized";
    return "failed";
  } catch {
    return "failed";
  }
}

export function requestAccountDeletion(deps: AccountDeps = {}): Promise<DeletionOutcome> {
  return requestDeletion(deps, undefined);
}

export interface DeleteAccountInput {
  userId: string;
}

export interface DeleteAccountDeps extends AccountDeps {
  /** Step (2). Defaults to `wipeLocalUserData`; tests wrap it to log the call. */
  wipe?: (userId: string, deps: AccountDeps) => Promise<void>;
}

// supabase-js persists the session as `sb-<ref>-auth-token` (+ `-code-verifier`, PKCE).
const SESSION_KEY_RE = /^sb-.+-auth-token(-code-verifier)?$/;

function removePersistedSession(deps: AccountDeps): void {
  try {
    const storage = localStorageOf(deps);
    if (!storage) return;
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key !== null && SESSION_KEY_RE.test(key)) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
  } catch {
    // Storage unavailable: nothing more this module can do.
  }
}

// D-0136 §3: one request per confirm. A second call while one is in flight joins it.
let inFlight: Promise<DeletionOutcome> | null = null;

async function run(input: DeleteAccountInput, deps: DeleteAccountDeps): Promise<DeletionOutcome> {
  // (1) DELETE /account, only if the session user is `input.userId` (L1): the token and the
  // wiped user come from one identity, or nothing is sent and nothing is wiped.
  const outcome = await requestDeletion(deps, input.userId);
  // On anything but 204: no wipe and no sign-out (D-0136 §4).
  if (outcome !== "deleted") return outcome;

  // (2) Wipe this user's local data (§5). T-0531 (D-0195): a cache refresh already in flight
  // must drop its rows instead of writing them after the wipe, so the counter is bumped first.
  invalidateCacheWrites();
  let flag: "1" | "partial" = "1";
  try {
    await (deps.wipe ?? wipeLocalUserData)(input.userId, deps);
  } catch {
    flag = "partial";
  }

  // (3) The one-time notice flag. Set after the wipe, which removes every `wl-` key.
  try {
    sessionStorageOf(deps)?.setItem(ACCOUNT_DELETED_KEY, flag);
  } catch {
    // Storage unavailable: the account is still deleted; only the notice is lost.
  }

  // (4) Local sign-out: the server user is gone, so a global one has nothing to revoke.
  // supabase-js removes the stored session (and fires SIGNED_OUT) even when its revoke call
  // errors. If signOut throws or returns an error anyway, drop the persisted session keys
  // ourselves (L2), so the next load starts signed out. The outcome stays "deleted".
  let signedOut = false;
  try {
    const { error } = await clientOf(deps).auth.signOut({ scope: "local" });
    signedOut = !error;
  } catch {
    signedOut = false;
  }
  if (!signedOut) removePersistedSession(deps);
  // Bumped again: a refresh started while the wipe or `signOut` was awaited (user still
  // signed in) captured the first new generation and must not write either.
  invalidateCacheWrites();
  return "deleted";
}

export function deleteAccountAndSignOut(
  input: DeleteAccountInput,
  deps: DeleteAccountDeps = {},
): Promise<DeletionOutcome> {
  if (inFlight) return inFlight;
  const promise = run(input, deps).finally(() => {
    if (inFlight === promise) inFlight = null;
  });
  inFlight = promise;
  return promise;
}
