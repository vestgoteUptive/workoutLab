// UF-01 Welcome / Account / auth-callback (T-0300a stub; T-0300b wires real `lib/auth`
// behaviour behind these routes; T-0301 replaces them with the designed screens).
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { en } from "../../lib/i18n/en.js";
import { supabase } from "../../lib/auth/client.js";
import { lastEmail, requestMagicLink, verifyCode } from "../../lib/auth/magic-link.js";
import { consumeReturnTo } from "../../lib/auth/return-to.js";

export function Welcome() {
  return (
    <div data-screen-id="UF-01.1">
      <h1>{en.screens.welcome}</h1>
    </div>
  );
}

type Mode = "link" | "code";

const ERROR_TEXT = {
  invalid_email: en.auth.invalidEmail,
  invalid_code: en.auth.invalidCode,
  offline: en.auth.offline,
  rate_limited: en.auth.rateLimited,
  unknown: en.auth.unknown,
} as const;

// Bare UF-01.5 form: T-0301 owns the designed layout. This only has to expose both auth paths
// (AC-B3) and behave (AC-B2, AC-B4's pre-filled email).
export function Account() {
  const [mode, setMode] = useState<Mode>("link");
  const [email, setEmail] = useState(lastEmail());
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);

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

  return (
    <div data-screen-id="UF-01.5">
      <h1>{en.screens.account}</h1>
      <div role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "link"}
          onClick={() => setMode("link")}
        >
          {en.auth.sendLinkTab}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "code"}
          onClick={() => setMode("code")}
        >
          {en.auth.enterCodeTab}
        </button>
      </div>
      {mode === "link" ? (
        <form onSubmit={onSendLink}>
          <label>
            {en.auth.emailLabel}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>
          <button type="submit">{en.auth.sendLinkButton}</button>
        </form>
      ) : (
        <form onSubmit={onVerifyCode}>
          <label>
            {en.auth.emailLabel}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>
          <label>
            {en.auth.codeLabel}
            <input
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="one-time-code"
            />
          </label>
          <button type="submit">{en.auth.verifyCodeButton}</button>
        </form>
      )}
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}

export function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const code = searchParams.get("code");
    const errorCode = searchParams.get("error_code");

    if (errorCode === "otp_expired" || !code) {
      setExpired(true);
      return;
    }

    void supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) {
        setExpired(true);
        return;
      }
      navigate(consumeReturnTo(), { replace: true });
    });
    // Runs once for this landing: params don't change under this route.
  }, []);

  if (expired) {
    return (
      <div data-screen-id="UF-01.5-auth-callback">
        <p>{en.auth.linkExpired}</p>
        <Link to="/account">{en.auth.sendNewLink}</Link>
      </div>
    );
  }

  return (
    <div data-screen-id="UF-01.5-auth-callback">
      <h1>{en.screens.authCallback}</h1>
    </div>
  );
}
