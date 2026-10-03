// T-0417 AC-5: the UF-03 weight parser over the D-0118 §6 cases as amended by D-0128.
import { describe, expect, it } from "vitest";
import { formatDecimal } from "../../../lib/format/number.js";
import { parseCount, parseWeight } from "../weight-parse.js";

const ok = (value: number | null) => ({ ok: true, value });

describe("parseWeight (D-0118 §6, D-0128)", () => {
  it.each([
    ["82.5", 82.5],
    ["82,5", 82.5],
    ["82٫5", 82.5],
    ["0", 0],
    [" 60 ", 60],
    ["82.55", 82.55],
    ["٧٧٫٥", 77.5],
    ["۷۷٫۵", 77.5],
    ["७७.५", 77.5],
    ["৭৭,৫", 77.5],
    ["７７．５".replace("．", "."), 77.5],
  ])("%s -> %s", (text, value) => {
    expect(parseWeight(text)).toEqual(ok(value));
  });

  it("empty is null (valid here; the loaded-lift rule is the row's)", () => {
    expect(parseWeight("")).toEqual(ok(null));
    expect(parseWeight("   ")).toEqual(ok(null));
  });

  it.each(["abc", "-5", "+5", "82.555", "1e3", "1 000", "1٬000", "8,2,5", "82.", ".5"])(
    "%s is invalid",
    (text) => {
      expect(parseWeight(text)).toEqual({ ok: false });
    },
  );

  it("round-trips formatDecimal in sv-SE and ar-EG (D-0128 §3)", () => {
    for (const locale of ["en-GB", "sv-SE", "ar-EG", "fa-IR"]) {
      for (const v of [0, 60, 77.5, 82.25, 102.5]) {
        expect(parseWeight(formatDecimal(v, locale)), `${locale} ${v}`).toEqual(ok(v));
      }
    }
  });
});

describe("parseCount", () => {
  it("reads whole numbers, native digits included", () => {
    expect(parseCount("6")).toBe(6);
    expect(parseCount(" 45 ")).toBe(45);
    expect(parseCount("٦")).toBe(6);
  });
  it("empty, signs and decimals are null", () => {
    for (const t of ["", "-1", "6.5", "x"]) expect(parseCount(t)).toBeNull();
  });
});
