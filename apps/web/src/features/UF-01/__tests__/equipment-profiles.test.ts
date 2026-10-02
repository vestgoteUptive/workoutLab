// @vitest-environment node
// T-0301b AC-4 (D-0064 §3): the three UF-01.3 profiles, pinned to the literals until a shared
// package exposes them (D-0064 Consequences).
import { describe, expect, it } from "vitest";
import { EQUIPMENT_PROFILES, EQUIPMENT_PROFILE_IDS } from "../equipment-profiles.js";

describe("AC-4 equipment-profiles.ts", () => {
  it("has exactly the three profile ids, in UF-01.3 order", () => {
    expect([...EQUIPMENT_PROFILE_IDS]).toEqual(["bodyweight", "dumbbells", "full-gym"]);
    expect(Object.keys(EQUIPMENT_PROFILES).sort()).toEqual(["bodyweight", "dumbbells", "full-gym"]);
  });

  it("maps each profile to its literal equipment array", () => {
    expect(EQUIPMENT_PROFILES.bodyweight).toEqual(["none"]);
    expect(EQUIPMENT_PROFILES.dumbbells).toEqual(["none", "dumbbell", "bench"]);
    expect(EQUIPMENT_PROFILES["full-gym"]).toEqual([
      "none",
      "dumbbell",
      "bench",
      "barbell",
      "rack",
      "cable",
      "machine",
      "pullup-bar",
      "kettlebell",
      "band",
    ]);
  });
});
