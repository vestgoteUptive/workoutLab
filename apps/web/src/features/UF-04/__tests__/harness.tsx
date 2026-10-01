// Test harness for UF-04 (T-0306a). Mounts the real components under a BrowserRouter over
// jsdom's real `history`, so `history.length`, Back and `replace` behave as in the browser.
// Components are imported dynamically: they pull in `lib/offline`, which must load only after
// the test file has installed its Supabase mock.
import { render } from "@testing-library/react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";

export function currentUrl(): string {
  return `${window.location.pathname}${window.location.search}`;
}

export function screenId(): string | null {
  return document.querySelector("[data-screen-id]")?.getAttribute("data-screen-id") ?? null;
}

export function rowNames(): string[] {
  return [...document.querySelectorAll('[data-field="name"]')].map((n) => n.textContent ?? "");
}

export function rowHrefs(): Array<[string, string]> {
  return [...document.querySelectorAll("li a")].map((a) => [
    a.textContent ?? "",
    a.getAttribute("href") ?? "",
  ]);
}

function Where() {
  useLocation();
  return null;
}

export async function mountAt(
  path: string,
  options: { timeZone?: string } = {},
): Promise<{ unmount(): void }> {
  const { Library, LibraryDetail, Compare } = await import("../index.js");
  window.history.replaceState(null, "", path);
  return render(
    <BrowserRouter>
      <Where />
      <Routes>
        <Route
          path="/library"
          element={
            <Library {...(options.timeZone === undefined ? {} : { timeZone: options.timeZone })} />
          }
        />
        <Route path="/library/:exerciseId" element={<LibraryDetail />} />
        <Route path="/library/:exerciseId/compare/:otherId" element={<Compare />} />
        <Route path="/progress/:id" element={<div data-screen-id="UF-06.2" />} />
      </Routes>
    </BrowserRouter>,
  );
}

export function setOnline(value: boolean): void {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => value });
}
