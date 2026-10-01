// UF-01.1 Welcome (prototype `UF01-1-Welcome.dc.html`). In the `/welcome/*` splat's first
// chunk: it renders on the first commit and waits on nothing (principle 5). Its static import
// graph holds no engine, `lib/offline`, `lib/profile`, `lib/auth/client` or supabase-js
// (`__tests__/source.test.ts`).
import { useLayoutEffect } from "react";
import { Link } from "react-router";
import { en } from "../../lib/i18n/en.js";
import { markOnboardingStarted } from "./pending-plan.js";

const t = en.uf01;

export function WelcomeScreen() {
  // D-0064 §7: the first commit of UF-01.1 starts the 60 s clock; later commits keep it.
  useLayoutEffect(() => {
    markOnboardingStarted();
  }, []);

  return (
    <div data-screen-id="UF-01.1" className="wl-uf01 wl-uf01--welcome">
      <p className="wl-uf01__brand">{t.appName}</p>
      <svg
        className="wl-uf01__art"
        viewBox="0 0 320 320"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="160" cy="160" r="150" className="wl-uf01__art-disc" />
        <line x1="40" y1="258" x2="280" y2="258" className="wl-uf01__art-floor" strokeWidth="4" />
        <circle cx="150" cy="84" r="20" className="wl-uf01__art-ink" strokeWidth="10" />
        <path d="M150 112 L128 176" className="wl-uf01__art-ink" strokeWidth="14" />
        <path d="M128 176 L200 182 L182 252" className="wl-uf01__art-accent" strokeWidth="14" />
        <path d="M170 254 L214 254" className="wl-uf01__art-ink" strokeWidth="10" />
        <path d="M146 122 L186 138 L196 118" className="wl-uf01__art-ink" strokeWidth="8" />
        <line x1="98" y1="118" x2="232" y2="118" className="wl-uf01__art-bar" strokeWidth="6" />
        <rect x="84" y="92" width="18" height="52" rx="4" className="wl-uf01__art-plate" />
        <rect x="228" y="92" width="18" height="52" rx="4" className="wl-uf01__art-plate" />
      </svg>
      <div className="wl-uf01__intro">
        <h1 className="wl-uf01__title">
          <span className="wl-uf01__line">{t.welcome.headingLine1}</span>{" "}
          <span className="wl-uf01__line">{t.welcome.headingLine2}</span>
        </h1>
        <p className="wl-uf01__muted">{t.welcome.subtitle}</p>
      </div>
      <div className="wl-uf01__actions">
        <Link to="/welcome/goal" className="wl-uf01__primary">
          {t.welcome.getStarted}
        </Link>
        <Link to="/account" className="wl-uf01__ghost">
          {t.welcome.haveAccount}
        </Link>
      </div>
    </div>
  );
}
