// T-0300d rework (code review): clean accessible names for the edge cases (AC-D4, D-0060 §2).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { BodyMap } from "../index.js";
import { withArea, zeroFixture } from "./fixtures.js";
import { mockMatchMedia, removeMatchMedia, renderInRouter } from "./test-helpers.js";

beforeEach(() => mockMatchMedia(false));
afterEach(() => removeMatchMedia());

describe("AC-D4 names for areas without usable data", () => {
  it("AC-D4: an area missing from `areas` (not loading) gets a neutral name, not 'loading'", () => {
    const areas = zeroFixture.filter((a) => a.area !== "hamstrings");
    renderInRouter(<BodyMap variant="full" areas={areas} />);
    const btn = screen.getByRole("button", { name: "Hamstrings" });
    expect(btn).toBeEnabled();
    expect(btn.getAttribute("aria-label")).not.toMatch(/loading/i);
  });

  it("AC-D4: an out-of-range coverageStep leaves no trailing ', ' in the name", () => {
    const areas = withArea(zeroFixture, {
      area: "chest",
      load: 3,
      target: 16,
      coverageStep: 7,
      needsAttention: false,
    });
    renderInRouter(<BodyMap variant="full" areas={areas} />);
    const name = screen.getByRole("button", { name: /^Chest,/ }).getAttribute("aria-label");
    expect(name).toBe("Chest, 3 of 16 hard sets");
  });

  it("AC-D4: an out-of-range coverageStep with attention reads '…hard sets, needs attention'", () => {
    const areas = withArea(zeroFixture, {
      area: "chest",
      load: 3,
      target: 16,
      coverageStep: -1,
      needsAttention: true,
    });
    renderInRouter(<BodyMap variant="full" areas={areas} />);
    expect(screen.getByRole("button", { name: /^Chest,/ }).getAttribute("aria-label")).toBe(
      "Chest, 3 of 16 hard sets, needs attention",
    );
  });
});
