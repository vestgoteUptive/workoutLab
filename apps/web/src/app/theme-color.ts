// T-0589 (D-0208 §2, D-0211): the browser chrome colour follows the screen root's state.
// The state is read from the outermost [data-screen-id] element; sheets and panels never change
// it. Values come from the design tokens, never from literals.
import { useEffect } from "react";
import { tokens } from "@workoutlab/design-tokens";

const STATE_BG: Record<string, string> = {
  plan: tokens.color.plan.bg,
  lift: tokens.color.lift.bg,
  rest: tokens.color.rest.bg,
};

/** The theme-color for the current DOM: the outermost screen root's state, else the legacy bg. */
export function themeColorForDocument(doc: Document = document): string {
  const root = doc.querySelector("[data-screen-id]");
  const state = root?.getAttribute("data-wl-state");
  return (state ? STATE_BG[state] : undefined) ?? tokens.color.bg;
}

/** Writes the meta tag, creating it when the build didn't inject one (dev). */
export function applyThemeColor(doc: Document = document): void {
  let meta = doc.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = doc.createElement("meta");
    meta.name = "theme-color";
    doc.head.appendChild(meta);
  }
  const next = themeColorForDocument(doc);
  if (meta.content !== next) meta.content = next;
}

/**
 * Call once in the shell. Re-applies on every route change and whenever a data-wl-state
 * attribute (or the set of screen roots) changes anywhere under the document body.
 */
export function useThemeColor(routeKey: string): void {
  useEffect(() => {
    applyThemeColor();
    const observer = new MutationObserver(() => applyThemeColor());
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-wl-state", "data-screen-id"],
    });
    return () => observer.disconnect();
  }, [routeKey]);
}
