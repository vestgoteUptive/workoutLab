// Rule 4: targets (D-0027), feeding UF-10.1 and UF-11. AC14.
import { describe, expect, it } from "vitest";
import { AREAS, deriveTargets } from "../src/index.js";
import { F_TARGET_VALUES } from "./fixtures/common.js";

describe("rule-4 targets", () => {
  it("R4-E1 (AC14) rhythm 3–4, no priorities → 20 / 16 / 12", () => {
    expect(deriveTargets({ rhythmMin: 3, rhythmMax: 4, priorityAreas: [] })).toEqual(
      F_TARGET_VALUES,
    );
  });

  it("R4-E2 (AC14) priorities back, hamstrings, arms get +25 %", () => {
    expect(
      deriveTargets({ rhythmMin: 3, rhythmMax: 4, priorityAreas: ["back", "hamstrings", "arms"] }),
    ).toEqual({ ...F_TARGET_VALUES, back: 25, hamstrings: 20, arms: 15 });
  });

  it("R4-E3 (AC14) rhythm 2–3 → back 14, shoulders 11, arms 9", () => {
    const t = deriveTargets({ rhythmMin: 2, rhythmMax: 3, priorityAreas: [] });
    expect([t.back, t.shoulders, t.arms]).toEqual([14, 11, 9]);
  });

  it("R4-E4 (AC14) rhythm 1–1 clamps S to 7 → back 10, shoulders 8, arms 6", () => {
    const t = deriveTargets({ rhythmMin: 1, rhythmMax: 1, priorityAreas: [] });
    expect([t.back, t.shoulders, t.arms]).toEqual([10, 8, 6]);
  });

  it("R4-E5 (AC14) rhythm 7–7 clamps S to 21 → back 30, arms 18; priority back rounds 37.5 up to 38", () => {
    const t = deriveTargets({ rhythmMin: 7, rhythmMax: 7, priorityAreas: [] });
    expect([t.back, t.arms]).toEqual([30, 18]);
    expect(deriveTargets({ rhythmMin: 7, rhythmMax: 7, priorityAreas: ["back"] }).back).toBe(38);
  });

  it("rule-4 (AC14) every rhythm 1..7 gives all 9 areas as positive integers", () => {
    for (let min = 1; min <= 7; min++) {
      for (let max = min; max <= 7; max++) {
        const t = deriveTargets({ rhythmMin: min, rhythmMax: max, priorityAreas: ["core"] });
        expect(Object.keys(t)).toEqual([...AREAS]);
        for (const a of AREAS) {
          expect(Number.isInteger(t[a])).toBe(true);
          expect(t[a]).toBeGreaterThanOrEqual(6);
        }
      }
    }
  });

  it("rule-4 rejects an invalid rhythm", () => {
    expect(() => deriveTargets({ rhythmMin: 0, rhythmMax: 3, priorityAreas: [] })).toThrow(
      RangeError,
    );
    expect(() => deriveTargets({ rhythmMin: 4, rhythmMax: 3, priorityAreas: [] })).toThrow(
      RangeError,
    );
    expect(() => deriveTargets({ rhythmMin: 2.5, rhythmMax: 3, priorityAreas: [] })).toThrow(
      RangeError,
    );
  });
});
