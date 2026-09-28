// The route table (D-0045 §2). Every entry is a lazy-loaded chunk, one per flow module, so
// the initial bundle stays within the NFR-PERF-2 budget (AC-A6, AC-A11).
import type { ComponentType } from "react";
import { AREAS } from "@workoutlab/shared";

export type Area = (typeof AREAS)[number];

/**
 * Auth guard applied to a route (D-0045 §5, §13; AC-B5, AC-B7):
 * - `public`: no guard (the `/auth/callback` landing page).
 * - `protected`: signed-out redirects to the auth flow; reacts live to status changes.
 * - `session`: same redirect, decided once at mount only, so a token that expires
 *   mid-workout never redirects or shows a banner on `/session/*` (principle 1).
 * - `guest-only`: signed-in/stale redirects away (onboarding, `/account`).
 */
export type RouteGuard = "public" | "protected" | "session" | "guest-only";

export interface RouteConfig {
  /** react-router path pattern. */
  path: string;
  /** v2 user-flow screen id (`Design-docs/docs/product/user-flows.md`, D-0002). */
  screenId: string;
  /** Whether C-02 (the tab bar) renders on this route (principle 1). */
  showTabBar: boolean;
  guard: RouteGuard;
  load: () => Promise<{ default: ComponentType }>;
}

export const routes: readonly RouteConfig[] = [
  {
    path: "/welcome/*",
    screenId: "UF-01.1",
    showTabBar: false,
    guard: "guest-only",
    load: () => import("../features/UF-01/index.js").then((m) => ({ default: m.Welcome })),
  },
  {
    path: "/account",
    screenId: "UF-01.5",
    showTabBar: false,
    guard: "guest-only",
    load: () => import("../features/UF-01/index.js").then((m) => ({ default: m.Account })),
  },
  {
    path: "/auth/callback",
    screenId: "UF-01.5-auth-callback",
    showTabBar: false,
    guard: "public",
    load: () => import("../features/UF-01/index.js").then((m) => ({ default: m.AuthCallback })),
  },
  {
    path: "/",
    screenId: "UF-02.1",
    showTabBar: true,
    guard: "protected",
    load: () => import("../features/UF-02/index.js").then((m) => ({ default: m.Today })),
  },
  {
    path: "/library",
    screenId: "UF-04.1",
    showTabBar: true,
    guard: "protected",
    load: () => import("../features/UF-04/index.js").then((m) => ({ default: m.Library })),
  },
  {
    path: "/library/:exerciseId",
    screenId: "UF-04.2",
    showTabBar: true,
    guard: "protected",
    load: () => import("../features/UF-04/index.js").then((m) => ({ default: m.LibraryDetail })),
  },
  {
    path: "/progress",
    screenId: "UF-06.1",
    showTabBar: true,
    guard: "protected",
    load: () => import("../features/UF-06/index.js").then((m) => ({ default: m.Progress })),
  },
  {
    path: "/balance",
    screenId: "UF-10.1",
    showTabBar: true,
    guard: "protected",
    load: () => import("../features/UF-10/index.js").then((m) => ({ default: m.Balance })),
  },
  {
    path: "/balance/:area",
    screenId: "UF-10.2",
    showTabBar: true,
    guard: "protected",
    load: () => import("../features/UF-10/index.js").then((m) => ({ default: m.BalanceDetail })),
  },
  {
    path: "/plan",
    screenId: "UF-11.2",
    showTabBar: true,
    guard: "protected",
    load: () => import("../features/UF-11/index.js").then((m) => ({ default: m.Plan })),
  },
  {
    path: "/session/setup",
    screenId: "UF-08.1",
    showTabBar: false,
    guard: "session",
    load: () => import("../features/UF-08/index.js").then((m) => ({ default: m.SessionSetup })),
  },
  {
    path: "/session/:sessionId",
    screenId: "UF-09",
    showTabBar: false,
    guard: "session",
    load: () => import("../features/UF-09/index.js").then((m) => ({ default: m.SessionHost })),
  },
] as const;

export function isArea(value: string | undefined): value is Area {
  return !!value && (AREAS as readonly string[]).includes(value);
}
