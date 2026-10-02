import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadLibrary } from "../src/index.js";
import { isAvailableIn } from "../src/profiles.js";
import { pkgRoot, repoRoot } from "./helpers.js";

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

// T-0234 (D-0133 §4, D-0062 §5, UF-09.7): the engine's first_time pre-fill echoes the library's
// default_duration_s unclamped, so every timed exercise row must already be within the engine's
// TIMED_MIN_S..TIMED_MAX_S. Warm-up moves are out (D-0040 §2, D-0133 §2).
const TIMED_RANGE = { min: 15, max: 120 } as const;

/** Reads an integer `export const NAME = N;` from the engine's prefill.ts as text (no import). */
function engineConstant(name: string): number {
  const text = readFileSync(resolve(repoRoot, "packages/engine/src/prefill.ts"), "utf8");
  const match = new RegExp(`export const ${name}\\s*=\\s*(\\d+)\\s*;`).exec(text);
  if (!match) throw new Error(`${name} is missing from packages/engine/src/prefill.ts`);
  return Number(match[1]);
}

describe("T-0234 timed exercise default_duration_s is 15..120 (D-0133)", () => {
  const timedExercises = exercises.filter((e) => e.kind === "exercise" && e.timed);

  it("T-0234 AC2 the library has at least 1 timed exercise, plank among them", () => {
    expect(timedExercises.length).toBeGreaterThanOrEqual(1);
    expect(timedExercises.map((e) => e.id)).toContain("plank");
  });

  it("T-0234 AC2 every timed exercise has default_duration_s in [15, 120]", () => {
    const outOfRange = timedExercises
      .filter(
        (e) =>
          typeof e.default_duration_s !== "number" ||
          e.default_duration_s < TIMED_RANGE.min ||
          e.default_duration_s > TIMED_RANGE.max,
      )
      .map((e) => `${e.id}=${String(e.default_duration_s)}`);
    expect(outOfRange).toEqual([]);
  });

  it("T-0234 AC3 the range equals the engine's TIMED_MIN_S..TIMED_MAX_S", () => {
    expect(engineConstant("TIMED_MIN_S")).toBe(TIMED_RANGE.min);
    expect(engineConstant("TIMED_MAX_S")).toBe(TIMED_RANGE.max);
  });

  it("T-0234 AC3 @workoutlab/exercises gains no engine dependency", () => {
    const pkg = JSON.parse(readFileSync(resolve(pkgRoot, "package.json"), "utf8")) as Record<
      string,
      Record<string, string> | undefined
    >;
    for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
      expect(Object.keys(pkg[field] ?? {})).not.toContain("@workoutlab/engine");
    }
  });
});
