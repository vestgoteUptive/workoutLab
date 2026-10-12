// T-0610 UF-07.1 in the plan state: AC1 state, AC2 errors, AC3 danger, AC4 selected row, AC6 both
// routines render. Layout, contrast and motion are in t0610.css.test.ts (jsdom has no layout).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { tokens } from "@workoutlab/design-tokens";
import { applyThemeColor } from "../../../app/theme-color.js";
import { R, renderEditor, seed } from "./harness.js";

vi.mock("../../../lib/auth/auth-context.js", async () => (await import("./spies.js")).mockedAuth());
vi.mock("../../../lib/auth/client.js", async () => (await import("./spies.js")).mockedClient());
vi.mock("../../../lib/offline/index.js", async (importActual) =>
  (await import("./spies.js")).mockedOffline(importActual),
);
beforeEach(() => seed());

const root = () => document.querySelector<HTMLElement>('[data-screen-id="UF-07.1"]')!;

describe("T-0610 AC1 state", () => {
  it("the root is the plan state on the page gutter; the chrome follows it", async () => {
    renderEditor(`/plan/routines/${R}`);
    await screen.findByLabelText("Name");
    expect(root().getAttribute("data-wl-state")).toBe("plan");
    expect(root().classList.contains("wl-page")).toBe(true);
    applyThemeColor();
    expect(document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]')!.content).toBe(
      tokens.color.plan.bg,
    );
  });
});

describe("T-0610 AC2 errors", () => {
  it("an invalid name is aria-invalid on a .wl-input with its error words as .wl-input__error", async () => {
    renderEditor(`/plan/routines/${R}`);
    const name = await screen.findByLabelText("Name");
    expect(name.classList.contains("wl-input")).toBe(true);
    expect(name.getAttribute("aria-invalid")).toBe("false");
    fireEvent.change(name, { target: { value: "" } });
    expect(name.getAttribute("aria-invalid")).toBe("true");
    const hint = document.getElementById(name.getAttribute("aria-describedby")!)!;
    expect(hint.classList.contains("wl-input__error")).toBe(true);
    expect(hint.textContent).toMatch(/Name your routine/);
  });
});

describe("T-0610 AC3 danger", () => {
  it("Delete routine is the secondary outline, last in its section, name unchanged", async () => {
    renderEditor(`/plan/routines/${R}`);
    const del = await screen.findByRole("button", { name: "Delete routine" });
    expect(del.classList.contains("wl-button--secondary")).toBe(true);
    expect(del.classList.contains("wl-button--primary")).toBe(false);
    const actions = del.parentElement!;
    const buttons = [...actions.querySelectorAll("button")];
    expect(buttons[buttons.length - 1]).toBe(del);
    expect(actions.querySelectorAll(".wl-button--primary").length).toBe(1);
    expect(root().querySelectorAll(".wl-button--primary").length).toBe(1);
    fireEvent.click(del);
    const confirm = screen.getByRole("button", { name: "Delete" });
    expect(confirm.classList.contains("wl-button--secondary")).toBe(true);
  });
});

describe("T-0610 AC4/AC6 rows and controls", () => {
  it("rows are .wl-row items; handles and removes are aria-hidden glyphs inside named buttons", async () => {
    renderEditor(`/plan/routines/${R}`);
    await screen.findByLabelText("Name");
    const rows = root().querySelectorAll("ol > li");
    expect(rows.length).toBeGreaterThan(0);
    for (const li of rows) {
      expect(li.classList.contains("wl-row")).toBe(true);
      for (const b of li.querySelectorAll("button")) {
        expect(b.getAttribute("aria-label")).toBeTruthy();
        expect(b.classList.contains("wl-routine-editor__icon")).toBe(true);
        expect(b.querySelector('span[aria-hidden="true"]')).not.toBeNull();
      }
    }
  });

  it("Save is the one primary; Cancel and Add exercise are text buttons", async () => {
    renderEditor(`/plan/routines/${R}`);
    const save = await screen.findByRole("button", { name: "Save" });
    expect(save.classList.contains("wl-button--primary")).toBe(true);
    expect(screen.getByRole("button", { name: "Cancel" }).classList).toContain("wl-button--text");
    expect(screen.getByRole("button", { name: "Add exercise" }).classList).toContain(
      "wl-button--text",
    );
  });

  it("a new (empty) routine renders the same state", async () => {
    renderEditor("/plan/routines/new");
    await screen.findByLabelText("Name");
    expect(root().getAttribute("data-wl-state")).toBe("plan");
    expect(screen.queryByRole("button", { name: "Delete routine" })).toBeNull();
  });
});
