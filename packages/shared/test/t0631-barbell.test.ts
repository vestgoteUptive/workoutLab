// T-0631 AC6 (UF-09.3, D-0218 §4): toBarbell maps profiles.bar_kg/plates_kg to numbers, largest first.
import { describe, expect, it } from "vitest";
import { toBarbell, toEngineProfile, type Tables } from "../src/index.js";

describe("T-0631 AC6 toBarbell", () => {
  it("turns PostgREST numeric strings into numbers and sorts plates largest first", () => {
    expect(toBarbell({ bar_kg: "15.00", plates_kg: ["1.25", "25", "10"] })).toStrictEqual({
      barKg: 15,
      platesKg: [25, 10, 1.25],
    });
  });

  it("keeps an empty plate list empty (bar only)", () => {
    expect(toBarbell({ bar_kg: 20, plates_kg: [] })).toStrictEqual({ barKg: 20, platesKg: [] });
  });

  it("maps a typed profile row with the defaults and leaves EngineProfile without the columns", () => {
    const row: Tables<"profiles"> = {
      user_id: "00000000-0000-4000-8000-00000000000a",
      goal: "build_muscle",
      level: "beginner",
      rhythm_min: 3,
      rhythm_max: 4,
      equipment: ["barbell"],
      priority_areas: [],
      onboarded_at: "2026-08-02T09:00:00+00:00",
      onboarding_timing_ms: null,
      plan_changed_at: "2026-08-02T09:00:00+00:00",
      created_at: "2026-08-02T09:00:00+00:00",
      updated_at: "2026-08-02T09:00:00+00:00",
      bar_kg: 20,
      plates_kg: [1.25, 2.5, 5, 10, 15, 20, 25],
    };
    expect(toBarbell(row)).toStrictEqual({ barKg: 20, platesKg: [25, 20, 15, 10, 5, 2.5, 1.25] });
    const engine = toEngineProfile(row) as Record<string, unknown>;
    expect(engine).not.toHaveProperty("barKg");
    expect(engine).not.toHaveProperty("platesKg");
  });

  it("throws on a value that is not a number", () => {
    expect(() => toBarbell({ bar_kg: "abc", plates_kg: [] })).toThrow(RangeError);
    expect(() => toBarbell({ bar_kg: 20, plates_kg: ["x"] })).toThrow(RangeError);
  });
});
