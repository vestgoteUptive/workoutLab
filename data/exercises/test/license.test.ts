import { describe, expect, it } from "vitest";
import { loadLibrary } from "../src/index.js";
import { readInvalidFixture, readLibraryRaw, validator } from "./helpers.js";

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

  it("T-0522 AC4 no library row mentions ExerciseDB in any case (D-0192)", () => {
    const hits = readLibraryRaw()
      .filter(({ text }) => /exercisedb|exercise-db|exercise db/i.test(text))
      .map(({ file }) => file);
    expect(hits).toEqual([]);
  });

  it("fixture: source wger with license MIT fails the schema at /license with const", () => {
    const validate = validator();
    const ok = validate(readInvalidFixture("wger-with-mit-license.json"));
    expect(ok).toBe(false);
    const errors = validate.errors ?? [];
    expect(errors.some((e) => e.instancePath === "/license" && e.keyword === "const")).toBe(true);
  });
});
