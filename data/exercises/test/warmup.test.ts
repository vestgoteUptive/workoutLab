import { describe, expect, it } from "vitest";
import { loadLibrary } from "../src/index.js";

const lib = loadLibrary();
const warmups = lib.filter((e) => e.kind === "warmup");

// D-0024 rule 7 / D-0033 §2 §6: the warm-up generator needs "general" (area-less) moves to
// round-robin over once every primary area has one; there must be at least 2, and at least 4
// distinct moves overall (general + area-targeted) so the round-robin has enough variety.
describe("Engine v1 content need: warm-up moves (D-0024, D-0033)", () => {
  it("at least 4 warm-up moves", () => {
    expect(warmups.length).toBeGreaterThanOrEqual(4);
  });

  it("at least 2 are general (area-less)", () => {
    const general = warmups.filter((e) => Object.keys(e.areas).length === 0);
    expect(general.length).toBeGreaterThanOrEqual(2);
  });

  it("every warm-up move is bodyweight-only, timed, with a default_duration_s", () => {
    for (const e of warmups) {
      expect(e.equipment, e.id).toEqual(["none"]);
      expect(e.bodyweight, e.id).toBe(true);
      expect(e.timed, e.id).toBe(true);
      expect(e.default_duration_s, e.id).toBeGreaterThanOrEqual(5);
      expect(e.increment_kg, e.id).toBeUndefined();
    }
  });
});
