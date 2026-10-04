// T-0453 UF-07.1 (D-0162 §4-§5): focus after Remove and a picker Add, and the delete dialog
// that holds focus and leaves the form inert. AC-1 to AC-4; AC-5 is the e2e row.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { R, R2, putRoutine, renderEditor, seed } from "./harness.js";
import { setOnline } from "./spies.js";

vi.mock("../../../lib/auth/auth-context.js", async () => (await import("./spies.js")).mockedAuth());
vi.mock("../../../lib/auth/client.js", async () => (await import("./spies.js")).mockedClient());
vi.mock("../../../lib/offline/index.js", async (importActual) =>
  (await import("./spies.js")).mockedOffline(importActual),
);

const button = (name: string) => screen.getByRole("button", { name });
const search = () => screen.getByLabelText("Search exercises");

async function ready(path: string) {
  renderEditor(path);
  await screen.findByLabelText("Name");
  if (!path.endsWith("new")) await screen.findByText(/^1\. /);
}

/** Focuses the button, then clicks it, as a keyboard user would. */
function press(name: string) {
  const el = button(name);
  el.focus();
  fireEvent.click(el);
}

beforeEach(() => seed());

describe("AC-1 focus after Remove", () => {
  it("a middle row: focus goes to the Remove of the row now at that position", async () => {
    await ready(`/plan/routines/${R}`);
    press("Remove Romanian deadlift (barbell)");
    expect(screen.getByText("2. Leg curl (machine)")).toBeInTheDocument();
    expect(document.activeElement).toBe(button("Remove Leg curl (machine)"));
    expect(screen.getByRole("status")).toHaveTextContent("Romanian deadlift (barbell) removed");
  });

  it("the last row: focus goes to the new last row's Remove", async () => {
    await ready(`/plan/routines/${R}`);
    press("Remove Leg curl (machine)");
    expect(document.activeElement).toBe(button("Remove Romanian deadlift (barbell)"));
  });

  it("the only row, picker closed: focus ends on Add exercise", async () => {
    await ready(`/plan/routines/${R}`);
    press("Remove Barbell back squat");
    press("Remove Romanian deadlift (barbell)");
    press("Remove Leg curl (machine)");
    expect(document.activeElement).toBe(button("Add exercise"));
  });

  it("the only row, picker open: focus ends on the search field", async () => {
    await ready(`/plan/routines/${R}`);
    fireEvent.click(button("Add exercise"));
    press("Remove Barbell back squat");
    press("Remove Romanian deadlift (barbell)");
    press("Remove Leg curl (machine)");
    expect(document.activeElement).toBe(search());
  });
});

describe("AC-2 focus after a picker Add", () => {
  it("goes to the search field; the row shows the disabled Added", async () => {
    await ready("/plan/routines/new");
    fireEvent.click(button("Add exercise"));
    press("Add Plank");
    expect(document.activeElement).toBe(search());
    expect(screen.getByRole("button", { name: "Added" })).toBeDisabled();
  });

  it("at the limit, every Add is disabled and focus is still on the search field", async () => {
    await putRoutine(R2, "Seven", [
      "barbell-back-squat",
      "barbell-front-squat",
      "goblet-squat-dumbbell",
      "romanian-deadlift-barbell",
      "leg-curl-machine",
      "bench-press-barbell",
      "pull-up",
    ]);
    await ready(`/plan/routines/${R2}`);
    fireEvent.click(button("Add exercise"));
    press("Add Plank");
    expect(screen.getByText("Up to 8 exercises")).toBeInTheDocument();
    for (const b of screen.queryAllByRole("button", { name: /^Add (?!exercise$)/ })) {
      expect(b).toBeDisabled();
    }
    expect(document.activeElement).toBe(search());
  });
});

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')!;
const tab = (shift = false) =>
  fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: shift });

describe("AC-3 the delete dialog holds focus and the form is inert", () => {
  it("Tab and Shift+Tab cycle Keep routine and Delete, never leaving the dialog", async () => {
    await ready(`/plan/routines/${R}`);
    fireEvent.click(button("Delete routine"));
    const keep = button("Keep routine");
    const del = button("Delete");
    expect(document.activeElement).toBe(keep);
    tab();
    expect(document.activeElement).toBe(del);
    tab();
    expect(document.activeElement).toBe(keep);
    tab(true);
    expect(document.activeElement).toBe(del);
    expect(dialog().contains(document.activeElement)).toBe(true);
  });

  it("while open, the form parts are inert and the dialog is not; closing clears it", async () => {
    await ready(`/plan/routines/${R}`);
    fireEvent.click(button("Delete routine"));
    const parts = [
      screen.getByLabelText("Name").parentElement!,
      document.querySelector('section[aria-labelledby="wl-routine-exercises"]')!,
      document.querySelector('[data-card="progression"]')!,
      document.querySelector(".wl-routine-editor__actions")!,
    ];
    for (const part of parts) expect(part).toHaveAttribute("inert");
    for (let el: Element | null = dialog(); el; el = el.parentElement) {
      expect(el).not.toHaveAttribute("inert");
    }
    fireEvent.click(button("Keep routine"));
    expect(document.querySelectorAll("[inert]")).toHaveLength(0);
    expect(document.activeElement).toBe(button("Delete routine"));
  });

  it("Escape closes it, clears inert and returns focus to Delete routine", async () => {
    await ready(`/plan/routines/${R}`);
    fireEvent.click(button("Delete routine"));
    fireEvent.keyDown(button("Keep routine"), { key: "Escape" });
    expect(document.querySelectorAll("[inert]")).toHaveLength(0);
    expect(document.activeElement).toBe(button("Delete routine"));
  });
});

describe("AC-4 offline", () => {
  it("Delete is disabled and Tab and Shift+Tab both leave focus on Keep routine", async () => {
    await ready(`/plan/routines/${R}`);
    fireEvent.click(button("Delete routine"));
    setOnline(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    const keep = screen.getByRole("button", { name: "Keep routine" });
    expect(button("Delete")).toBeDisabled();
    tab();
    expect(document.activeElement).toBe(keep);
    tab(true);
    expect(document.activeElement).toBe(keep);
  });
});
