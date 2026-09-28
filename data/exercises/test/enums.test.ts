import { describe, expect, it } from "vitest";
import { loadLibrary } from "../src/index.js";
import { EQUIPMENT_VOCAB } from "../src/profiles.js";

const lib = loadLibrary();

describe("AC5 enums and equipment", () => {
  it("type is compound or isolation", () => {
    for (const e of lib) expect(["compound", "isolation"]).toContain(e.type);
  });

  it("level is beginner, intermediate or advanced", () => {
    for (const e of lib) expect(["beginner", "intermediate", "advanced"]).toContain(e.level);
  });

  it("timed is a boolean", () => {
    for (const e of lib) expect(typeof e.timed).toBe("boolean");
  });

  it("equipment is non-empty, unique, and from the D-0022/D-0033 vocabulary", () => {
    for (const e of lib) {
      expect(e.equipment.length, e.id).toBeGreaterThan(0);
      expect(new Set(e.equipment).size, e.id).toBe(e.equipment.length);
      for (const item of e.equipment) expect(EQUIPMENT_VOCAB).toContain(item);
    }
  });

  it("a file whose equipment contains none has equipment exactly [none]", () => {
    for (const e of lib) {
      if (e.equipment.includes("none")) expect(e.equipment).toEqual(["none"]);
    }
  });
});
