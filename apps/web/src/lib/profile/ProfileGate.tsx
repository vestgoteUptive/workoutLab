// The redirect half of the gate (D-0064 §9, D-0071 §11). Wrapped around every route the shell
// decides is gated — every `protected` entry in `routes.ts` plus the literal `/session/setup`,
// derived from the table at runtime (AC-5), so a future `protected` route is gated the day it
// is added.
//
// Only `missing` redirects. `unknown` and `present` render the route (AC-6): a profile the gate
// could not read must never be able to take the app away from the user.
import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useProfileStatus } from "./profile-context.js";

/** Where a signed-in user with no `profiles` row is sent (D-0064 §8; owned by T-0301c). */
export const PROFILE_SAVE_PATH = "/welcome/save";

export function ProfileGate({ children }: { children: ReactNode }) {
  const status = useProfileStatus();
  if (status === "missing") return <Navigate to={PROFILE_SAVE_PATH} replace />;
  return <>{children}</>;
}
