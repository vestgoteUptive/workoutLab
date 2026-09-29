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
  const { status: authStatus } = useAuth();
  // Signed out the gate is inert (principle 5): `unknown`, no storage read, no network call.
  const signedIn = authStatus !== "signed-out";

  const [status, setStatus] = useState<ProfileStatus>("unknown");
  // Signed out there is nothing to resolve, so the gate is "resolved" from the first render:
  // `/welcome` must never wait for it (principle 5, AC-10).
  const [resolved, setResolved] = useState(!signedIn);
  // Bumped by every resolution, so a promise that settles after the component unmounted — or
  // after a newer `recheck()` overtook it — cannot set state (AC-11: no React warning, and no
  // stale answer overwriting a fresh one).
  const generation = useRef(0);
  const mounted = useRef(true);
  // `refreshProfile()` warms the cache once per *distinct* resolution that produced a
  // network-sourced row (AC-3): a re-render, or a `recheck()` that finds the same answer the
  // gate already holds, must not refetch. A recheck that actually changes the answer (the
  // T-0301c case, `missing` → `present`) does warm the cache, which is the point of the call.
  const refreshedFor = useRef<ProfileStatus | null>(null);

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
  }, [signedIn]);

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
