// T-0388 UF-09: formatKg (D-0114 §3, D-0115 §6) and formatSetCount stays unchanged.
import { describe, expect, it } from "vitest";
import { formatKg, formatSetCount } from "./number";

const NBSP = "\u00A0";

describe("formatKg", () => {
  it("AC1: en-GB prints up to two decimals, half-expand, with a non-breaking space", () => {
    expect(formatKg(82.5, "en-GB")).toBe(`82.5${NBSP}kg`);
    expect(formatKg(80, "en-GB")).toBe(`80${NBSP}kg`);
    expect(formatKg(41.25, "en-GB")).toBe(`41.25${NBSP}kg`);
    expect(formatKg(0, "en-GB")).toBe(`0${NBSP}kg`);
    expect(formatKg(2.125, "en-GB")).toBe(`2.13${NBSP}kg`);
    expect(formatKg(82.5, "en-GB")).not.toContain(" ");
  });

  it("AC2: sv-SE and de-DE use a decimal comma", () => {
    expect(formatKg(82.5, "sv-SE")).toBe(`82,5${NBSP}kg`);
    expect(formatKg(41.25, "de-DE")).toBe(`41,25${NBSP}kg`);
  });

  it("AC3: no digit grouping", () => {
    expect(formatKg(1250, "en-GB")).toBe(`1250${NBSP}kg`);
    expect(formatKg(1250, "de-DE")).toBe(`1250${NBSP}kg`);
    expect(formatKg(1250, "sv-SE")).toBe(`1250${NBSP}kg`);
  });

  it("AC4: an absent locale means the runtime default", () => {
    const runtime = new Intl.NumberFormat().resolvedOptions().locale;
    expect(formatKg(82.5)).toBe(formatKg(82.5, runtime));
    expect(formatKg(1250.125)).toBe(formatKg(1250.125, runtime));
  });
});

describe("formatSetCount (unchanged, AC5)", () => {
  it("keeps its behaviour", () => {
    expect(formatSetCount(8, "en-GB")).toBe("8");
    expect(formatSetCount(7.25, "en-GB")).toBe("7.3");
    expect(formatSetCount(7.5, "de-DE")).toBe("7,5");
    expect(formatSetCount(1250, "en-GB")).toBe("1250");
  });

  it("AC5: formatKg has the same arity as formatSetCount", () => {
    expect(formatKg.length).toBe(formatSetCount.length);
  });

  // TR-0037: AC5 as written asks for `.length === 1`, but `(value, locale?)` compiles to two JS
  // parameters, so `.length` is 2 and formatSetCount may not change in T-0388. Kept as
  // `it.fails` so the row turns red when TR-0037 is resolved; then drop the marker.
  it.fails("AC5 (TR-0037): both helpers have .length 1", () => {
    expect(formatSetCount.length).toBe(1);
    expect(formatKg.length).toBe(1);
  });
});
