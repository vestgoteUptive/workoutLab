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
    path: "/library/:exerciseId/compare/:otherId",
    screenId: "UF-04.3",
    showTabBar: true,
    guard: "protected",
    load: () => import("../features/UF-04/index.js").then((m) => ({ default: m.Compare })),
  },
  {
    path: "/progress",
    screenId: "UF-06.1",
    showTabBar: true,
    guard: "protected",
    load: () => import("../features/UF-06/index.js").then((m) => ({ default: m.Progress })),
  },
  {
    path: "/progress/:exerciseId",
    screenId: "UF-06.2",
    showTabBar: true,
    guard: "protected",
    load: () => import("../features/UF-06/index.js").then((m) => ({ default: m.ExerciseHistory })),
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
    // No tab bar: an editing page, reached from /plan and returned to on save (D-0071 §2).
    path: "/plan/edit",
    screenId: "UF-11.3",
    showTabBar: false,
    guard: "protected",
    load: () => import("../features/UF-11/index.js").then((m) => ({ default: m.EditPlan })),
  },
  {
    // Account settings (export, sign out, delete): one tap from /plan, no tab (D-0136 §1).
    path: "/plan/account",
    screenId: "UF-11.4",
    showTabBar: false,
    guard: "protected",
    load: () => import("../features/UF-11/index.js").then((m) => ({ default: m.AccountSettings })),
  },
  {
    // Before `/plan/routines/:routineId`, so `new` never reads as a routine id here or in
    // `matchesShellRoute` (react-router ranks the static segment higher on its own).
    path: "/plan/routines/new",
    screenId: "UF-07.1",
    showTabBar: false,
    guard: "protected",
    load: () => import("../features/UF-07/index.js").then((m) => ({ default: m.RoutineEditor })),
  },
  {
    path: "/plan/routines/:routineId",
    screenId: "UF-07.1",
    showTabBar: false,
    guard: "protected",
    load: () => import("../features/UF-07/index.js").then((m) => ({ default: m.RoutineEditor })),
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
  {
    // The `session` guard, no tab bar, and never gated by the profile gate (D-0071 §2, §11):
    // the summary is the tail of a workout, so it must not interrupt for auth or a profile.
    path: "/session/:sessionId/summary",
    screenId: "UF-03.3",
    showTabBar: false,
    guard: "session",
    load: () => import("../features/UF-03/index.js").then((m) => ({ default: m.Summary })),
  },
] as const;

export function isArea(value: string | undefined): value is Area {
  return !!value && (AREAS as readonly string[]).includes(value);
}
