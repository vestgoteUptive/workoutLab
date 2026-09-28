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
