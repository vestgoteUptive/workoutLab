// Shared helpers for the C-01 tests (T-0300d).
import { readFileSync } from "node:fs";
import type { ReactElement } from "react";
import { render, type RenderResult } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import type { Area } from "@workoutlab/shared";

import { CSS_PATH } from "./paths.js";

export { COMPONENT_DIR, CSS_PATH } from "./paths.js";

/** Vitest doesn't process CSS imports, so tests that read computed styles inject the real file. */
export function injectBodyMapCss(): HTMLStyleElement {
  const style = document.createElement("style");
  style.textContent = readFileSync(CSS_PATH, "utf8");
  document.head.appendChild(style);
  return style;
}

function LocationProbe() {
  const { pathname } = useLocation();
  return <output data-testid="location">{pathname}</output>;
}

/** Renders `ui` inside a router with a location probe, starting at `path`. */
export function renderInRouter(ui: ReactElement, path = "/"): RenderResult {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={ui} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
}

export function mapRoot(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>('[data-component="C-01"]');
  if (!el) throw new Error("C-01 not rendered");
  return el;
}

export function areaEl(container: HTMLElement, area: Area): HTMLElement {
  const el = mapRoot(container).querySelector<HTMLElement>(`[data-area="${area}"]`);
  if (!el) throw new Error(`area ${area} not rendered`);
  return el;
}

export function fillOf(container: HTMLElement, area: Area): HTMLElement {
  const el = areaEl(container, area).querySelector<HTMLElement>('[data-part="fill"]');
  if (!el) throw new Error(`fill of ${area} not rendered`);
  return el;
}

/** Text a screen reader gets from `el`'s subtree: skips `aria-hidden` subtrees. */
export function accessibleText(el: Element): string {
  let out = "";
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) out += node.textContent ?? "";
    else if (node instanceof Element && node.getAttribute("aria-hidden") !== "true") {
      out += accessibleText(node);
    }
  }
  return out.trim();
}

/** Installs a `matchMedia` mock; `reduce` decides `(prefers-reduced-motion: reduce)`. */
export function mockMatchMedia(reduce: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query.includes("prefers-reduced-motion: reduce") ? reduce : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

export function removeMatchMedia(): void {
  Reflect.deleteProperty(window, "matchMedia");
}
