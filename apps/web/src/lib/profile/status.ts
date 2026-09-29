// The profile gate's state machine (D-0064 §9, D-0071 §11, D-0073). A signed-in user can land
// on a protected route with no `profiles` row: a magic link opened in a different browser
// context than the one that holds the local onboarding answers (D-0045 §5). Every engine read
// then returns nothing. This module answers one question — does this user have a profile? —
// and the shell turns a `missing` answer into a redirect to `/welcome/save` (T-0301c).
//
// Principle 5: signed out, nothing here reads storage or the network, and `lib/offline` is
// reached only through a dynamic `import()` made after the signed-in check, so a signed-out
// first render never pulls the Dexie chunk (the `AutoSyncGate` precedent in `app/App.tsx`).

/**
 * The gate's three states (D-0064 §9). Exhaustive by construction: `PROFILE_STATUSES` below is
 * the single source, and `ProfileStatus` is derived from it, so a fourth state cannot be added
 * to one without the other (AC-1).
 */
export const PROFILE_STATUSES = ["unknown", "present", "missing"] as const;

/**
 * - `unknown`: not resolved yet, offline with no cache, or the read errored. **Never redirects.**
 * - `present`: a profile exists (cached, or read from `profiles`).
 * - `missing`: online, the read succeeded, and there is no row. This is the redirect case.
 */
export type ProfileStatus = (typeof PROFILE_STATUSES)[number];

/** What one resolution of the gate produced, so the caller knows whether to warm the cache. */
export interface ProfileResolution {
  status: ProfileStatus;
  /** True when the row came from the network, so the cache is stale and worth refreshing. */
  shouldRefreshCache: boolean;
}

const UNKNOWN: ProfileResolution = { status: "unknown", shouldRefreshCache: false };

function isOnline(): boolean {
  // `navigator.onLine` is `undefined` in a few environments; only an explicit `false` means
  // offline, so an unknown value still attempts the read (and an error yields `unknown` anyway).
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

/**
 * Resolves the profile status for a signed-in user, in the D-0064 §9 order:
 *  2. a cached profile → `present`, with **no** network wait;
 *  3. otherwise, online → `profiles … maybeSingle()`: a row → `present`, `{data: null}` → `missing`;
 *  4. an error, or offline with no cache → `unknown`.
 *
 * Never throws: every failure path is `unknown`, because `unknown` never redirects and a broken
 * read must not be able to interrupt the app (principle 1).
 */
export async function resolveProfileStatus(): Promise<ProfileResolution> {
  // The dynamic import is load-bearing (AC-10): it keeps `lib/offline` — and therefore Dexie —
  // out of the static graph of anything that renders signed out.
  let cached: unknown = null;
  try {
    const { loadProfile } = await import("../offline/index.js");
    cached = await loadProfile();
  } catch {
    // An unreadable cache is not an answer; fall through to the network.
    cached = null;
  }
  if (cached) return { status: "present", shouldRefreshCache: false };

  if (!isOnline()) return UNKNOWN;

  try {
    const { supabase } = await import("../auth/client.js");
    const { data, error } = await supabase.from("profiles").select("*").maybeSingle();
    if (error) return UNKNOWN;
    return data
      ? { status: "present", shouldRefreshCache: true }
      : { status: "missing", shouldRefreshCache: false };
  } catch {
    return UNKNOWN;
  }
}
