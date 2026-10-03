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
// T-0486: the reactive `status === "signed-out"` path must not consume (remove) the key purely
// from the status flip, because that same event also reaches this instance on the hard-navigate
// delete branch (`AccountSettingsBody.onDelete`), *before* the browser has actually unloaded the
// document — a scheduling race, not a logic bug with one outcome. If this path removed the key
// there, the *next* page's own mount-time read (a fresh instance, a fresh `peek()`) would
// sometimes find nothing (T-0486).
//
// The two real cases need different handling, and `status` alone can't tell them apart — but
// the URL can: the SPA-navigate branch specifically calls `navigate("/welcome", { replace:
// true })` while staying mounted in the same document (this component lives in `App.tsx`,
// outside the route tree, and is never remounted by a client-side route change). So can a route
// guard's own redirect (`RequireAuth`'s `<Navigate>`), which also lands on `/welcome` while this
// instance stays mounted. Either way, React Router's `BrowserRouter` drives the actual URL
// change through the History API from a `useEffect` of its own (`<Navigate>`'s), so
// `window.location.pathname` is not guaranteed to already be "/welcome" in *this* component's
// own effect for the same commit — effects run in tree order, and this component sits before
// the route tree in `Shell`. A `setTimeout` of zero, scheduled from this effect, runs after
// every effect from this commit (including any `<Navigate>`'s) has flushed, so by then the URL
// reflects any same-commit SPA redirect. The hard-navigate branch never changes the SPA route at
// all — it reloads the document (a real navigation), which unmounts this instance (cancelling
// the pending timeout) well before that timeout could ever fire with a stale "/welcome" read. So:
// consume only once, after that delay, if `status` is (still) `"signed-out"` *and*
// `window.location.pathname` is (by then) `"/welcome"` — a combination the hard-navigate branch
// can never produce before this instance is torn down. A fresh mount (a hard navigation, or the
// first load) still consumes unconditionally and synchronously, exactly as before. A plain DOM
// read, not `react-router`'s `useLocation()`, keeps this file's import boundary (T-0310c AC11)
// unchanged.
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
    if (first) {
      // A fresh mount (a hard navigation, or the very first load): this is the only point that
      // unconditionally removes the key, so a second mount (another hard navigation) never
      // shows it again.
      const read = consume();
      if (read) setKind(read);
      return;
    }
    if (status !== "signed-out") return;
    // `peek()` now (read-only, so a hard-navigate's imminent unload can't lose the key) so the
    // notice shows immediately, same tick, for every reactive case.
    const seen = peek();
    if (seen) setKind(seen);
    // Defer the *consume* past this commit's other effects (notably any `<Navigate>` the router
    // renders alongside this one), so `window.location.pathname` reflects a same-commit SPA
    // redirect by the time this runs. A hard navigation unmounts this instance first, which
    // cancels the timeout before it can ever fire against a stale "/welcome" read.
    const timer = window.setTimeout(() => {
      if (window.location.pathname === "/welcome") consume();
    }, 0);
    return () => window.clearTimeout(timer);
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
