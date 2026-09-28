// `useAuth()` (AC-B6) and the route guards built on it (AC-B5, AC-B7). Principle 5: the
// initial status is computed synchronously from whatever supabase-js already persisted to
// localStorage, so the first render never awaits a network promise. A network refresh, if any,
// happens after that first render, in an effect.
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "./client.js";

export type AuthStatus = "signed-out" | "signed-in" | "stale";

interface StoredSession {
  access_token?: string;
  expires_at?: number;
}

interface AuthContextValue {
  status: AuthStatus;
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(computeInitialStatus);
  // Set once a refresh fails while the user is mid-workout (AC-B7, principle 1): the guard for
  // the *next* route they visit sends them to `/account`, not onboarding, without interrupting
  // the session route itself.
  const interruptedInSession = useRef(false);

  useEffect(() => {
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        setStatus("signed-out");
      } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        interruptedInSession.current = false;
        setStatus(session ? "signed-in" : "signed-out");
      }
    });

    if (computeInitialStatus() === "stale" && navigator.onLine) {
      void supabase.auth.getSession().then(({ data, error }) => {
        if (error || !data.session) {
          if (window.location.pathname.startsWith("/session/")) {
            interruptedInSession.current = true;
          } else {
            setStatus("signed-out");
          }
        } else {
          setStatus("signed-in");
        }
      });
    }

    return () => subscription.subscription.unsubscribe();
    // Runs once: re-subscribing on every status change would double-fire the listener.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: AuthContextValue = {
    status,
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
