// T-1001 AC8 (D-0281 §4): toLearningPrefs defaults a missing flag to true and a missing epoch to null.
import { describe, expect, it } from "vitest";
import { toLearningPrefs } from "../src/index.js";

describe("T-1001 AC8 toLearningPrefs", () => {
  it("reads an old cached profile (no fields) as learning on, no epoch", () => {
    expect(toLearningPrefs({})).toStrictEqual({ learnFromEdits: true, learnResetAt: null });
  });

  it("reads null fields the same way", () => {
    expect(toLearningPrefs({ learn_from_edits: null, learn_reset_at: null })).toStrictEqual({
      learnFromEdits: true,
      learnResetAt: null,
    });
  });

  it("keeps an explicit false and an epoch", () => {
    expect(
      toLearningPrefs({ learn_from_edits: false, learn_reset_at: "2026-11-24T10:00:00Z" }),
    ).toStrictEqual({ learnFromEdits: false, learnResetAt: "2026-11-24T10:00:00Z" });
  });

  it("keeps true", () => {
    expect(toLearningPrefs({ learn_from_edits: true, learn_reset_at: null }).learnFromEdits).toBe(
      true,
    );
  });
});
