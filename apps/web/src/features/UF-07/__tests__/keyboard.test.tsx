// T-0308a UF-07.1: AC-A4's keyboard half, and the render-loop guard (the trap that shipped in
// T-0307a and T-0308b). Split from editing.test.tsx so the move buttons' keyboard contract and
// the mount-stability proof each stand on their own.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { Shell } from "../../../app/App.js";
import { R, renderEditor, seed } from "./harness.js";
import { offline, spy } from "./spies.js";

vi.mock("../../../lib/auth/client.js", async () => (await import("./spies.js")).mockedClient());
vi.mock("../../../lib/offline/index.js", async (importActual) =>
  (await import("./spies.js")).mockedOffline(importActual),
);
// `Shell` mounts the auth guard, which needs a provider. The editor itself reads no auth.
vi.mock("../../../lib/auth/auth-context.js", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ status: "signed-in" as const, redirectTarget: "/welcome", signOut: vi.fn() }),
}));

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

// The render-loop trap (shipped by T-0307a and T-0308b). A per-render `new Date()`, or a ref
// assigned during render, that reaches the load effect's deps re-runs the loaders forever. Unit
// tests miss it whenever they inject `now`, so these mount through the real `Shell` with **no
// `now` seam of any kind**: the hook reads the wall clock, and every re-render gets a fresh
// closure. The assertion is on unbounded growth, not on an exact count, because the count under
// the fault depends on how fast the machine spins.
describe("the load effect is pinned at mount (render-loop guard)", () => {
  /** Settles for `ms` of real time, letting any runaway effect chain keep going. */
  const settle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const mountShell = (path: string) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <Shell />
      </MemoryRouter>,
    );

  it("an existing routine reads each cache once and stops, across a long settle and forced re-renders", async () => {
    mountShell(`/plan/routines/${R}`);
    await screen.findByText("1. Barbell back squat");
    await settle(120);
    const after = { lib: offline.loadLibraryCalls, routines: offline.loadRoutinesCalls };
    expect(after).toEqual({ lib: 1, routines: 1 });

    // Force re-renders from the outside, the way a parent or a resize would. A `new Date()` on
    // the render path gives the effect a new dep on each one, so the loaders run again.
    for (let i = 0; i < 6; i++) {
      act(() => {
        fireEvent.change(screen.getByLabelText("Name"), { target: { value: `Lower A${i}` } });
      });
      await settle(20);
    }
    expect(offline.loadLibraryCalls).toBe(after.lib);
    expect(offline.loadRoutinesCalls).toBe(after.routines);
    // A loop would also drive the refresh and the redirect.
    expect(offline.refreshRoutines).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Name")).toHaveValue("Lower A5");
  });

  it("a new routine's id is pinned at mount: 20 re-renders never change it, and Save sends that one id", async () => {
    mountShell("/plan/routines/new");
    await screen.findByLabelText("Name");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Push" } });
    fireEvent.click(screen.getByRole("button", { name: "Add exercise" }));
    fireEvent.click(await screen.findByRole("button", { name: "Add Plank" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    // Save on every re-render, so a per-render id shows up as a second id in the spy. A ref
    // assigned during render (the other shape the brief names) fails here, not just at a retry.
    // Every attempt fails at step 1, so the editor stays mounted for all 20 and never navigates.
    spy.fail("routines.upsert", ...Array.from({ length: 20 }, () => "error" as const));
    for (let i = 0; i < 20; i++) {
      fireEvent.change(screen.getByLabelText("Name"), { target: { value: `Push ${i}` } });
      fireEvent.submit(screen.getByRole("form"));
      await settle(5);
    }
    await settle(80);
    expect(offline.loadLibraryCalls).toBe(1);
    const routineCalls = spy.calls.filter((c) => c.table === "routines");
    expect(routineCalls.length).toBeGreaterThanOrEqual(20);
    const ids = new Set(routineCalls.map((c) => (c.payload as { id: string }).id));
    expect(ids.size).toBe(1);
  });

  it("an unknown id redirects once: the loaders and the refresh each run once, not in a loop", async () => {
    mountShell("/plan/routines/99999999-9999-4999-8999-999999999999");
    await settle(150);
    expect(offline.refreshRoutines).toHaveBeenCalledTimes(1);
    expect(offline.loadLibraryCalls).toBe(1);
    // The unknown-id path reads the cache twice by design: once before the refresh, once after.
    expect(offline.loadRoutinesCalls).toBe(2);
  });
});
