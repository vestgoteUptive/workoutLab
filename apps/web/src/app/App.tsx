// App shell: router (D-0045 §2), C-02 tab bar (§3). Auth (T-0300b), offline queue (T-0300c)
// and C-01 (T-0300d) land in their own tickets; this shell never imports their features.
import { Suspense, lazy, useMemo, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from "react-router";
import { AccountDeletedNotice } from "../components/account-deleted-notice/AccountDeletedNotice.js";
import { TabBar } from "../components/tab-bar/TabBar.js";
import { AuthProvider, useAuth } from "../lib/auth/auth-context.js";
import { RedirectIfSignedIn, RequireAuth, RequireAuthOnceForSession } from "../lib/auth/guards.js";
import { ProfileGate } from "../lib/profile/ProfileGate.js";
import { isGatedPath } from "../lib/profile/gated-routes.js";
import { ProfileStatusProvider } from "../lib/profile/profile-context.js";
import { RouteBoundary } from "./RouteBoundary.js";
import { isArea, routes, type RouteConfig } from "./routes.js";
import "../components/tab-bar/tab-bar.css";

// `lib/offline` is loaded lazily and only once signed in (T-0300c, AC-C20), so `/welcome`'s
// first render never imports it (principle 5, D-0045 §13): a signed-out user's static import
// graph stops at this lazy() call, which React never invokes until `signedIn` below is true.
const LazyAutoSync = lazy(() =>
  import("../lib/offline/AutoSync.js").then((m) => ({ default: m.AutoSync })),
);

function AutoSyncGate() {
  const { status } = useAuth();
  if (status !== "signed-in") return null;
  return (
    <Suspense fallback={null}>
      <LazyAutoSync />
    </Suspense>
  );
}

/**
 * The profile gate, applied in exactly one place (AC-12): here, from the shell's route wiring,
 * to the routes `isGatedPath` derives from the table — every `protected` entry plus
 * `/session/setup` (D-0071 §11). It sits *inside* the auth guard, so a signed-out user still
 * reaches the auth flow first, and *outside* Suspense, so the route's chunk is never even
 * requested for a user who is about to be redirected to `/welcome/save`.
 */
function applyProfileGate(route: RouteConfig, element: ReactNode): ReactNode {
  return isGatedPath(route) ? <ProfileGate>{element}</ProfileGate> : element;
}

function applyGuard(guard: RouteConfig["guard"], element: ReactNode): ReactNode {
  switch (guard) {
    case "protected":
      return <RequireAuth>{element}</RequireAuth>;
    case "session":
      return <RequireAuthOnceForSession>{element}</RequireAuthOnceForSession>;
    case "guest-only":
      return <RedirectIfSignedIn>{element}</RedirectIfSignedIn>;
    case "public":
      return element;
  }
}

function BalanceDetailGuard({ children }: { children: React.ReactNode }) {
  const { area } = useParams();
  if (!isArea(area)) return <Navigate to="/balance" replace />;
  return <>{children}</>;
}

const lazyComponents = new Map(routes.map((route) => [route.path, lazy(route.load)]));

export function Shell() {
  const location = useLocation();
  const showTabBar = useMemo(() => {
    const route = routes.find((r) => matchesShellRoute(r.path, location.pathname));
    return route?.showTabBar ?? false;
  }, [location.pathname]);

  return (
    <>
      <AccountDeletedNotice />
      <Routes>
        {routes.map((route) => {
          const Component = lazyComponents.get(route.path)!;
          const lazyElement =
            route.path === "/balance/:area" ? (
              <BalanceDetailGuard>
                <Component />
              </BalanceDetailGuard>
            ) : (
              <Component />
            );
          // The route's own error boundary (D-0164 §7) sits inside the guard and gate and outside
          // Suspense: a failed chunk load shows "Couldn't load this screen." for this route only. The
          // key matters: React Router reuses the element slot across routes, so without it the
          // failed state would follow the user to the next route.
          // The guard sits *outside* Suspense: a guard decided once at mount (`session`,
          // AC-B7) must not be re-run when Suspense unwinds and retries this subtree once
          // the lazy chunk resolves, which would reset its captured decision.
          const element = applyGuard(
            route.guard,
            applyProfileGate(
              route,
              <RouteBoundary key={route.path} resetKey={location.pathname}>
                <Suspense fallback={null}>{lazyElement}</Suspense>
              </RouteBoundary>,
            ),
          );
          return <Route key={route.path} path={route.path} element={element} />;
        })}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {showTabBar ? <TabBar /> : null}
    </>
  );
}

/** A minimal path matcher good enough to pick the active route for the tab-bar decision. */
function matchesShellRoute(pattern: string, pathname: string): boolean {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = pathname.split("/").filter(Boolean);
  if (pattern.endsWith("/*")) {
    const base = patternParts.slice(0, -1);
    return base.every((part, i) => pathParts[i] === part);
  }
  if (patternParts.length !== pathParts.length) return false;
  return patternParts.every((part, i) => part.startsWith(":") || part === pathParts[i]);
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ProfileStatusProvider>
          <AutoSyncGate />
          <Shell />
        </ProfileStatusProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
