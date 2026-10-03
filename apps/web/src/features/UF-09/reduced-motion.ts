// UF-09 reduced motion (T-0304g, NFR-A11Y-5, D-0119 §10, D-0155 §1–§2). The ring fill's inline
// transition: "none" under `prefers-reduced-motion: reduce`, else a 1 s linear sweep. A browser
// with no `matchMedia` counts as reduce (D-0155 §2, the C-01 default). UF-09 may not import the
// C-01 body map's hook (AC-D11), so this is its own few-line read.
import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/** The ring fill's inline `style.transition` with motion allowed. */
export const RING_TRANSITION = "stroke-dashoffset 1s linear";

function hasMatchMedia(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function";
}

function subscribe(onChange: () => void): () => void {
  if (!hasMatchMedia()) return () => undefined;
  try {
    const mql = window.matchMedia(QUERY);
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  } catch {
    return () => undefined;
  }
}

/** `true` when motion should be reduced: the preference is set, or it can't be read. */
export function prefersReducedMotion(): boolean {
  if (!hasMatchMedia()) return true;
  try {
    return window.matchMedia(QUERY).matches === true;
  } catch {
    return true;
  }
}

/** The ring fill's inline transition for the current preference (follows a live change). */
export function useRingTransition(): string {
  const reduce = useSyncExternalStore(subscribe, prefersReducedMotion, () => true);
  return reduce ? "none" : RING_TRANSITION;
}
