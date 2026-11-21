// T-0974 AC6 (D-0263 §8): the shared formatter.
import { describe, expect, it } from "vitest";
import { formatReps, perSide, perSideCaption, readReps, repsGroupLabel } from "../per-side.js";

describe("AC6 formatReps and perSide", () => {
  it("flagged: arm, leg, timed side, singular", () => {
    expect(formatReps(10, "arm", { locale: "en-GB" })).toBe("10 reps per arm");
    expect(formatReps(1, "arm", { locale: "en-GB" })).toBe("1 rep per arm");
    expect(formatReps(10, "leg")).toBe("10 reps per leg");
    expect(formatReps(40, "side", { timed: true, locale: "en-GB" })).toBe("40 s per side");
  });
  it("null and unknown words give the bilateral text", () => {
    expect(formatReps(10, null)).toBe("10 reps");
    expect(formatReps(1, null)).toBe("1 rep");
    expect(formatReps(40, null, { timed: true })).toBe("40 s");
    expect(formatReps(10, "both")).toBe("10 reps");
    expect(formatReps(10, "")).toBe("10 reps");
    expect(formatReps(10, undefined)).toBe("10 reps");
  });
  it("perSide has a leading space, the caption has none, null is empty", () => {
    expect(perSide("arm")).toBe(" per arm");
    expect(perSide("leg")).toBe(" per leg");
    expect(perSide("side")).toBe(" per side");
    expect(perSide(null)).toBe("");
    expect(perSideCaption("leg")).toBe("per leg");
  });
});

describe("readReps and repsGroupLabel", () => {
  it("readReps with a load and without one", () => {
    expect(readReps(10, "arm", "en-GB", "12 kg")).toBe("12 kg, 10 reps per arm");
    expect(readReps(10, "arm", "en-GB")).toBe("10 reps per arm");
    expect(readReps(1, null, "en-GB", "12 kg")).toBe("12 kg, 1 rep");
  });
  it("repsGroupLabel for each word and null", () => {
    expect(repsGroupLabel("arm")).toBe("Reps per arm");
    expect(repsGroupLabel("leg")).toBe("Reps per leg");
    expect(repsGroupLabel("side")).toBe("Reps per side");
    expect(repsGroupLabel(null)).toBe("Reps");
    expect(repsGroupLabel(undefined)).toBe("Reps");
  });
});
