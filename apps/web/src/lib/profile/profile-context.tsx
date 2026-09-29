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
  // Bumped by every resolution, so a promise that settles after the component unmounted — or
  // after a newer `recheck()` overtook it — cannot set state (AC-11: no React warning, and no
  // stale answer overwriting a fresh one).
  const generation = useRef(0);
  const mounted = useRef(true);
  // `refreshProfile()` warms the cache at most once per mount for a network-sourced row (AC-3).
  const refreshed = useRef(false);

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
      return;
    }
    const mine = (generation.current += 1);
    const { status: next, shouldRefreshCache } = await resolveProfileStatus();
    if (!mounted.current || mine !== generation.current) return;
    setStatus(next);
    if (shouldRefreshCache && !refreshed.current) {
      refreshed.current = true;
      // Fire and forget: warming the cache for the next cold start must never block, or fail,
      // the gate's answer (AC-3).
      void import("../offline/index.js")
        .then((m) => m.refreshProfile())
        .catch(() => {});
    }
  }, [signedIn]);

  useEffect(() => {
    void run();
  }, [run]);

  const recheck = useCallback(async () => {
    refreshed.current = false;
    await run();
  }, [run]);

  return (
    <ProfileContext.Provider value={{ status, recheck }}>{children}</ProfileContext.Provider>
  );
}
