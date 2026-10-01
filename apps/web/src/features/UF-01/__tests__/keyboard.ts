// A minimal keyboard driver for jsdom, used by the AC-8 keyboard-only run.
//
// `@testing-library/user-event` is not a dependency of `apps/web`, and T-0301b may not add one.
// jsdom performs no default actions for keys, so this applies the browser defaults the AC-8
// run relies on, after dispatching a real `keydown`/`keyup` to the focused element (a handler
// that calls `preventDefault()` suppresses the default, as in a browser):
// - Tab / Shift+Tab: move focus along the sequential focus order. Only the checked radio of a
//   group is in it (or the first one when none is checked), as in browsers.
// - Enter: activate a focused link or button (a submit button submits its form).
// - Space: activate a focused button; check a focused radio.
// - ArrowDown/ArrowRight, ArrowUp/ArrowLeft on a radio: move to the next/previous radio of the
//   same `name` (wrapping), focus it and check it, firing `click` (which React maps to onChange).
import { act, fireEvent } from "@testing-library/react";

type Key =
  "Tab" | "ShiftTab" | "Enter" | "Space" | "ArrowDown" | "ArrowUp" | "ArrowRight" | "ArrowLeft";

const TABBABLE = "a[href], button:not([disabled]), input:not([disabled]), [tabindex]";

function isRadio(el: Element | null): el is HTMLInputElement {
  return el instanceof HTMLInputElement && el.type === "radio";
}

function radioGroup(radio: HTMLInputElement): HTMLInputElement[] {
  return [...document.querySelectorAll<HTMLInputElement>(`input[type="radio"]`)].filter(
    (r) => r.name === radio.name && r.form === radio.form && !r.disabled,
  );
}

function tabOrder(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(TABBABLE)].filter((el) => {
    if (el.getAttribute("tabindex") === "-1") return false;
    if (el.closest("[aria-hidden='true'], [inert]")) return false;
    if (isRadio(el)) {
      const group = radioGroup(el);
      const checked = group.find((r) => r.checked);
      return checked ? checked === el : group[0] === el;
    }
    return true;
  });
}

function active(): HTMLElement {
  return (document.activeElement as HTMLElement | null) ?? document.body;
}

function defaultAction(key: Key, target: HTMLElement): void {
  if (key === "Tab" || key === "ShiftTab") {
    const order = tabOrder();
    const at = order.indexOf(target);
    const next =
      key === "Tab" ? (order[at + 1] ?? order[0]) : (order[at - 1] ?? order[order.length - 1]);
    next?.focus();
    return;
  }
  if (key === "Enter") {
    if (target instanceof HTMLAnchorElement || target instanceof HTMLButtonElement) {
      fireEvent.click(target);
    }
    return;
  }
  if (key === "Space") {
    if (target instanceof HTMLButtonElement) fireEvent.click(target);
    else if (isRadio(target) && !target.checked) fireEvent.click(target);
    return;
  }
  if (isRadio(target)) {
    const group = radioGroup(target);
    const at = group.indexOf(target);
    const step = key === "ArrowDown" || key === "ArrowRight" ? 1 : -1;
    const next = group[(at + step + group.length) % group.length]!;
    next.focus();
    fireEvent.click(next);
  }
}

const KEY_PROPS: Record<Key, { key: string; code: string; shiftKey?: boolean }> = {
  Tab: { key: "Tab", code: "Tab" },
  ShiftTab: { key: "Tab", code: "Tab", shiftKey: true },
  Enter: { key: "Enter", code: "Enter" },
  Space: { key: " ", code: "Space" },
  ArrowDown: { key: "ArrowDown", code: "ArrowDown" },
  ArrowUp: { key: "ArrowUp", code: "ArrowUp" },
  ArrowRight: { key: "ArrowRight", code: "ArrowRight" },
  ArrowLeft: { key: "ArrowLeft", code: "ArrowLeft" },
};

/** Presses each key in turn on the focused element. */
export async function press(...keys: Key[]): Promise<void> {
  for (const key of keys) {
    await act(async () => {
      const target = active();
      const props = KEY_PROPS[key];
      const proceed = fireEvent.keyDown(target, props);
      if (proceed) defaultAction(key, target);
      fireEvent.keyUp(active(), props);
    });
  }
}

/** Presses Tab until `match` is focused (at most `limit` times); fails if it never is. */
export async function tabTo(match: (el: HTMLElement) => boolean, limit = 20): Promise<void> {
  for (let i = 0; i < limit; i++) {
    if (match(active())) return;
    await press("Tab");
  }
  if (!match(active())) throw new Error(`tabTo: not reached; focus is on ${active().outerHTML}`);
}
