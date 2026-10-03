// UF-09 Back means Pause (T-0394, D-0123 §3, D-0162 §1). Pure history plumbing: one guard entry
// with the same URL sits on top of the session entry while a machine state runs. A Back pops it,
// lands on the session URL without the flag, and the host turns that into Pause (or closes an
// overlay to Pause) and pushes the guard again. No `useBlocker`; the router isn't involved.
import { useEffect, useRef } from "react";

/** True while the guard entry is the current history entry. */
export function guardOnTop(): boolean {
  const state: unknown = window.history.state;
  return typeof state === "object" && state !== null && "wlFocusGuard" in state
    ? (state as { wlFocusGuard?: unknown }).wlFocusGuard === true
    : false;
}

/** Pushes the guard entry (same URL) unless it is already on top. */
export function pushGuard(): void {
  if (guardOnTop()) return;
  const state: unknown = window.history.state;
  const base = typeof state === "object" && state !== null ? state : {};
  window.history.pushState({ ...base, wlFocusGuard: true }, "", window.location.href);
}

/**
 * Arms the guard on mount (`armOnMount`), and calls `onBack` for a Back that lands on `/session/<id>`
 * without the guard flag. `armOnMount` false (host-level states) never pushes.
 */
export function useBackGuard(sessionId: string, armOnMount: boolean, onBack: () => void): void {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  // Armed once on mount, whatever the state (a paused restore included). Not on every render:
  // the router's own popstate render runs before this listener and must not push a guard first.
  const armOnMountRef = useRef(armOnMount);
  useEffect(() => {
    if (armOnMountRef.current) pushGuard();
  }, []);
  useEffect(() => {
    const onPop = () => {
      if (window.location.pathname !== `/session/${sessionId}`) return;
      if (guardOnTop()) return;
      onBackRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [sessionId]);
}
