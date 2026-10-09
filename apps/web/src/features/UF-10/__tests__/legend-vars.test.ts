// T-0615 AC-T0614-2: UF-10 reads the legend's plan tokens through the generic state variables, so
// a screen without data-wl-state keeps the legacy look (D-0210 §2).
import { describe, expect, it } from "vitest";
import { coverageLegend } from "@workoutlab/design-tokens";
import { fillToken, tokenVar } from "../format.js";

describe("AC-T0614-2 UF-10 fill colours", () => {
  it("each engine step draws var(--wl-coverage-N), never --wl-color-plan-*", () => {
    for (const e of coverageLegend) {
      const v = tokenVar(fillToken(e.step));
      expect(v).toBe(`var(--wl-coverage-${e.step})`);
      expect(v).not.toContain("--wl-color-plan");
    }
  });
  it("an out-of-range step is neutral (--wl-raise)", () => {
    expect(tokenVar(fillToken(7))).toBe("var(--wl-raise)");
  });
});
