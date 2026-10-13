// T-0676 UF-07.1: Save and the edge move buttons use aria-disabled plus a no-op guard, so they
// stay focusable and keep their description (state-patterns.md). Each: reads aria-disabled,
// a click does nothing, and it stays focusable.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { R, renderEditor, seed } from "./harness.js";
import { setOnline, spy } from "./spies.js";

vi.mock("../../../lib/auth/auth-context.js", async () => (await import("./spies.js")).mockedAuth());
vi.mock("../../../lib/auth/client.js", async () => (await import("./spies.js")).mockedClient());
vi.mock("../../../lib/offline/index.js", async (importActual) =>
  (await import("./spies.js")).mockedOffline(importActual),
);

const btn = (name: string) => screen.getByRole("button", { name });
const order = () => screen.getAllByText(/^\d\. /).map((n) => n.textContent);

beforeEach(async () => {
  await seed();
  return () => setOnline(true);
});

describe("move up / move down", () => {
  it.each([
    ["Move Barbell back squat up", "up"],
    ["Move Leg curl (machine) down", "down"],
  ])("%s: aria-disabled, click is a no-op, still focusable", async (name) => {
    renderEditor(`/plan/routines/${R}`);
    await screen.findByText(/^1\. /);
    const before = order();
    const el = btn(name);
    expect(el).toHaveAttribute("aria-disabled", "true");
    expect(el).not.toHaveAttribute("disabled");
    fireEvent.click(el);
    expect(order()).toEqual(before);
    expect(screen.getByRole("status")).toHaveTextContent("");
    el.focus();
    expect(el).toHaveFocus();
  });
});

describe("Save", () => {
  it("offline: aria-disabled, described by the reason line, click saves nothing, focusable", async () => {
    setOnline(false);
    renderEditor(`/plan/routines/${R}`);
    await screen.findByText(/^1\. /);
    const save = btn("Save");
    expect(save).toHaveAttribute("aria-disabled", "true");
    expect(save).not.toHaveAttribute("disabled");
    expect(save).toHaveAccessibleDescription("Connect to save");
    fireEvent.click(save);
    expect(spy.calls).toHaveLength(0);
    save.focus();
    expect(save).toHaveFocus();
  });

  it("invalid name: aria-disabled, described by the name hint, click saves nothing", async () => {
    renderEditor(`/plan/routines/${R}`);
    await screen.findByText(/^1\. /);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "" } });
    const save = btn("Save");
    expect(save).toHaveAttribute("aria-disabled", "true");
    expect(save).toHaveAccessibleDescription("Name your routine (up to 40 characters)");
    fireEvent.click(save);
    expect(spy.calls).toHaveLength(0);
    save.focus();
    expect(save).toHaveFocus();
  });
});
