// T-0981: measure a box only once the layout has settled. A one-shot `getBoundingClientRect()` or
// `boundingBox()` straight after a screen becomes visible can read a frame that is still moving
// (an enter animation, a late web font swapping the text metrics, a stylesheet that lands a frame
// after the markup). Under CPU load that frame is wide enough to catch, so a 44 px target check
// flaked once (T-0686b gate). These helpers wait for fonts and running animations, then read until
// three frames in a row agree. They never retry the assertion: an undersized box still reads small.
//
// The settle loop is written out in each page function on purpose: Playwright serialises a
// function's source, so it can't close over a shared one, and `new Function` is blocked by the
// app's Content-Security-Policy.
import type { Locator, Page } from "@playwright/test";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Target {
  name: string;
  w: number;
  h: number;
}

/** The settled box of one element, or null when it has none. */
export async function settledBox(target: Locator): Promise<Rect | null> {
  return target.evaluate(async (el) => {
    const read = (): Rect | null => {
      if (!el.isConnected) return null;
      const r = el.getBoundingClientRect();
      return r.width === 0 && r.height === 0
        ? null
        : { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    await document.fonts.ready;
    await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined)));
    let last = JSON.stringify(read());
    for (let stable = 0, i = 0; stable < 2 && i < 120; i++) {
      await new Promise<void>((done) => requestAnimationFrame(() => done()));
      const now = JSON.stringify(read());
      stable = now === last ? stable + 1 : 0;
      last = now;
    }
    return JSON.parse(last) as Rect | null;
  });
}

/** The settled `{ name, w, h }` of every element matching `selector` inside `rootSelector`. */
export async function settledTargets(
  page: Page,
  rootSelector: string,
  selector: string,
): Promise<Target[]> {
  return page.evaluate(
    async ({ rootSelector, selector }) => {
      const read = (): Target[] =>
        [...(document.querySelector(rootSelector)?.querySelectorAll(selector) ?? [])].map((el) => {
          const r = el.getBoundingClientRect();
          return {
            name: (el.getAttribute("aria-label") ?? el.textContent ?? "").trim(),
            w: r.width,
            h: r.height,
          };
        });
      await document.fonts.ready;
      await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined)));
      let last = JSON.stringify(read());
      for (let stable = 0, i = 0; stable < 2 && i < 120; i++) {
        await new Promise<void>((done) => requestAnimationFrame(() => done()));
        const now = JSON.stringify(read());
        stable = now === last ? stable + 1 : 0;
        last = now;
      }
      return JSON.parse(last) as Target[];
    },
    { rootSelector, selector },
  );
}
