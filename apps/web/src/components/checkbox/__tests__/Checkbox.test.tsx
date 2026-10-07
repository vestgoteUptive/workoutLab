// T-0537 AC1, AC2 (C-03, D-0199). axe runs directly, as in BodyMap.a11y.test.tsx (D-0060).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Checkbox } from "../index.js";

type Axe = { run: (ctx: Element, opts: object) => Promise<{ violations: { id: string }[] }> };
let axe: Axe;
beforeAll(async () => {
  const req = createRequire(resolve(process.cwd(), "package.json"));
  const axePath = createRequire(req.resolve("@axe-core/playwright")).resolve("axe-core");
  const mod = (await import(/* @vite-ignore */ axePath)) as { default?: Axe } & Axe;
  axe = mod.default ?? mod;
});
const NAME = "Don't suggest Barbell row again";
const axeIds = async (el: Element) =>
  (await axe.run(el, { rules: { "color-contrast": { enabled: false } } })).violations.map(
    (v) => v.id,
  );

describe("AC1 checkbox a11y", () => {
  it("is a named, unchecked checkbox that toggles on label click and Space", async () => {
    const onChange = vi.fn();
    render(<Checkbox label={NAME} onChange={onChange} />);
    const box = screen.getByRole("checkbox", { name: NAME });
    expect(box).not.toBeChecked();
    fireEvent.click(screen.getByText(NAME));
    expect(box).toBeChecked();
    box.focus();
    fireEvent.keyDown(box, { key: " " });
    fireEvent.keyUp(box, { key: " " });
    fireEvent.click(box); // the browser turns Space on a checkbox into a click
    expect(box).not.toBeChecked();
    expect(onChange.mock.calls).toEqual([[true], [false]]);
  });

  it("row min-height is at least 44 px and the css keeps it", () => {
    const { container } = render(<Checkbox label={NAME} />);
    const row = container.querySelector("label") as HTMLElement;
    expect(parseInt(row.style.minHeight, 10)).toBeGreaterThanOrEqual(44);
    const css = readFileSync(resolve(__dirname, "../checkbox.css"), "utf8");
    expect(css).toMatch(/min-block-size:\s*44px/);
    expect(css).toMatch(/border:\s*2px solid var\(--wl-color-text-muted\)/);
    expect(css).toMatch(/outline:\s*2px solid var\(--wl-color-accent\)/);
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("axe finds no violation unchecked, checked and disabled", async () => {
    const a = render(<Checkbox label={NAME} />);
    expect(await axeIds(a.container)).toEqual([]);
    a.unmount();
    const b = render(<Checkbox label={NAME} defaultChecked />);
    expect(await axeIds(b.container)).toEqual([]);
    b.unmount();
    const c = render(
      <>
        <Checkbox label={NAME} ariaDisabled describedBy="why" />
        <p id="why">Connect to change excluded exercises</p>
      </>,
    );
    expect(await axeIds(c.container)).toEqual([]);
  });
});

describe("AC2 aria-disabled", () => {
  it("ignores click and Space, stays focusable and described; re-enables on prop change", async () => {
    const onChange = vi.fn();
    const ui = (dis: boolean) => (
      <>
        <Checkbox label={NAME} ariaDisabled={dis} describedBy="why" onChange={onChange} />
        <p id="why">Connect to change excluded exercises</p>
      </>
    );
    const { rerender } = render(ui(true));
    const box = screen.getByRole("checkbox", { name: NAME });
    expect(box).toHaveAttribute("aria-disabled", "true");
    expect(box).not.toBeDisabled();
    fireEvent.click(box);
    fireEvent.click(screen.getByText(NAME));
    box.focus();
    fireEvent.keyDown(box, { key: " " });
    fireEvent.keyUp(box, { key: " " });
    fireEvent.click(box); // the browser turns Space on a checkbox into a click
    expect(onChange).not.toHaveBeenCalled();
    expect(box).not.toBeChecked();
    expect(box).toHaveFocus();
    expect(box).toHaveAccessibleDescription("Connect to change excluded exercises");
    rerender(ui(false));
    expect(box).not.toHaveAttribute("aria-disabled");
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(true);
    expect(box).toBeChecked();
  });
});
