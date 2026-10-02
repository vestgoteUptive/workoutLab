// The one-time notice after an account deletion (D-0136 §6, NFR-PRIV-5; shown on UF-01.1).
//
// `lib/account` sets `sessionStorage["wl-account-deleted"]` to "1" (or "partial" when the local
// wipe threw) just before the local sign-out. This shell component reads that key, removes it
// at once, and shows a polite status with a Dismiss button. A reload shows nothing.
//
// It reads at mount (a fresh page) and each time the auth status becomes `signed-out` (the
// sign-out fires SIGNED_OUT in the same page). The read is synchronous: `/welcome`'s first
// render waits on nothing new (principle 5).
//
// Imports only react, auth-context and the catalogue: no `lib/account`, no `lib/offline`, and
// no stylesheet, so the inline styles below use design-token CSS variables only.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useAuth } from "../../lib/auth/auth-context.js";
import { en } from "../../lib/i18n/en.js";

// Same value as `ACCOUNT_DELETED_KEY` in lib/account (which this file may not import).
const KEY = "wl-account-deleted";

type NoticeKind = "done" | "partial";

function peek(): NoticeKind | null {
  try {
    const value = window.sessionStorage.getItem(KEY);
    if (value === "1") return "done";
    if (value === "partial") return "partial";
  } catch {
    // Storage unavailable: nothing to show.
  }
  return null;
}

function consume(): NoticeKind | null {
  const kind = peek();
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  return kind;
}

const boxStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  margin: "12px 16px",
  padding: "8px 8px 8px 16px",
  background: "var(--wl-color-surface)",
  color: "var(--wl-color-text)",
  border: "1px solid var(--wl-color-line-strong)",
  borderRadius: "8px",
};

const textStyle: CSSProperties = { flex: "1 1 auto", margin: 0 };

const buttonStyle: CSSProperties = {
  minWidth: "44px",
  minHeight: "44px",
  padding: "0 12px",
  background: "transparent",
  color: "var(--wl-color-accent)",
  border: "1px solid var(--wl-color-line-strong)",
  borderRadius: "6px",
  font: "inherit",
  cursor: "pointer",
};

export function AccountDeletedNotice() {
  const { status } = useAuth();
  // Synchronous at first render; the key is removed in the effect below, so a StrictMode
  // double-invoked initializer still sees it.
  const [kind, setKind] = useState<NoticeKind | null>(peek);
  const mounted = useRef(false);

  useEffect(() => {
    const first = !mounted.current;
    mounted.current = true;
    if (!first && status !== "signed-out") return;
    const read = consume();
    if (read) setKind(read);
  }, [status]);

  if (!kind) return null;
  return (
    <div role="status" aria-live="polite" style={boxStyle}>
      <p style={textStyle}>
        {kind === "done" ? en.accountDeleted.done : en.accountDeleted.partial}
      </p>
      <button type="button" style={buttonStyle} onClick={() => setKind(null)}>
        {en.accountDeleted.dismiss}
      </button>
    </div>
  );
}
