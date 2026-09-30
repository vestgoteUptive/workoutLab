// T-0308a UF-07.1: AC-A4's keyboard half, and the render-loop guard (the trap that shipped in
// T-0307a and T-0308b). Split from editing.test.tsx so the move buttons' keyboard contract and
// the mount-stability proof each stand on their own.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { R, renderEditor, seed } from "./harness.js";
import { offline, spy } from "./spies.js";

vi.mock("../../../lib/auth/client.js", async () => (await import("./spies.js")).mockedClient());
vi.mock("../../../lib/offline/index.js", async (importActual) =>
  (await import("./spies.js")).mockedOffline(importActual),
);

const FOCUSABLE = "a[href], button:not([disabled]), input, select, textarea, [tabindex]";
const up = () => screen.getByRole("button", { name: "Move Leg curl (machine) up" });
const down = () => screen.getByRole("button", { name: "Move Leg curl (machine) down" });

async function ready(path: string) {
  const view = renderEditor(path);
  await screen.findByText(/^1\. /);
  return view;
}

/** Moves focus to the next enabled focusable in document order, the way Tab does. */
function pressTab() {
  const order = Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute("disabled") && el.getAttribute("tabindex") !== "-1",
  );
  const at = order.indexOf(document.activeElement as HTMLElement);
  order[at + 1 >= order.length ? 0 : at + 1]?.focus();
}

beforeEach(() => seed());

describe("AC-A4 the keyboard reaches and activates the move buttons", () => {
  it("Tab alone reaches Move Leg curl (machine) up: every move button is a native button in the tab order", async () => {
    await ready(`/plan/routines/${R}`);
    // No tabindex="-1", no div[role=button]: a native <button> is what makes Enter and Space
    // activate without a key handler of our own.
    for (const name of [
      "Move Barbell back squat down",
      "Move Romanian deadlift (barbell) up",
      "Move Leg curl (machine) up",
      "Remove Leg curl (machine)",
    ]) {
      const button = screen.getByRole("button", { name });
      expect(button.tagName).toBe("BUTTON");
      expect(button).not.toHaveAttribute("tabindex");
      expect(button.getAttribute("type")).toBe("button");
    }
    document.body.focus();
    let guard = 0;
    while (document.activeElement !== up() && guard++ < 40) pressTab();
    expect(up()).toHaveFocus();
  });

  it.each([
    ["Enter", (el: HTMLElement) => fireEvent.keyDown(el, { key: "Enter", code: "Enter" })],
    [
      "Space",
      (el: HTMLElement) =>
        fireEvent.keyDown(el, { key: " ", code: "Space" }) &&
        fireEvent.keyUp(el, { key: " ", code: "Space" }),
    ],
  ])(
    "%s is not swallowed by a key handler: nothing calls preventDefault, so the native activation stands",
    async (_how, press) => {
      await ready(`/plan/routines/${R}`);
      const button = up();
      button.focus();
      // fireEvent returns false only when a handler called preventDefault(). A native button
      // must see the key untouched, or the browser never fires its click.
      expect(press(button)).toBe(true);
      // And no handler of ours moved the row behind the browser's back (a double move).
      expect(screen.getByText("3. Leg curl (machine)")).toBeInTheDocument();
    },
  );

  it.each([
    ["Enter", "Enter", "Enter"],
    ["Space", " ", "Space"],
  ])(
    "%s activation (the click the browser fires) moves the row, twice, and lands focus on Down",
    async (_how, key, code) => {
      await ready(`/plan/routines/${R}`);
      /** One real key press on a focused native button: the key events, then the click. */
      const press = () => {
        const el = document.activeElement as HTMLElement;
        fireEvent.keyDown(el, { key, code });
        fireEvent.click(el, { detail: 0 });
        fireEvent.keyUp(el, { key, code });
      };
      up().focus();
      press();
      expect(screen.getByText("2. Leg curl (machine)")).toBeInTheDocument();
      // Focus follows the row, so a second press needs no new Tab.
      expect(up()).toHaveFocus();
      press();
      expect(screen.getByText("1. Leg curl (machine)")).toBeInTheDocument();
      expect(up()).toBeDisabled();
      expect(down()).toHaveFocus();
      expect(screen.getByRole("status")).toHaveTextContent(
        "Leg curl (machine) moved to position 1",
      );
    },
  );

  it("contrast: a key that is not Enter or Space never moves a row", async () => {
    await ready(`/plan/routines/${R}`);
    up().focus();
    for (const key of ["a", "ArrowUp", "Tab", "Escape"]) {
      fireEvent.keyDown(document.activeElement as HTMLElement, { key });
      fireEvent.keyUp(document.activeElement as HTMLElement, { key });
    }
    expect(screen.getByText("3. Leg curl (machine)")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("");
  });
});
