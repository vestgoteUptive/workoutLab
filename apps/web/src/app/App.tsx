// App shell: router (D-0045 §2), C-02 tab bar (§3). Auth (T-0300b), offline queue (T-0300c)
// and C-01 (T-0300d) land in their own tickets; this shell never imports their features.
import { Suspense, lazy, useMemo, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from "react-router";
import { TabBar } from "../components/tab-bar/TabBar.js";
import { AuthProvider } from "../lib/auth/auth-context.js";
import { RedirectIfSignedIn, RequireAuth, RequireAuthOnceForSession } from "../lib/auth/guards.js";
import { isArea, routes, type RouteConfig } from "./routes.js";
import "../components/tab-bar/tab-bar.css";

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
          // The guard sits *outside* Suspense: a guard decided once at mount (`session`,
          // AC-B7) must not be re-run when Suspense unwinds and retries this subtree once
          // the lazy chunk resolves, which would reset its captured decision.
          const element = applyGuard(route.guard, <Suspense fallback={null}>{lazyElement}</Suspense>);
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
        <Shell />
      </AuthProvider>
    </BrowserRouter>
  );
}
