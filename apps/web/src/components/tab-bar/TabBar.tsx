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

/** `/balance/*` counts as Progress active (D-0045 §3). */
function isActive(to: string, pathname: string): boolean {
  if (to === "/") return pathname === "/";
  if (to === "/progress") return pathname === "/progress" || pathname.startsWith("/balance");
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function TabBar() {
  const { pathname } = useLocation();
  return (
    <nav aria-label={en.tabBar.nav} className="wl-tab-bar">
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
  );
}
