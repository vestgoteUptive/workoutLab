// UF-01.5 Account (`/account`, T-0301c, D-0014, D-0064 §8 and §10, D-0098 §2). The magic link
// and the 6-digit code that rides in the same email (T-0300b's `lib/auth/magic-link.ts`, reused
// as it is), "Continue with Google", and the privacy link. The heading is "Save your plan" when
// this device holds a saveable pending plan, and "Sign in" otherwise.
//
// In `index.tsx`'s static graph: `/account` has no lazy step. Reading the pending plan here never
// writes it (a valid record stays byte-identical; an expired one is deleted by the read).
import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router";
import { en } from "../../lib/i18n/en.js";
import { supabase } from "../../lib/auth/client.js";
import { lastEmail, requestMagicLink, verifyCode } from "../../lib/auth/magic-link.js";
import { readSaveablePlan } from "./pending-plan.js";

/** D-0064 §10 (D-0010, NFR-PRIV-6). */
export const PRIVACY_URL = "https://workout.vestgote.com/privacy/";

type Mode = "link" | "code";
const MODES: readonly Mode[] = ["link", "code"];

const t = en.uf01.account;

const ERROR_TEXT = {
  invalid_email: en.auth.invalidEmail,
  invalid_code: en.auth.invalidCode,
  offline: en.auth.offline,
  rate_limited: en.auth.rateLimited,
  unknown: en.auth.unknown,
} as const;

function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

/** `navigator.onLine`, kept current by the `window` `online` / `offline` events. */
function useOnline(): boolean {
  const [online, setOnline] = useState(isOnline);
  useEffect(() => {
    const update = () => setOnline(isOnline());
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

const BACK_ICON = (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M15 18l-6-6 6-6" />
  </svg>
);

export function Account() {
  const id = useId();
  const [saveable] = useState(() => readSaveablePlan() !== null);
  const [mode, setMode] = useState<Mode>("link");
  const [email, setEmail] = useState(lastEmail());
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const online = useOnline();
  const [googleBusy, setGoogleBusy] = useState(false);
  // A ref, not only state: two activations in the same tick must still make one call (AC-3).
  const googleInFlight = useRef(false);

  async function onSendLink(e: React.FormEvent) {
    e.preventDefault();
    const result = await requestMagicLink(email);
    setMessage(result.ok ? en.auth.linkSent : ERROR_TEXT[result.error]);
  }

  async function onVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    const result = await verifyCode(email, code);
    setMessage(result.ok ? null : ERROR_TEXT[result.error]);
  }

  async function onGoogle() {
    if (!online || !isOnline() || googleInFlight.current) return;
    googleInFlight.current = true;
    setGoogleBusy(true);
    let failed = false;
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      failed = Boolean(error);
    } catch {
      failed = true;
    }
    // On success the browser is leaving for Google, so the button stays busy.
    if (failed) {
      googleInFlight.current = false;
      setGoogleBusy(false);
      setMessage(en.auth.unknown);
    }
  }

  const googleDisabled = !online || googleBusy;
  const offlineNoteId = `${id}-google-offline`;
  const tabId = (m: Mode) => `${id}-tab-${m}`;
  const panelId = `${id}-panel`;
  const tabRefs = useRef<Partial<Record<Mode, HTMLButtonElement | null>>>({});

  // WAI-ARIA tabs with automatic activation (T-0382, NFR-A11Y-2): arrows move and select,
  // wrapping; Home/End go to the ends. Enter, Space and click stay the button's own activation.
  function onTabKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, from: Mode) {
    const at = MODES.indexOf(from);
    let next: Mode | undefined;
    if (e.key === "ArrowRight") next = MODES[(at + 1) % MODES.length];
    else if (e.key === "ArrowLeft") next = MODES[(at - 1 + MODES.length) % MODES.length];
    else if (e.key === "Home") next = MODES[0];
    else if (e.key === "End") next = MODES[MODES.length - 1];
    if (next === undefined) return;
    e.preventDefault();
    setMode(next);
    tabRefs.current[next]?.focus();
  }

  const emailField = (
    <label className="wl-uf01__field">
      <span className="wl-uf01__field-label">{en.auth.emailLabel}</span>
      <input
        className="wl-uf01__input"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
      />
    </label>
  );

  return (
    <div data-screen-id="UF-01.5" className="wl-uf01">
      {saveable ? (
        <div className="wl-uf01__header">
          <Link to="/welcome/schedule" className="wl-uf01__back" aria-label={en.uf01.back}>
            {BACK_ICON}
          </Link>
        </div>
      ) : null}
      <div className="wl-uf01__intro">
        <h1 className="wl-uf01__title wl-uf01__title--step">
          {saveable ? t.headingSave : t.headingSignIn}
        </h1>
        <p className="wl-uf01__muted">{saveable ? t.subtitleSave : t.subtitleSignIn}</p>
      </div>
      <div className="wl-uf01__tabs" role="tablist" aria-label={t.modesName}>
        {MODES.map((m) => (
          <button
            key={m}
            ref={(el) => {
              tabRefs.current[m] = el;
            }}
            id={tabId(m)}
            type="button"
            role="tab"
            className="wl-uf01__tab"
            aria-selected={mode === m}
            aria-controls={panelId}
            tabIndex={mode === m ? 0 : -1}
            onClick={() => setMode(m)}
            onKeyDown={(e) => onTabKeyDown(e, m)}
          >
            {m === "link" ? en.auth.sendLinkTab : en.auth.enterCodeTab}
          </button>
        ))}
      </div>
      <div id={panelId} role="tabpanel" aria-labelledby={tabId(mode)}>
        {mode === "link" ? (
          <form className="wl-uf01__auth-form" noValidate onSubmit={onSendLink}>
            {emailField}
            <button type="submit" className="wl-uf01__primary">
              {en.auth.sendLinkButton}
            </button>
          </form>
        ) : (
          <form className="wl-uf01__auth-form" noValidate onSubmit={onVerifyCode}>
            {emailField}
            <label className="wl-uf01__field">
              <span className="wl-uf01__field-label">{en.auth.codeLabel}</span>
              <input
                className="wl-uf01__input"
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="one-time-code"
              />
            </label>
            <button type="submit" className="wl-uf01__primary">
              {en.auth.verifyCodeButton}
            </button>
          </form>
        )}
      </div>
      {/* Mounted from the first paint and filled in place, so the text is announced (NFR-A11Y-1). */}
      <p role="status" className="wl-uf01__status">
        {message}
      </p>
      <p className="wl-uf01__or" aria-hidden="true">
        {t.or}
      </p>
      <div className="wl-uf01__auth-form">
        <button
          type="button"
          className="wl-uf01__ghost"
          aria-disabled={googleDisabled ? "true" : "false"}
          aria-describedby={online ? undefined : offlineNoteId}
          onClick={() => void onGoogle()}
        >
          {t.google}
        </button>
        {online ? null : (
          <p id={offlineNoteId} className="wl-uf01__muted">
            {en.auth.offline}
          </p>
        )}
      </div>
      <p className="wl-uf01__footer">
        <a href={PRIVACY_URL} className="wl-uf01__link">
          {t.privacy}
        </a>
      </p>
    </div>
  );
}
