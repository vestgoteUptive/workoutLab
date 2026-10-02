// NFR-PRIV-5 deletion (D-0135 §1/§6, D-0136 §4, UF-11.4).
//
// `requestAccountDeletion` calls `DELETE ${VITE_SUPABASE_URL}/functions/v1/account` with the
// caller's access token and the anon key, no body. Only 204 is "deleted"; 401 is
// "unauthorized"; any other status or a network error is "failed". It never throws.
//
// `deleteAccountAndSignOut` runs D-0136 §4 steps (1)–(4). Navigation, step (5), is the caller's.
import { isSupabaseConfigured } from "../auth/client.js";
import { clientOf, fetchOf, isOnline, sessionStorageOf, type AccountDeps } from "./deps.js";
import { wipeLocalUserData } from "./wipe.js";

export type DeletionOutcome = "deleted" | "unauthorized" | "offline" | "failed";

export const ACCOUNT_DELETED_KEY = "wl-account-deleted";

function env(name: "VITE_SUPABASE_URL" | "VITE_SUPABASE_ANON_KEY"): string {
  const value = import.meta.env[name] as string | undefined;
  return typeof value === "string" ? value.trim() : "";
}

export async function requestAccountDeletion(deps: AccountDeps = {}): Promise<DeletionOutcome> {
  if (!isOnline(deps)) return "offline";
  if (!isSupabaseConfigured()) return "failed";
  let token: string | null | undefined;
  try {
    const { data } = await clientOf(deps).auth.getSession();
    token = data.session?.access_token;
  } catch {
    return "failed";
  }
  if (!token) return "unauthorized";
  const url = `${env("VITE_SUPABASE_URL").replace(/\/+$/, "")}/functions/v1/account`;
  try {
    const response = await fetchOf(deps)(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}`, apikey: env("VITE_SUPABASE_ANON_KEY") },
    });
    if (response.status === 204) return "deleted";
    if (response.status === 401) return "unauthorized";
    return "failed";
  } catch {
    return "failed";
  }
}

export interface DeleteAccountInput {
  userId: string;
}

export interface DeleteAccountDeps extends AccountDeps {
  /** Step (2). Defaults to `wipeLocalUserData`; tests wrap it to log the call. */
  wipe?: (userId: string, deps: AccountDeps) => Promise<void>;
}

// D-0136 §3: one request per confirm. A second call while one is in flight joins it.
let inFlight: Promise<DeletionOutcome> | null = null;

async function run(input: DeleteAccountInput, deps: DeleteAccountDeps): Promise<DeletionOutcome> {
  // (1) DELETE /account.
  const outcome = await requestAccountDeletion(deps);
  // On anything but 204: no wipe and no sign-out (D-0136 §4).
  if (outcome !== "deleted") return outcome;

  // (2) Wipe this user's local data (§5).
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
  try {
    await clientOf(deps).auth.signOut({ scope: "local" });
  } catch {
    // The server account is gone either way; the outcome stays "deleted".
  }
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
