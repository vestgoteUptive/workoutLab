// `useProfileStatus()` / `recheckProfile()` and the provider that owns the one resolution
// (D-0064 §9, D-0071 §11, D-0073). One provider per app, mounted by the shell: the gate lives
// in exactly one place and features never re-implement it (AC-12).
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "../auth/auth-context.js";
import { resolveProfileStatus, type ProfileStatus } from "./status.js";

interface ProfileContextValue {
  status: ProfileStatus;
  /**
   * Whether the gate has finished a resolution at least once. `status` alone cannot answer
   * this: `"unknown"` is both "not resolved yet" and "resolved, and the answer is unknown"
   * (D-0064 §9 steps 4 and 5 share a value). The profile *gate* does not care — neither value
   * redirects — but `RedirectIfSignedIn` does: on `/welcome/*` it must not fire its redirect
   * before the answer is in, or a `missing` user is bounced off `/welcome/save` by the very
   * first render pass and never gets there (D-0073 §1).
   */
  resolved: boolean;
  recheck: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

/**
 * The gate's status. Outside a `ProfileStatusProvider` it is `"unknown"`, which never
 * redirects, so a route rendered without the provider fails open, never closed (principle 1).
 */
export function useProfileStatus(): ProfileStatus {
  return useContext(ProfileContext)?.status ?? "unknown";
}

/**
 * Internal to the gate seam (D-0073 §1): `true` once a resolution has committed. Outside a
 * provider it is `true`, so a tree with no provider — the T-0300b auth tests, which stay
 * unedited — keeps exactly today's `guest-only` behaviour instead of hanging.
 */
export function useProfileResolved(): boolean {
  return useContext(ProfileContext)?.resolved ?? true;
}

/**
 * Re-evaluates the status after a write lands (T-0301c's `/welcome/save`), without a reload.
 * Resolves once the new status is committed, so the caller can navigate straight afterwards
 * and never bounce back to `/welcome/save` (AC-11).
 */
export function useRecheckProfile(): () => Promise<void> {
  const recheck = useContext(ProfileContext)?.recheck;
  return useCallback(async () => {
    await recheck?.();
  }, [recheck]);
}

export function ProfileStatusProvider({ children }: { children: ReactNode }) {
  const { status: authStatus, userId } = useAuth();
  // Signed out the gate is inert (principle 5): `unknown`, no storage read, no network call.
  const signedIn = authStatus !== "signed-out";
  // The gate's answer is about *a user*, not about being signed in, so the identity of the
  // answer's owner is what it keys on. `signedIn` alone is not enough: supabase-js fires
  // `SIGNED_IN` for a new session with no intervening `SIGNED_OUT` when a user verifies a
  // different account in place, which leaves `signedIn === true` — no transition, no new effect
  // identity, no re-render — and user B silently inherits user A's `status` and `resolved`
  // (D-0073 §4). Signed out the key is a constant, so the inert path is untouched, and when the
  // session carries no `user` at all (the T-0300b fixtures) the key is constant per
  // signed-in-ness, i.e. exactly the old `[signedIn]` behaviour (AC-9).
  const authKey = signedIn ? `in:${userId ?? ""}` : "out";

  const [status, setStatus] = useState<ProfileStatus>("unknown");
  // Signed out there is nothing to resolve, so the gate is "resolved" from the first render:
  // `/welcome` must never wait for it (principle 5, AC-10).
  const [resolved, setResolved] = useState(!signedIn);
  // `refreshProfile()` warms the cache once per *distinct* resolution that produced a
  // network-sourced row (AC-3): a re-render, or a `recheck()` that finds the same answer the
  // gate already holds, must not refetch. A recheck that actually changes the answer (the
  // T-0301c case, `missing` → `present`) does warm the cache, which is the point of the call.
  // Declared before the transition check below, which resets it on an account switch.
  const refreshedFor = useRef<ProfileStatus | null>(null);
  // `useState`'s initialiser runs once, so `resolved` cannot be left to it: a user who signs in
  // *in place* — the magic-link / OTP verify firing `SIGNED_IN` while they sit on `/welcome`,
  // which is the D-0045 §5 case this whole gate exists for — flips `signedIn` false → true with
  // `resolved` still `true` from the signed-out initialiser. The stand-down would then see
  // `resolved && "unknown"` for every render until `resolveProfileStatus()` settles and bounce
  // them `/welcome` → `/` → `/welcome/save`: the very defect D-0073 §4 exists to prevent, just
  // reached by a transition instead of a cold load. So the transition clears it, during render,
  // before any child reads the context.
  //
  // The same argument covers the account switch, which needs one thing more. On a
  // signed-out → signed-in flip the held `status` is already `"unknown"`, so clearing
  // `resolved` is enough. On a signed-in → signed-in flip it is user A's *answer*, and a stale
  // `"missing"` strands user B on onboarding (the §1 stand-down keeps firing) while a stale
  // `"present"` leaves them ungated, which is the silent-corruption class this gate exists to
  // close. So the identity change resets the answer as well, back to the one value that never
  // redirects either way.
  const lastAuthKey = useRef(authKey);
  if (lastAuthKey.current !== authKey) {
    const switchedUser = signedIn && lastAuthKey.current !== "out";
    lastAuthKey.current = authKey;
    if (signedIn && resolved) setResolved(false);
    if (switchedUser) {
      setStatus("unknown");
      // The new user's cache is not the old user's, so the next network-sourced answer must be
      // allowed to warm it again even if it is the same `ProfileStatus` value (AC-3).
      refreshedFor.current = null;
    }
  }
  // Bumped by every resolution, so a promise that settles after the component unmounted — or
  // after a newer `recheck()` overtook it — cannot set state (AC-11: no React warning, and no
  // stale answer overwriting a fresh one).
  const generation = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
    };
  }, []);

  const run = useCallback(async () => {
    if (!signedIn) {
      setStatus("unknown");
      setResolved(true);
      return;
    }
    const mine = (generation.current += 1);
    const { status: next, shouldRefreshCache } = await resolveProfileStatus();
    if (!mounted.current || mine !== generation.current) return;
    setStatus(next);
    setResolved(true);
    if (shouldRefreshCache && refreshedFor.current !== next) {
      refreshedFor.current = next;
      // Fire and forget: warming the cache for the next cold start must never block, or fail,
      // the gate's answer (AC-3).
      void import("../offline/index.js").then((m) => m.refreshProfile()).catch(() => {});
    }
    // `authKey` is the real key: an account switch keeps `signedIn` true, so keying on the
    // boolean alone gives `run()` the same identity and the effect below never re-fires
    // (D-0073 §4). `signedIn` is listed because the body reads it and exhaustive-deps requires
    // it, but it cannot widen the dep set: it is derived from the same value as `authKey` and
    // can never change without `authKey` changing too.
  }, [authKey, signedIn]);

  useEffect(() => {
    void run();
  }, [run]);

  const recheck = useCallback(async () => {
    await run();
  }, [run]);

  return (
    <ProfileContext.Provider value={{ status, resolved, recheck }}>
      {children}
    </ProfileContext.Provider>
  );
}
