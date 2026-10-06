import { describe, expect, it } from "vitest";
import { loadLibrary } from "../src/index.js";
import { AREAS, LARGE_AREAS, isAvailableIn } from "../src/profiles.js";
import { REQUIRED_PROFILES } from "./config.js";

// Only `kind: "exercise"` rows count toward area coverage; warm-up moves (D-0024/D-0033) are
// not training options for the engine's greedy selection.
const exercises = loadLibrary().filter((e) => e.kind === "exercise");

describe("AC11 every area is fillable in every required profile", () => {
  for (const profile of REQUIRED_PROFILES) {
    for (const area of AREAS) {
      it(`${profile} × ${area}: >= 3 primary exercises`, () => {
        const count = exercises.filter(
          (e) => isAvailableIn(e.equipment, profile) && e.areas[area] === 1,
        ).length;
        expect(count, `${profile} × ${area}: ${count}/3`).toBeGreaterThanOrEqual(3);
      });
    }
  }
});

// T-0522 AC2 (D-0192 §3): bodyweight-only (`equipment: ["none"]`) breadth, one new row per area.
// Exact counts: main fa4171e had chest 4, back 4 and 3 for every other area; each gained one.
describe("T-0522 AC2 bodyweight-only primary count per area", () => {
  const EXPECTED: Record<string, number> = {
    chest: 5,
    back: 5,
    shoulders: 4,
    arms: 4,
    core: 4,
    glutes: 4,
    quads: 4,
    hamstrings: 4,
    calves: 4,
  };
  for (const area of AREAS) {
    it(`${area}: ${EXPECTED[area]} exercises with equipment ["none"] at weight 1`, () => {
      const count = exercises.filter(
        (e) => e.equipment.length === 1 && e.equipment[0] === "none" && e.areas[area] === 1,
      ).length;
      expect(count).toBe(EXPECTED[area]);
    });
  }

  it("T-0522 AC1 the library has 87 rows", () => {
    expect(loadLibrary()).toHaveLength(87);
  });

  it("T-0522 AC5 at least two of the nine new rows are beginner and one is timed", () => {
    const nine = [
      "archer-push-up",
      "prone-y-raise",
      "plank-shoulder-tap",
      "incline-tricep-extension",
      "hollow-body-hold",
      "donkey-kick",
      "reverse-lunge",
      "sliding-leg-curl",
      "ankle-hops",
    ];
    const rows = nine.map((id) => exercises.find((e) => e.id === id));
    for (const [i, r] of rows.entries()) expect(r, nine[i]).toBeDefined();
    expect(rows.filter((r) => r?.level === "beginner").length).toBeGreaterThanOrEqual(2);
    expect(rows.some((r) => r?.timed === true && typeof r.default_duration_s === "number")).toBe(
      true,
    );
  });
});

describe("AC12 zero history, new beginner (UF-01.4)", () => {
  for (const profile of REQUIRED_PROFILES) {
    for (const area of AREAS) {
      it(`${profile} × ${area} has a beginner option`, () => {
        const has = exercises.some(
          (e) =>
            isAvailableIn(e.equipment, profile) && e.areas[area] === 1 && e.level === "beginner",
        );
        expect(has, `${profile} × ${area}`).toBe(true);
      });
    }
  }
});

describe("AC13 compound options for short budgets and main lifts", () => {
  for (const profile of REQUIRED_PROFILES) {
    for (const area of LARGE_AREAS) {
      it(`${profile} × ${area} has a compound option`, () => {
        const has = exercises.some(
          (e) =>
            isAvailableIn(e.equipment, profile) && e.areas[area] === 1 && e.type === "compound",
        );
        expect(has, `${profile} × ${area}`).toBe(true);
      });
    }
  }
});
