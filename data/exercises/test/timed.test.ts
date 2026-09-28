import { describe, expect, it } from "vitest";
import { loadLibrary } from "../src/index.js";
import { isAvailableIn } from "../src/profiles.js";

const exercises = loadLibrary().filter((e) => e.kind === "exercise");

describe("AC14 timed sets (UF-09.7)", () => {
  const timedCore = exercises.filter(
    (e) => e.timed && e.areas.core === 1 && isAvailableIn(e.equipment, "bodyweight"),
  );

  it("at least 2 timed, core-primary, bodyweight exercises", () => {
    expect(timedCore.length).toBeGreaterThanOrEqual(2);
  });

  it("plank is one of them", () => {
    expect(timedCore.map((e) => e.id)).toContain("plank");
  });

  it("every timed exercise has a default_duration_s", () => {
    for (const e of exercises.filter((x) => x.timed)) {
      expect(e.default_duration_s, e.id).toBeGreaterThanOrEqual(5);
    }
  });
});
