// T-0634 AC1-AC3 (UF-09.3 plate loading rule, D-0217).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { plateLoading } from "../plates.js";

const DEFAULT = { barKg: 20, platesKg: [25, 20, 15, 10, 5, 2.5, 1.25] };
const plates = (perSide: number[]) => ({ kind: "plates", perSide });

describe("AC1 the rule with the default bar and plates", () => {
  it.each([
    [100, plates([25, 15])],
    [60, plates([20])],
    [102.5, plates([25, 15, 1.25])],
    [140, plates([25, 25, 10])],
    [20, { kind: "bar" }],
    [15, null],
    [101, null],
    [100.01, null],
  ])("W %s", (w, want) => {
    expect(plateLoading(w, DEFAULT)).toEqual(want);
  });
});

describe("AC2 fewest plates, then the greatest list", () => {
  it("20, 15, 10 at 80 gives 20 + 10, not 15 + 15", () => {
    expect(plateLoading(80, { barKg: 20, platesKg: [20, 15, 10] })).toEqual(plates([20, 10]));
  });
  it("15, 10 at 60 gives 10 + 10", () => {
    expect(plateLoading(60, { barKg: 20, platesKg: [15, 10] })).toEqual(plates([10, 10]));
  });
  it("no plates: 60 is null, 20 is bar only", () => {
    expect(plateLoading(60, { barKg: 20, platesKg: [] })).toBeNull();
    expect(plateLoading(20, { barKg: 20, platesKg: [] })).toEqual({ kind: "bar" });
  });
  it("bar 15 with the defaults at 55 gives 20", () => {
    expect(plateLoading(55, { ...DEFAULT, barKg: 15 })).toEqual(plates([20]));
  });
});

describe("AC3 bounds", () => {
  it("W 300 sums to 140 per side within 50 ms", () => {
    const t0 = performance.now();
    const got = plateLoading(300, DEFAULT);
    expect(performance.now() - t0).toBeLessThan(50);
    expect(got?.kind).toBe("plates");
    const list = (got as { perSide: number[] }).perSide;
    expect(list.reduce((a, b) => a + b, 0)).toBeCloseTo(140, 9);
  });
  it("reads no clock and no randomness", () => {
    const src = readFileSync(resolve(__dirname, "../plates.ts"), "utf8");
    expect(src).not.toMatch(/Date\b|performance|Math\.random|setTimeout/);
  });
});
