// C-02 Tab bar (D-0045 §3, principle 1). Four tabs, always in this order. Rendered by
// `App.tsx` only outside `/welcome`, `/account`, `/auth/*` and `/session/*`.
import { Link, useLocation } from "react-router";
import { en } from "../../lib/i18n/en.js";

const TABS = [
  { to: "/", label: en.tabBar.today },
  { to: "/library", label: en.tabBar.library },
  { to: "/progress", label: en.tabBar.progress },
  { to: "/plan", label: en.tabBar.plan },
] as const;

/**
 * C-02 active tab by path prefix (D-0071 §2, AC-4):
 * - `/` only when the path is exactly `/`, so it never lights up under a sub-route;
 * - `/library` and `/library/*` (UF-04.2, UF-04.3) → Library;
 * - `/progress` and `/progress/*` (UF-06.2) → Progress, and `/balance*` keeps counting as
 *   Progress (D-0045 §3, unchanged);
 * - `/plan` and `/plan/*` → Plan. The `/plan/*` routes hide the tab bar (D-0071 §2), so that
 *   arm is only reached if a later route turns it back on.
 */
function isActive(to: string, pathname: string): boolean {
  if (to === "/") return pathname === "/";
  if (to === "/progress" && pathname.startsWith("/balance")) return true;
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function TabBar() {
  const { pathname } = useLocation();
  return (
    <>
      <div className="wl-tab-bar__spacer" aria-hidden="true" />
      <nav aria-label={en.tabBar.nav} className="wl-tab-bar" data-wl-state="plan">
        {TABS.map((tab) => {
          const active = isActive(tab.to, pathname);
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className="wl-tab-bar__link"
              aria-current={active ? "page" : undefined}
            >
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
