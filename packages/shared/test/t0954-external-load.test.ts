// T-0954 AC10: the external-load predicate.
import { describe, expect, it } from "vitest";
import { hasExternalLoad } from "../src/index.js";

describe("AC10 hasExternalLoad", () => {
  it("is false for a timed exercise", () => {
    expect(hasExternalLoad({ timed: true, externalLoad: true })).toBe(false);
    expect(hasExternalLoad({ timed: true, externalLoad: false })).toBe(false);
  });
  it("is false for a bodyweight exercise", () => {
    expect(hasExternalLoad({ timed: false, externalLoad: false })).toBe(false);
  });
  it("is true for a loaded, rep-counted exercise (barbell)", () => {
    expect(hasExternalLoad({ timed: false, externalLoad: true })).toBe(true);
  });
});
