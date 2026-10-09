// T-0592 (state-patterns "Glyphs"): every icon is a hidden, unfocusable 2 px currentColor stroke.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  ArrowIcon,
  ChevronIcon,
  CrossIcon,
  DragHandleIcon,
  PauseIcon,
  TickIcon,
} from "../index.js";

afterEach(cleanup);

const ICONS = {
  TickIcon,
  ArrowIcon,
  CrossIcon,
  PauseIcon,
  ChevronIcon,
  DragHandleIcon,
} as const;

describe("T-0592 icons", () => {
  for (const [name, Cmp] of Object.entries(ICONS)) {
    it(`${name} is aria-hidden, not focusable, 2 px currentColor stroke with a path`, () => {
      const { container } = render(<Cmp />);
      const svg = container.querySelector("svg")!;
      expect(svg.getAttribute("aria-hidden")).toBe("true");
      expect(svg.getAttribute("focusable")).toBe("false");
      expect(svg.getAttribute("stroke")).toBe("currentColor");
      expect(svg.getAttribute("stroke-width")).toBe("2");
      expect(svg.getAttribute("fill")).toBe("none");
      expect(svg.querySelector("path")).not.toBeNull();
    });
  }

  it("an icon never changes a button's accessible name", () => {
    render(
      <button type="button">
        Start
        <ArrowIcon />
      </button>,
    );
    expect(screen.getByRole("button", { name: "Start" })).toBeTruthy();
  });

  it("the chevron turns by direction and size is configurable", () => {
    const { container } = render(<ChevronIcon direction="down" size={16} />);
    expect(container.querySelector("path")!.getAttribute("transform")).toBe("rotate(90 12 12)");
    expect(container.querySelector("svg")!.getAttribute("width")).toBe("16");
  });
});
