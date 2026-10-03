// T-0463 shared setup (D-0167 §2-4). The loader state and the `vi.mock` live in each spec file
// (hoisted per file); a resolved React.lazy stays resolved, so each file has at most one test
// that ends with a successful load.
import { fireEvent, render, screen, type RenderResult } from "@testing-library/react";
import { P1, S1, STARTED_AT_MS } from "./fixtures.js";
import { HostAt, flushReal, screenId } from "./helpers.js";
import { expect } from "vitest";
import { initialFocusState } from "../machine.js";

export const NOW = STARTED_AT_MS + 20 * 60_000;
export const FAIL = "Couldn't load this view.";
export const STALE = "Failed to fetch dynamically imported module: /assets/index-stale.js";
export const dialog = () => screen.queryByRole("dialog");
export const buttons = () =>
  Array.from(dialog()?.querySelectorAll("button") ?? []).map((b) => b.textContent);

// Not `session-helpers`/`set-loop-helpers`: they import UF-03/UF-04, which these specs mock.
function seedPaused(): void {
  window.localStorage.setItem(
    `wl-focus:${S1}`,
    JSON.stringify({
      ...initialFocusState(S1, P1, NOW),
      timer: null,
      phase: "paused",
      resumePhase: "set",
      pausedAtMs: NOW,
      itemIndex: 1,
    }),
  );
}

/** Polls on real macrotasks until `find()` returns an element (a positive wait). */
export async function findEl(find: () => Element | null, tries = 60): Promise<Element> {
  for (let i = 0; i < tries; i += 1) {
    const el = find();
    if (el) return el;
    await flushReal(10);
  }
  const el = find();
  expect(el).not.toBeNull();
  return el!;
}

export async function renderPaused(): Promise<void> {
  await renderPausedHost();
  if (screenId() !== "UF-09.9") throw new Error("expected UF-09.9");
}

/** Presses the Pause-screen button and waits until the overlay has settled (not "Loading"). */
export async function openSettled(name: string): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name }));
  await flushReal();
  await findEl(() => {
    const d = dialog();
    return d && !d.textContent?.includes("Loading") ? d : null;
  });
}

export const click = async (name: string): Promise<void> => {
  fireEvent.click(screen.getByRole("button", { name }));
  await flushReal();
};

const HOST_PROPS = { locale: "en-GB", timeZone: "UTC" } as const;

/** The paused host rendered through `HostAt`, so `rerender(hostTree())` is a re-render with the
 *  same props (a parent re-render, not a remount). */
export const hostTree = () => <HostAt {...HOST_PROPS} />;
export async function renderPausedHost(): Promise<RenderResult> {
  seedPaused();
  const view = render(hostTree());
  await flushReal();
  return view;
}

/**
 * Watches the page for the loading placeholder (F3). A resolved lazy of a cached module renders
 * the same component type, so React keeps the fiber and a count of mounts can't see a reset on
 * render; what does show is the Suspense fallback of the fresh, pending lazy.
 */
export function watchFallback(): { seen: () => boolean; stop: () => void } {
  let seen = false;
  const observer = new MutationObserver((records) => {
    for (const r of records) {
      r.addedNodes.forEach((n) => {
        if (n.textContent?.includes("Loading")) seen = true;
      });
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return { seen: () => seen, stop: () => observer.disconnect() };
}
