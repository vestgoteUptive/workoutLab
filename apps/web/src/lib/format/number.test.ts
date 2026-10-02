// T-0388 UF-09: formatKg (D-0114 §3, D-0115 §6) and formatSetCount stays unchanged.
import { describe, expect, it } from "vitest";
import { formatDecimal, formatKg, formatSetCount } from "./number";

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
});

// T-0304b AC-10 (D-0118 §6): the bare number for the UF-09.4 weight input.
describe("formatDecimal", () => {
  it("prints formatKg's number with no unit", () => {
    expect(formatDecimal(80, "en-GB")).toBe("80");
    expect(formatDecimal(77.5, "en-GB")).toBe("77.5");
    expect(formatDecimal(2.125, "en-GB")).toBe("2.13");
  });

  it("the locale pair: sv-SE uses a decimal comma", () => {
    expect(formatDecimal(77.5, "sv-SE")).toBe("77,5");
  });

  it("no digit grouping", () => {
    expect(formatDecimal(1234.5, "en-GB")).toBe("1234.5");
  });
});
