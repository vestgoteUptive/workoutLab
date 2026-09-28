import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  invalidFixtureNames,
  pkgRoot,
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

  it("extra-property-image-url.json fails specifically on additionalProperties", () => {
    const ok = validate(readInvalidFixture("extra-property-image-url.json"));
    expect(ok).toBe(false);
    const keywords = (validate.errors ?? []).map((e) => e.keyword);
    expect(keywords).toContain("additionalProperties");
  });

  it("missing-license.json fails specifically on the required keyword", () => {
    const ok = validate(readInvalidFixture("missing-license.json"));
    expect(ok).toBe(false);
    const keywords = (validate.errors ?? []).map((e) => e.keyword);
    expect(keywords).toContain("required");
  });

  it("missing-license.json's required error names license", () => {
    const ok = validate(readInvalidFixture("missing-license.json"));
    expect(ok).toBe(false);
    const requiredErrors = (validate.errors ?? []).filter((e) => e.keyword === "required");
    const missing = requiredErrors.map(
      (e) => (e.params as { missingProperty?: string }).missingProperty,
    );
    expect(missing).toContain("license");
  });
});

// D-0033 §8: a `source: "wger"` row is only valid once it carries a real-form source_url
// (`https://wger.de/en/exercise/<numeric-id>/view/<slug>`), not the placeholder
// `.../basic-info/...` shape used by the invalid fixtures above. This fixture proves the schema
// accepts that shape; it lives only under test/fixtures/valid, never in the library.
describe("positive fixture: a valid source: wger row with a real-form source_url", () => {
  it("validates with 0 errors", () => {
    const validate = validator();
    const data = JSON.parse(
      readFileSync(resolve(pkgRoot, "test/fixtures/valid/wger-real-form.json"), "utf8"),
    ) as unknown;
    const ok = validate(data);
    expect(ok, JSON.stringify(validate.errors)).toBe(true);
  });
});
