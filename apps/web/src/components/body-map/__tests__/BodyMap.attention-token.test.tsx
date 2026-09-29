// T-0300d rework (code review, D-0019): the ", needs attention" suffix of an area's name is the
// token's `attentionLegend.srLabel`, not copy retyped in the app. The token text is swapped
// here, so a hardcoded suffix goes red.
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { BodyMap } from "../index.js";
import { attentionFixture } from "./fixtures.js";
import { mockMatchMedia, renderInRouter } from "./test-helpers.js";

vi.mock("@workoutlab/design-tokens", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workoutlab/design-tokens")>();
  return {
    ...actual,
    attentionLegend: { ...actual.attentionLegend, srLabel: "Flagged by the engine" },
  };
});

describe("AC-D4 attention suffix comes from attentionLegend.srLabel", () => {
  it("AC-D4: the flagged area's name ends with the token srLabel (lower-cased first letter)", () => {
    mockMatchMedia(false);
    renderInRouter(<BodyMap variant="full" areas={attentionFixture} />);
    expect(screen.getByRole("button", { name: /^Hamstrings,/ }).getAttribute("aria-label")).toBe(
      "Hamstrings, 12 of 16 hard sets, under target, flagged by the engine",
    );
  });
});
