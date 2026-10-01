// Test harness for UF-01 (T-0301b). Mounts the `Welcome` export of `features/UF-01/index.tsx`
// (the name `routes.ts` loads) under a `MemoryRouter` with a `/welcome/*` route, the way the
// shell mounts it. `index.tsx` also exports UF-01.5, which imports `lib/auth/client`, so each
// test file mocks that module before importing this harness.
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { Welcome } from "../index.js";

export const KEY = "wl-onboarding";

export const where = { current: "" };

function Probe() {
  where.current = useLocation().pathname;
  return null;
}

export function mountAt(path: string): { unmount(): void; container: HTMLElement } {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Probe />
      <Routes>
        <Route path="/welcome/*" element={<Welcome />} />
        <Route path="/account" element={<div data-screen-id="UF-01.5" />} />
      </Routes>
    </MemoryRouter>,
  );
}

export function screenId(): string | null {
  return document.querySelector("[data-screen-id]")?.getAttribute("data-screen-id") ?? null;
}

/** Waits until `id` is on screen (the lazy views resolve in a later task). */
export async function findScreen(id: string): Promise<HTMLElement> {
  return (await screen.findByText(
    (_, el) => el?.getAttribute("data-screen-id") === id,
    {},
    { timeout: 2000 },
  )) as HTMLElement;
}

/** One settled macrotask turn (50 ms), not a microtask flush. */
export async function settle(): Promise<void> {
  await act(() => new Promise((r) => setTimeout(r, 50)));
}

export function stored(): unknown {
  const raw = window.localStorage.getItem(KEY);
  return raw === null ? null : JSON.parse(raw);
}

export function progressText(): string | null {
  return document.querySelector('[data-field="progress"]')?.textContent ?? null;
}

export function setOnline(value: boolean): void {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => value });
}
