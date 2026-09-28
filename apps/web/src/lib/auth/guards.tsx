// Route guards for D-0014 / D-0045 §5,13 (AC-B5, AC-B7). Three flavours:
//  - `RequireAuth`: signed-out redirects to the auth flow, live (reacts to status changes).
//  - `RequireAuthOnceForSession`: same redirect, decided only once at mount, so a token that
//    expires mid-workout never redirects or shows a banner on `/session/*` (principle 1).
//  - `RedirectIfSignedIn`: keeps signed-in/stale users out of onboarding and `/account`.
import { useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useAuth } from "./auth-context.js";
import { rememberReturnTo } from "./return-to.js";

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
  if (status === "signed-in" || status === "stale") {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
