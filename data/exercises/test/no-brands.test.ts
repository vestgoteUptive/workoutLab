// T-0691 AC4 (D-0234 §2): no gym-brand or model names anywhere in the library. The seed is
// generated from these files, so checking the raw file text (ids, names, steps, cues, mistakes)
// and the file names covers what ships (UF-04.1, UF-04.2).
import { describe, expect, it } from "vitest";
import { readLibraryRaw } from "./helpers.js";

const BRANDS = ["cybex", "technogym", "life fitness", "matrix", "hammer strength"] as const;

describe("T-0691 AC4 no brand names in the library (D-0234 §2)", () => {
  const files = readLibraryRaw();

  it("reads every library file", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const brand of BRANDS) {
    it(`no file name or file text contains "${brand}" (case-insensitive)`, () => {
      const hits = files
        .filter(
          ({ file, text }) =>
            file.toLowerCase().includes(brand) || text.toLowerCase().includes(brand),
        )
        .map(({ file }) => file);
      expect(hits).toEqual([]);
    });
  }
});
