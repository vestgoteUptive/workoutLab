import { describe, expect, it } from "vitest";
import {
  invalidFixtureNames,
  readInvalidFixture,
  readLibraryRaw,
  validator,
} from "./helpers.js";

describe("AC1 schema is valid and strict", () => {
  const validate = validator();
  const files = readLibraryRaw();

  it("has at least one library file to validate", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [f.file, f.data] as const))("%s has 0 errors", (_file, data) => {
    const ok = validate(data);
    expect(ok, JSON.stringify(validate.errors)).toBe(true);
  });

  it("has at least the 6 required invalid fixtures", () => {
    expect(invalidFixtureNames().length).toBeGreaterThanOrEqual(6);
  });

  const expectedPaths: Record<string, string> = {
    "area-unknown-key.json": "/areas",
    "area-bad-weight.json": "/areas/chest",
    "extra-property-image-url.json": "",
    "missing-license.json": "",
    "too-many-instructions.json": "/instructions",
    "cue-too-long.json": "/cue",
  };

  it.each(Object.entries(expectedPaths))("%s fails at the expected path", (name, path) => {
    const data = readInvalidFixture(name);
    const ok = validate(data);
    expect(ok).toBe(false);
    const paths = (validate.errors ?? []).map((e) => e.instancePath);
    expect(paths).toContain(path);
  });
});
