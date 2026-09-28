import { describe, expect, it } from "vitest";
import { loadLibrary } from "../src/index.js";
import { readLibraryRaw } from "./helpers.js";

const lib = loadLibrary();
const raw = readLibraryRaw();

describe("AC2 ids", () => {
  it("every id matches the kebab-case pattern", () => {
    for (const e of lib) expect(e.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("every id equals its filename without .json", () => {
    for (const { file, data } of raw) {
      expect(file).toBe(`${(data as { id: string }).id}.json`);
    }
  });

  it("no two files share an id", () => {
    const ids = lib.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("no two names are equal ignoring case", () => {
    const names = lib.map((e) => e.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });
});
