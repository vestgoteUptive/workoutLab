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
// `status` alone can't tell apart the SPA-navigate and hard-navigate reactive cases: `/plan/
// account` (where the delete flow lives) is `guard: "protected"` (routes.ts), so `RequireAuth`
// wraps it, and `RequireAuth` is itself *live* — the instant `status` becomes `"signed-out"`, it
// renders `<Navigate to={redirectTarget} replace />`, an SPA (History API) redirect to
// `/welcome`, on *both* branches alike (it doesn't know which one `AccountSettingsBody` is about
// to take). So neither `status` nor `window.location.pathname` nor any "is an unload imminent"
// signal checked *before* consuming is reliable: two earlier fix attempts tried exactly that
// (a pathname check, then a `pagehide`/`beforeunload` pre-unload veto) and were each correctly
// rejected in review — the pathname check because `RequireAuth`'s own redirect produces the same
// "/welcome" reading on both branches before the real unload happens, and the veto because
// `beforeunload` does not fire at all on iOS Safari (this PWA's actual target platform; by
// design, to protect bfcache eligibility) — so on iOS the hard-navigate branch would never set
// the veto flag, and the bug would reproduce unfixed on exactly the platform that matters most.
//
// This fix stops trying to detect "is an unload imminent" before consuming, and instead makes
// the consume *idempotent after the fact*: the reactive path consumes immediately, synchronously
// (exactly like the pre-T-0486 code, and exactly like the mount-time read below), so there is no
// window where a same-page re-render could show stale state. But if the notice is still showing
// (not dismissed) when the document actually starts going away, a `pagehide` handler writes the
// consumed value *back* into storage before the page is torn down. `pagehide` is the one event
// that reliably fires on every real navigation away from a page, including iOS Safari (unlike
// `beforeunload`) — the tradeoff is that it fires as the unload happens, not safely before it,
// so it can only restore a value, never veto a removal in time. That asymmetry is fine here: the
// hard-navigate branch's `location.replace(...)` call is what triggers this `pagehide` in the
// first place, so by the time any new document's JS runs, the write-back has already completed.
// The SPA-navigate and live-guard-redirect cases never unload this document, so `pagehide` never
// fires for them, and the key stays consumed. Dismissing the notice also removes the key again
// (not just local state): a `pagehide` can fire without an actual unload (e.g. the tab merely
// being backgrounded, bfcache-eligible) and write the key back while the notice is still showing;
// if the user then dismisses, Dismiss must still mean "gone for good", so it re-consumes. Either
// way, a `pagehide` that fires after Dismiss (the restore state already cleared) never resurrects
// a notice the user already dismissed.
//
// Imports only react, auth-context and the catalogue: no `lib/account`, no `lib/offline`, and no
// stylesheet. Its classes (`wl-account-deleted*`) are styled in `main.css` (T-0593).
import { useEffect, useRef, useState } from "react";
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

function restore(kind: NoticeKind): void {
  try {
    window.sessionStorage.setItem(KEY, kind === "done" ? "1" : "partial");
  } catch {
    // Storage unavailable: nothing more to do; the hard-navigate branch's own eventual
    // mount-time read already has nothing to lose here either.
  }
}

export function AccountDeletedNotice() {
  const { status } = useAuth();
  // Synchronous at first render; the key is removed in the effect below, so a StrictMode
  // double-invoked initializer still sees it.
  const [kind, setKind] = useState<NoticeKind | null>(peek);
  const mounted = useRef(false);
  // Set to the consumed kind right after a reactive (not mount-time) consume, for as long as
  // the notice is still showing and not yet dismissed; cleared on Dismiss. `pagehide` reads this
  // to decide whether to write the key back.
  const pendingRestore = useRef<NoticeKind | null>(null);

  useEffect(() => {
    const onPageHide = () => {
      // The document is actually going away (reliable cross-browser, including iOS Safari,
      // unlike `beforeunload`). If the reactive consume below ran and the notice is still
      // showing (the user never dismissed it), put the key back before this page is torn down,
      // so whatever loads next (this same URL, reloaded, if the "navigation" turns out to have
      // been to the very page already open, or truly the next document) still finds it.
      if (pendingRestore.current) restore(pendingRestore.current);
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
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
    // Consume immediately and synchronously, exactly like the mount-time read above and like
    // the pre-T-0486 code: no window where a same-page re-render could show stale state. If
    // this page never actually unloads (the SPA-navigate and live-guard-redirect cases),
    // nothing more happens, and the key stays consumed, as before. If it does unload (the
    // hard-navigate case), `pagehide` above writes the key back before the teardown completes.
    const read = consume();
    if (read) {
      setKind(read);
      pendingRestore.current = read;
    }
  }, [status]);

  if (!kind) return null;
  return (
    <div role="status" aria-live="polite" className="wl-account-deleted">
      <p className="wl-account-deleted__text">
        {kind === "done" ? en.accountDeleted.done : en.accountDeleted.partial}
      </p>
      <button
        type="button"
        className="wl-account-deleted__button"
        style={{ minWidth: "44px", minHeight: "44px" }}
        onClick={() => {
          // Clears the restore state *and* removes the key again: a `pagehide` that fired
          // without an actual unload (e.g. the tab merely backgrounded) may already have
          // written it back by now, and Dismiss must still mean "gone for good" in that case.
          pendingRestore.current = null;
          void consume();
          setKind(null);
        }}
      >
        {en.accountDeleted.dismiss}
      </button>
    </div>
  );
}
