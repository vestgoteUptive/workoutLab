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
// `status` alone can't tell apart the two reactive cases: `/plan/account` (where the delete
// flow lives) is `guard: "protected"` (routes.ts), so `RequireAuth` wraps it, and `RequireAuth`
// is itself *live* — the instant `status` becomes `"signed-out"`, it renders
// `<Navigate to={redirectTarget} replace />`, an SPA (History API) redirect to `/welcome`, on
// *both* the SPA-navigate and the hard-navigate delete branches alike (it doesn't know which
// branch `AccountSettingsBody` is about to take). So a same- or later-tick check of
// `window.location.pathname` is not a reliable signal either: `RequireAuth`'s own redirect can
// make it read "/welcome" even on the hard-navigate branch, before `window.location.replace`
// has actually unloaded the document (confirmed: an earlier version of this fix used exactly
// that pathname check and was correctly rejected in review for this reason).
//
// The one signal that actually distinguishes "a real navigation is unloading this document" is
// the browser's own `pagehide` event (with `beforeunload` as a same-tick backstop):
// `location.replace(...)` dispatches these synchronously, before any of this component's
// deferred work runs, on every browser that matters here. So: the reactive path `peek()`s
// (read-only) to show the notice immediately, then schedules a `setTimeout(0)` that *consumes*
// (removes from storage) unless a `pagehide`/`beforeunload` listener (registered once, for the
// lifetime of this mount) has already flagged that this document is on its way out. The
// SPA-navigate and the live-guard-redirect cases never fire `pagehide`, so their deferred
// consume always runs; the hard-navigate case always fires it first, so its deferred consume
// never does — the pending timer from that effect run also never matters, because the real
// unload destroys this component (and its timer) shortly after anyway. A fresh mount (a hard
// navigation, or the first load) still consumes unconditionally and synchronously, exactly as
// before, since there's nothing left on that page to race.
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
  // Set by `pagehide`/`beforeunload`, which a hard navigation's `location.replace(...)` fires
  // synchronously, before this component's own deferred work below runs.
  const leaving = useRef(false);

  useEffect(() => {
    const onLeaving = () => {
      leaving.current = true;
    };
    window.addEventListener("pagehide", onLeaving);
    window.addEventListener("beforeunload", onLeaving);
    return () => {
      window.removeEventListener("pagehide", onLeaving);
      window.removeEventListener("beforeunload", onLeaving);
    };
  }, []);

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
    // Defer the *consume* past this commit's other effects (notably `RequireAuth`'s own
    // `<Navigate>`, which can render reactively on this very status change too). A hard
    // navigation fires `pagehide`/`beforeunload` before this timer runs, flipping `leaving` —
    // the only reliable "this document is actually going away" signal available here.
    const timer = window.setTimeout(() => {
      if (!leaving.current) consume();
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
