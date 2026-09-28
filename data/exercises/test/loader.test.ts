import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { libraryDir, libraryFileNames, loadLibrary } from "../src/index.js";

describe("AC16 deterministic loader", () => {
  const a = loadLibrary();
  const b = loadLibrary();

  it("both results deep-equal each other", () => {
    expect(a).toEqual(b);
  });

  it("both have the same length", () => {
    expect(a.length).toBe(b.length);
    expect(a.length).toBeGreaterThan(0);
  });

  it("both are sorted by id ascending (code-point order)", () => {
    const ids = a.map((e) => e.id);
    const sorted = [...ids].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
    expect(ids).toEqual(sorted);
  });

  it("each item deep-equals the parsed file with the same id", () => {
    for (const file of libraryFileNames()) {
      const parsed = JSON.parse(readFileSync(join(libraryDir, file), "utf8")) as { id: string };
      const loaded = a.find((e) => e.id === parsed.id);
      expect(loaded).toEqual(parsed);
    }
  });
});
