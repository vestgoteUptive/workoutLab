// Which routes the gate covers (D-0071 §11, which supersedes D-0064 §9's narrower list:
// newest decision wins, and §11 is a superset, so nothing in §9 becomes false — D-0073 §2).
//
// The rule: **every route whose `guard` is `protected`, plus the literal path `/session/setup`**.
// Derived from the route table, never a hard-coded list, so the five routes T-0318 added are
// gated without being named and a future `protected` route is gated the day it is added (AC-5).
//
// `/session/setup` needs the explicit entry because its guard is `session`, not `protected`
// (it starts a workout, so an expiring token must not bounce the user out mid-setup). The two
// *other* `session` routes — `/session/:sessionId` and `/session/:sessionId/summary` — are
// keyed out by path, not by guard: gating the `session` guard as a class would break principle 1
// (AC-8).
import type { RouteConfig } from "../../app/routes.js";

/** The one `session`-guard path that is nevertheless gated (D-0071 §11). */
export const EXTRA_GATED_PATHS = ["/session/setup"] as const;

/** True when this route table entry sits behind the profile gate. */
export function isGatedPath(route: Pick<RouteConfig, "path" | "guard">): boolean {
  if (route.guard === "protected") return true;
  return (EXTRA_GATED_PATHS as readonly string[]).includes(route.path);
}

/** The gated paths of a route table, in table order. For tests and for the shell's wiring. */
export function gatedPaths(routes: readonly Pick<RouteConfig, "path" | "guard">[]): string[] {
  return routes.filter(isGatedPath).map((r) => r.path);
}
