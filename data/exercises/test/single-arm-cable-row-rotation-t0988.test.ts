// T-0988 (D-0260, D-0261, D-0263, D-0268; UF-04.1, UF-04.2): the single-arm cable row with rotation.
// AC1 the row's fields and schema, AC2 search hits and the per-arm line inputs, AC3 one hard set,
// AC4 the engine prices it as one-side work. The UI line (one-side-howto.test.tsx), the counting
// (rule-7-1-one-side.test.ts) and the cost (rule 7.1) read the flag from data, so these tests pin
// the data they read.
import { describe, expect, it } from "vitest";
import { type Exercise, loadLibrary } from "../src/index.js";
import { validator } from "./helpers.js";

const ID = "single-arm-cable-row-rotation";
const lib = loadLibrary();
const row = lib.find((e) => e.id === ID) as Exercise;

describe("T-0988 AC1 the row", () => {
  it("is in the library and validates against the schema", () => {
    expect(row).toBeDefined();
    const validate = validator();
    expect(validate(row), JSON.stringify(validate.errors)).toBe(true);
  });

  it("has the ticket's field values", () => {
    expect(row.name).toBe("Single-arm cable row with rotation");
    expect([row.kind, row.type, row.level, row.timed, row.bodyweight]).toEqual([
      "exercise",
      "compound",
      "intermediate",
      false,
      false,
    ]);
    expect(row.equipment).toEqual(["cable"]);
    expect(row.increment_kg).toBe(2.5);
    expect(row.areas).toEqual({ back: 1, core: 0.5, arms: 0.5 });
    expect(row.mistakes).toHaveLength(2);
    expect(row.variants).toEqual(expect.arrayContaining(["seated-cable-row", "dumbbell-row"]));
    expect([row.source, row.license]).toEqual(["workoutlab", "LicenseRef-workoutLab"]);
  });

  it("is a variant of both rows it names (variants are symmetric)", () => {
    for (const id of ["seated-cable-row", "dumbbell-row"]) {
      expect(lib.find((e) => e.id === id)?.variants).toContain(ID);
    }
  });
});

describe("T-0988 AC2 library search and the per-arm line (UF-04.1, UF-04.2)", () => {
  // Library.tsx matches the lower-cased query inside the lower-cased name.
  const hits = (q: string): string[] =>
    lib
      .filter((e) => e.kind === "exercise" && e.name.toLowerCase().includes(q))
      .map((e) => e.id);

  it.each(["rotation", "cable row"])("searching '%s' finds the row", (q) => {
    expect(hits(q)).toContain(ID);
  });

  it("is flagged arm and not timed, so UF-04.2 shows the 'per arm' line (D-0261 §2)", () => {
    expect(row.unilateral).toBe("arm");
    expect(row.timed).toBe(false);
  });

  it("says to switch arms", () => {
    expect(row.instructions.some((s) => /switch arms/i.test(s))).toBe(true);
  });
});

describe("T-0988 AC3 one set is one hard set (D-0260 §1, engine rule 1)", () => {
  it("carries only the library's weights 1 and 0.5, with no side factor", () => {
    for (const w of Object.values(row.areas)) expect([1, 0.5]).toContain(w);
    expect(Object.keys(row).filter((k) => /side|factor|multiplier|double/i.test(k))).toEqual([]);
  });
});

describe("T-0988 AC4 the engine prices it as one-side work (D-0268, rule 7.1)", () => {
  it("has a flag the engine reads as one side (arm), and no planned duration", () => {
    expect(["arm", "leg", "side"]).toContain(row.unilateral);
    expect("default_duration_s" in row).toBe(false);
  });
});
