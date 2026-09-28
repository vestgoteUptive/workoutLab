import { describe, expect, it } from "vitest";
import { loadLibrary } from "../src/index.js";
import { AREAS } from "../src/profiles.js";

const lib = loadLibrary();
// D-0033 §7: the area-weight rules apply to `kind: "exercise"` rows. Warm-up rows may be
// area-less by design (D-0024 rule 7, "general" moves).
const exercises = lib.filter((e) => e.kind === "exercise");

describe("AC3 area weights (engine rule 1)", () => {
  it("every area key is one of the 9 areas", () => {
    for (const e of exercises) {
      for (const key of Object.keys(e.areas)) expect(AREAS).toContain(key);
    }
  });

  it("every area value is 1 or 0.5", () => {
    for (const e of exercises) {
      for (const value of Object.values(e.areas)) expect([1, 0.5]).toContain(value);
    }
  });

  it("every exercise has at least one area at 1", () => {
    for (const e of exercises) {
      expect(Object.values(e.areas)).toContain(1);
    }
  });

  it("every isolation exercise has exactly one area at 1", () => {
    for (const e of exercises.filter((x) => x.type === "isolation")) {
      const primaries = Object.values(e.areas).filter((v) => v === 1);
      expect(primaries, e.id).toHaveLength(1);
    }
  });

  it("every compound exercise has at least 2 area keys", () => {
    for (const e of exercises.filter((x) => x.type === "compound")) {
      expect(Object.keys(e.areas).length, e.id).toBeGreaterThanOrEqual(2);
    }
  });

  it("barbell-back-squat matches engine rule 1's example, if present in this part of the library", () => {
    const squat = lib.find((e) => e.id === "barbell-back-squat");
    if (!squat) return; // ships with T-0103b (full-gym set)
    expect(squat.areas).toEqual({ quads: 1, glutes: 1, hamstrings: 0.5, core: 0.5 });
  });
});
