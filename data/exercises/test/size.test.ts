import { describe, expect, it } from "vitest";
import { loadLibrary } from "../src/index.js";

// AC10 (T-0103 ticket text) counts the whole library file-by-file, `kind: "warmup"` rows
// included: "Given the library, when the files are counted, then 72 <= N <= 96." D-0033 §7
// (amended) confines the exercise-only scoping to AC11-14; AC10 is whole-library.
describe("AC10 size of the library", () => {
  it("the whole library (72 <= N <= 96)", () => {
    const n = loadLibrary().length;
    expect(n).toBeGreaterThanOrEqual(72);
    expect(n).toBeLessThanOrEqual(96);
  });
});
