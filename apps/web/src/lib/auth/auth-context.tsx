// `useAuth()` (AC-B6) and the route guards built on it (AC-B5, AC-B7). Principle 5: the
// initial status is computed synchronously from whatever supabase-js already persisted to
// localStorage, so the first render never awaits a network promise. A network refresh, if any,
// happens after that first render, in an effect.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import { supabase } from "./client.js";

export type AuthStatus = "signed-out" | "signed-in" | "stale";

interface StoredSession {
  access_token?: string;
  expires_at?: number;
  user?: { id?: string } | null;
}

interface AuthContextValue {
  status: AuthStatus;
  /**
   * Who is signed in, or `null` when nobody is. T-0301a rework: `status` alone cannot
   * distinguish "user A is signed in" from "user B is signed in", because both are
   * `"signed-in"`. supabase-js fires `SIGNED_IN` for a new session **without** an intervening
   * `SIGNED_OUT` when a user verifies a different account in place — reachable through the
   * product's own UI, because AC-7 has a `missing` user standing down on `/welcome/*` with a
   * live email + code form. Anything keyed on the signed-in boolean alone therefore never
   * re-runs, and user B silently inherits user A's profile answer (D-0073 §4).
   *
   * `null` is deliberately not "signed out": a session whose stored JSON carries no `user`
   * (the T-0300b fixtures) is signed in with an unknown identity. Consumers must key on
   * `status` for signed-in-ness and on `userId` only for *change*, so an identity that stays
   * `null` across a status flip behaves exactly as it did before this field existed (AC-9).
   */
  userId: string | null;
  /** Where a `protected` route sends a signed-out user (AC-B5, AC-B7). */
  redirectTarget: "/welcome" | "/account";
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY_RE = /-auth-token$/;

/** Reads the session supabase-js already persisted, without calling the network. */
function readStoredSession(): StoredSession | null {
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !STORAGE_KEY_RE.test(key)) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { currentSession?: StoredSession } & StoredSession;
      const session = parsed.currentSession ?? parsed;
      if (session?.access_token) return session;
    }
  } catch {
    // treat unreadable storage as signed-out
  }
  return null;
}

function computeInitialStatus(): AuthStatus {
  const session = readStoredSession();
  if (!session) return "signed-out";
  if (typeof session.expires_at === "number" && session.expires_at * 1000 <= Date.now()) {
    return "stale";
  }
  return "signed-in";
}

/** The user id of a session object, from storage or from an auth event. Never throws. */
function userIdOf(session: unknown): string | null {
  const id = (session as { user?: { id?: unknown } } | null | undefined)?.user?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/**
 * Principle 5: read from the same already-persisted session `computeInitialStatus()` uses, so
 * the first render knows who is signed in without awaiting anything.
 */
function computeInitialUserId(): string | null {
  return userIdOf(readStoredSession());
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(computeInitialStatus);
  const [userId, setUserId] = useState<string | null>(computeInitialUserId);
  // Set once a refresh fails while the user is mid-workout (AC-B7, principle 1): the guard for
  // the *next* route they visit sends them to `/account`, not onboarding, without interrupting
  // the session route itself.
  const interruptedInSession = useRef(false);
  // The router's location, not `window.location` (a `MemoryRouter`, used in tests, never
  // touches the real one), read through a ref so the async refresh callback below sees the
  // pathname current when it *resolves*, not when it started.
  const location = useLocation();
  const pathnameRef = useRef(location.pathname);
  useEffect(() => {
    pathnameRef.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        if (pathnameRef.current.startsWith("/session/")) {
          interruptedInSession.current = true;
        }
        setStatus("signed-out");
        setUserId(null);
      } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        interruptedInSession.current = false;
        setStatus(session ? "signed-in" : "signed-out");
        // A `TOKEN_REFRESHED` carries the *same* user, so this is a no-op state set and nothing
        // downstream re-resolves. Only a genuine account switch changes the value.
        setUserId(session ? userIdOf(session) : null);
      }
    });

    if (computeInitialStatus() === "stale" && navigator.onLine) {
      void supabase.auth.getSession().then(
        ({ data, error }) => {
          if (data.session) {
            setStatus("signed-in");
            setUserId(userIdOf(data.session));
            return;
          }
          // Only a non-retryable auth error (400 invalid_grant: the refresh token itself is
          // dead) or a clean "no session, no error" response means the user is actually signed
          // out. A network error or a 5xx from Supabase means we don't yet know, so the user
          // stays "stale" and in the app (AC-B6) rather than getting bounced to onboarding.
          const isNonRetryable =
            !error || (error.status === 400 && error.message === "invalid_grant");
          if (!isNonRetryable) return;
          if (pathnameRef.current.startsWith("/session/")) {
            interruptedInSession.current = true;
          }
          setStatus("signed-out");
          setUserId(null);
        },
        () => {
          // A rejected promise (e.g. `fetch` itself throwing, offline mid-flight): treat the
          // same as any other network error and stay "stale" (AC-B6).
        },
      );
    }

    return () => subscription.subscription.unsubscribe();
    // Runs once: re-subscribing on every status change would double-fire the listener.
  }, []);

  const value: AuthContextValue = {
    status,
    userId,
    redirectTarget: interruptedInSession.current ? "/account" : "/welcome",
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
