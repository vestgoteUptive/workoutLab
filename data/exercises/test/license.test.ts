import { describe, expect, it } from "vitest";
import { loadLibrary } from "../src/index.js";
import { readInvalidFixture, validator } from "./helpers.js";

const lib = loadLibrary();

describe("AC7 per-file licence (D-0005, D-0022 §7)", () => {
  it("source: wger rows have the CC-BY-SA licence, a wger source_url and attribution", () => {
    for (const e of lib.filter((x) => x.source === "wger")) {
      expect(e.license, e.id).toBe("CC-BY-SA-4.0");
      expect(e.source_url, e.id).toMatch(/^https:\/\/wger\.de\//);
      expect(e.attribution, e.id).toBeTruthy();
      expect((e.attribution ?? "").toLowerCase(), e.id).toContain("wger");
    }
  });

  it("source: workoutlab rows have LicenseRef-workoutLab and no source_url", () => {
    for (const e of lib.filter((x) => x.source === "workoutlab")) {
      expect(e.license, e.id).toBe("LicenseRef-workoutLab");
      expect(e.source_url, e.id).toBeUndefined();
    }
  });

  it("every row has one of the two known source values", () => {
    for (const e of lib) expect(["wger", "workoutlab"]).toContain(e.source);
  });

  it("fixture: source wger with license MIT fails the schema", () => {
    const validate = validator();
    const ok = validate(readInvalidFixture("wger-with-mit-license.json"));
    expect(ok).toBe(false);
  });
});
