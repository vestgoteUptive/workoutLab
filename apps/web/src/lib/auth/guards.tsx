// Route guards for D-0014 / D-0045 §5,13 (AC-B5, AC-B7). Three flavours:
//  - `RequireAuth`: signed-out redirects to the auth flow, live (reacts to status changes).
//  - `RequireAuthOnceForSession`: same redirect, decided only once at mount, so a token that
//    expires mid-workout never redirects or shows a banner on `/session/*` (principle 1).
//  - `RedirectIfSignedIn`: keeps signed-in/stale users out of onboarding and `/account`, and
//    sends a re-signed-in user back to wherever `rememberReturnTo` last recorded (AC-B7), e.g.
//    the `/session/*` they were bounced out of.
import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useAuth } from "./auth-context.js";
import { consumeReturnTo, rememberReturnTo } from "./return-to.js";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, redirectTarget } = useAuth();
  const location = useLocation();
  if (status === "signed-out") {
    rememberReturnTo(location.pathname);
    return <Navigate to={redirectTarget} replace />;
  }
  return <>{children}</>;
}

export function RequireAuthOnceForSession({ children }: { children: ReactNode }) {
  const { status, redirectTarget } = useAuth();
  const location = useLocation();
  const [shouldRedirect] = useState(() => status === "signed-out");
  if (shouldRedirect) {
    rememberReturnTo(location.pathname);
    return <Navigate to={redirectTarget} replace />;
  }
  return <>{children}</>;
}

export function RedirectIfSignedIn({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const signedIn = status === "signed-in" || status === "stale";
  // Consuming the stored return-to is a side effect (it clears storage): it must run in an
  // effect, not during render, so React's (StrictMode, double-invoked) render pass never
  // discards it before the actual navigation commits.
  const [target, setTarget] = useState<string | null>(null);
  useEffect(() => {
    if (signedIn) setTarget(consumeReturnTo());
  }, [signedIn]);

  if (signedIn) {
    return target ? <Navigate to={target} replace /> : null;
  }
  return <>{children}</>;
}
