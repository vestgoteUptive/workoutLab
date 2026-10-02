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

// T-0234 (D-0133, UF-09.7): a timed exercise's default_duration_s is 15..120, because the
// engine's first_time pre-fill echoes it unclamped. Warm-up moves keep the top-level 5..120.
describe("T-0234 timed exercise default_duration_s is 15..120 in the schema", () => {
  const validate = validator();
  const readJson = (rel: string): Record<string, unknown> =>
    JSON.parse(readFileSync(resolve(pkgRoot, rel), "utf8")) as Record<string, unknown>;

  it("T-0234 AC1 timed-exercise-duration-below-15.json fails with minimum at /default_duration_s", () => {
    const ok = validate(readInvalidFixture("timed-exercise-duration-below-15.json"));
    expect(ok).toBe(false);
    const hits = (validate.errors ?? []).filter(
      (e) => e.instancePath === "/default_duration_s" && e.keyword === "minimum",
    );
    expect(hits.length, JSON.stringify(validate.errors)).toBeGreaterThan(0);
  });

  it("T-0234 AC1 warmup-duration-10.json (a warm-up at 10 s) validates with 0 errors", () => {
    const ok = validate(readJson("test/fixtures/valid/warmup-duration-10.json"));
    expect(ok, JSON.stringify(validate.errors)).toBe(true);
  });

  it.each([15, 120])("T-0234 AC1 a copy of plank.json at %i s validates", (d) => {
    const data = { ...readJson("library/plank.json"), default_duration_s: d };
    const ok = validate(data);
    expect(ok, JSON.stringify(validate.errors)).toBe(true);
  });

  it("T-0234 AC1 a copy of plank.json at 121 s fails on maximum", () => {
    const data = { ...readJson("library/plank.json"), default_duration_s: 121 };
    const ok = validate(data);
    expect(ok).toBe(false);
    const hits = (validate.errors ?? []).filter(
      (e) => e.instancePath === "/default_duration_s" && e.keyword === "maximum",
    );
    expect(hits.length, JSON.stringify(validate.errors)).toBeGreaterThan(0);
  });
});
