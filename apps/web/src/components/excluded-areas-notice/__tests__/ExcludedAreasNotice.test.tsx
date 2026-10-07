// T-0537 AC3, AC4, AC5 (D-0199 §8). AC5's rule test is lib/i18n/jsx-no-literals.test.ts plus the lint.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ExcludedAreasNotice } from "../index.js";

describe("AC3 notice copy", () => {
  it("renders nothing for []", () => {
    const { container } = render(<ExcludedAreasNotice areas={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("one area", () => {
    const { container } = render(<ExcludedAreasNotice areas={["quads"]} />);
    expect(container.textContent).toBe("Not suggested: Quads. Every exercise for it is excluded.");
  });
  it("several areas keep the caller's order", () => {
    const { container } = render(<ExcludedAreasNotice areas={["quads", "calves"]} />);
    expect(container.textContent).toBe(
      "Not suggested: Quads, Calves. Every exercise for them is excluded.",
    );
  });
  it("icon is decorative and the notice is not a live region", () => {
    const { container } = render(<ExcludedAreasNotice areas={["core"]} />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("[role],[aria-live]")).toBeNull();
  });
});

describe("AC4 neutral styling", () => {
  const css = readFileSync(resolve(__dirname, "../excluded-areas-notice.css"), "utf8");
  it("uses the neutral tokens and no warn token", () => {
    for (const t of ["surface-2", "line", "text-muted"]) expect(css).toContain(`--wl-color-${t})`);
    expect(css).not.toMatch(/warn/i);
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
  it("component source has no literal user text or warn", () => {
    const src = readFileSync(resolve(__dirname, "../ExcludedAreasNotice.tsx"), "utf8");
    expect(src).not.toMatch(/warn/i);
  });
});
