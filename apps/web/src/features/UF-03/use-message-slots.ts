// T-0670 UF-03.1: a row's messages (swap tag, hints, save status) are laid under the row, one
// slot each. A slot is at least 3 rem (one line) and grows with a message that wraps, so a long
// hint at a narrow width or a large text size never overlaps the next row, the row's fields or
// the message below it. The CSS carries the one-line fallback (--wl-slot, --wl-msgs); this sets
// --wl-off on each shown message and --wl-pad on the row once it has measured them.
import { useEffect, type RefObject } from "react";

const MESSAGES = ".wl-uf03-list__tag, .wl-uf03-list__hint, .wl-uf03-list__status";
const MIN_SLOT_REM = 3;
const GAP_REM = 0.5;

export function useMessageSlots(row: RefObject<HTMLElement | null>, shownKey: string): void {
  useEffect(() => {
    const tr = row.current;
    if (!tr) return;
    const all = Array.from(tr.querySelectorAll<HTMLElement>(MESSAGES));
    const layout = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      let offset = 0;
      for (const el of all) {
        if (el.textContent === "") continue;
        el.style.setProperty("--wl-off", `${offset}px`);
        offset += Math.max(MIN_SLOT_REM * rem, el.offsetHeight + GAP_REM * rem);
      }
      tr.style.setProperty("--wl-pad", `${offset}px`);
    };
    layout();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(layout);
    observer.observe(tr);
    for (const el of all) observer.observe(el);
    return () => observer.disconnect();
  }, [row, shownKey]);
}
