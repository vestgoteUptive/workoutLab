import { describe, expect, it } from "vitest";
import { loadLibrary } from "../src/index.js";

const lib = loadLibrary();
const byId = new Map(lib.map((e) => [e.id, e]));
// D-0033 §7: variants are required only for `kind: "exercise"` rows.
const exercises = lib.filter((e) => e.kind === "exercise");

describe("AC6 variants (UF-04.3, UF-05.1, UF-08.3)", () => {
  it("every exercise has at least 1 variant", () => {
    for (const e of exercises) expect(e.variants.length, e.id).toBeGreaterThanOrEqual(1);
  });

  it("every variant id resolves to a library file", () => {
    for (const e of exercises) {
      for (const v of e.variants) expect(byId.has(v), `${e.id} -> ${v}`).toBe(true);
    }
  });

  it("no exercise lists itself or lists the same variant twice", () => {
    for (const e of exercises) {
      expect(e.variants, e.id).not.toContain(e.id);
      expect(new Set(e.variants).size, e.id).toBe(e.variants.length);
    }
  });

  it("variants are symmetric", () => {
    for (const e of exercises) {
      for (const v of e.variants) {
        const other = byId.get(v);
        expect(other?.variants, `${e.id} <-> ${v}`).toContain(e.id);
      }
    }
  });

  it("each variant pair shares at least one primary area", () => {
    for (const e of exercises) {
      const ePrimary = new Set(Object.entries(e.areas).filter(([, w]) => w === 1).map(([a]) => a));
      for (const v of e.variants) {
        const other = byId.get(v);
        if (!other) continue;
        const oPrimary = Object.entries(other.areas)
          .filter(([, w]) => w === 1)
          .map(([a]) => a);
        const shared = oPrimary.some((a) => ePrimary.has(a));
        expect(shared, `${e.id} <-> ${v}`).toBe(true);
      }
    }
  });
});
