// The redirect half of the gate (D-0064 §9, D-0071 §11). Wrapped around every route the shell
// decides is gated — every `protected` entry in `routes.ts` plus the literal `/session/setup`,
// derived from the table at runtime (AC-5), so a future `protected` route is gated the day it
// is added.
//
// Only `missing` redirects. `unknown` and `present` render the route (AC-6): a profile the gate
// could not read must never be able to take the app away from the user.
//
// D-0272: while the first read is pending, online, the gate shows a neutral placeholder for at
// most PROFILE_PLACEHOLDER_MAX_MS, so a new user never sees the route flash before the redirect.
// It only ever delays rendering; every way out of "pending" ends in the route (or the redirect).
import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router";
import { useProfileResolved, useProfileStatus } from "./profile-context.js";
import { PROFILE_PLACEHOLDER_MAX_MS, isOnline } from "./status.js";
import "./profile-gate.css";

/** Where a signed-in user with no `profiles` row is sent (D-0064 §8; owned by T-0301c). */
export const PROFILE_SAVE_PATH = "/welcome/save";

export function ProfileGate({ children }: { children: ReactNode }) {
  const status = useProfileStatus();
  const resolved = useProfileResolved();
  const pending = !resolved && isOnline();
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!pending) {
      setExpired(false);
      return;
    }
    const timer = setTimeout(() => setExpired(true), PROFILE_PLACEHOLDER_MAX_MS);
    return () => clearTimeout(timer);
  }, [pending]);

  if (status === "missing") return <Navigate to={PROFILE_SAVE_PATH} replace />;
  if (pending && !expired)
    return <div className="wl-profile-pending" aria-busy="true" data-wl-profile-pending="" />;
  return <>{children}</>;
}
