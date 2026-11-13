// T-0691 (D-0234 §2–3): the 13 generic machine rows, pinned to the ticket table (UF-04.1, UF-04.2,
// UF-04.3, UF-05.1, UF-08.3). AC2 exact values, AC3 text shape and provenance, AC6 profile
// availability, AC7 machine vs cable distinction. AC5 symmetry lives in variants.test.ts.
import { describe, expect, it } from "vitest";
import { type Exercise, loadLibrary } from "../src/index.js";
import { type Area, isAvailableIn } from "../src/profiles.js";

interface Expected {
  readonly name: string;
  readonly type: "compound" | "isolation";
  readonly areas: Readonly<Partial<Record<Area, 1 | 0.5>>>;
  readonly variants: readonly string[];
}

const NEW_ROWS: Readonly<Record<string, Expected>> = {
  "incline-machine-press": {
    name: "Incline machine press",
    type: "compound",
    areas: { chest: 1, shoulders: 0.5, arms: 0.5 },
    variants: ["machine-chest-press", "incline-dumbbell-press"],
  },
  "machine-chest-fly": {
    name: "Machine chest fly",
    type: "isolation",
    areas: { chest: 1 },
    variants: ["cable-fly", "dumbbell-fly"],
  },
  "machine-rear-delt-fly": {
    name: "Machine rear delt fly",
    type: "isolation",
    areas: { shoulders: 1 },
    variants: ["rear-delt-fly-dumbbell"],
  },
  "machine-lateral-raise": {
    name: "Machine lateral raise",
    type: "isolation",
    areas: { shoulders: 1 },
    variants: ["lateral-raise-dumbbell", "cable-lateral-raise"],
  },
  "machine-row": {
    name: "Machine row",
    type: "compound",
    areas: { back: 1, arms: 0.5 },
    variants: ["seated-cable-row", "dumbbell-row", "machine-lat-pulldown"],
  },
  "machine-lat-pulldown": {
    name: "Machine lat pulldown",
    type: "compound",
    areas: { back: 1, arms: 0.5 },
    variants: ["lat-pulldown", "machine-row"],
  },
  "machine-bicep-curl": {
    name: "Machine bicep curl",
    type: "isolation",
    areas: { arms: 1 },
    variants: ["dumbbell-bicep-curl", "barbell-bicep-curl"],
  },
  "machine-ab-crunch": {
    name: "Machine ab crunch",
    type: "isolation",
    areas: { core: 1 },
    variants: ["hanging-leg-raise", "machine-torso-rotation"],
  },
  "machine-back-extension": {
    name: "Machine back extension",
    type: "isolation",
    areas: { back: 1, glutes: 0.5 },
    variants: ["superman", "bird-dog"],
  },
  "machine-torso-rotation": {
    name: "Machine torso rotation",
    type: "isolation",
    areas: { core: 1 },
    variants: ["cable-woodchop", "weighted-russian-twist", "machine-ab-crunch"],
  },
  "seated-leg-curl-machine": {
    name: "Seated leg curl (machine)",
    type: "isolation",
    areas: { hamstrings: 1 },
    variants: ["leg-curl-machine", "sliding-leg-curl"],
  },
  "hip-abduction-machine": {
    name: "Hip abduction (machine)",
    type: "isolation",
    areas: { glutes: 1 },
    variants: ["fire-hydrant", "glute-kickback-machine"],
  },
  "glute-kickback-machine": {
    name: "Glute kickback (machine)",
    type: "isolation",
    areas: { glutes: 1, hamstrings: 0.5 },
    variants: ["cable-kickback", "banded-glute-kickback", "hip-abduction-machine"],
  },
};

const IDS = Object.keys(NEW_ROWS);
const byId = new Map(loadLibrary().map((e) => [e.id, e]));

function row(id: string): Exercise {
  const e = byId.get(id);
  if (!e) throw new Error(`missing library row ${id}`);
  return e;
}

// Same one-sentence rule as text.test.ts: no sentence end followed by more text.
const ONE_SENTENCE = /[.!?]\s+\S/;

describe("T-0691 AC2 the 13 machine rows match the ticket table (UF-04.1, UF-04.2)", () => {
  it("there are exactly 13 new ids", () => {
    expect(IDS).toHaveLength(13);
  });

  for (const id of IDS) {
    const want = NEW_ROWS[id];
    it(`${id}: exact id, name, type, level, equipment, flags, increment, areas, variants`, () => {
      const e = row(id);
      expect(e.id).toBe(id);
      expect(e.name).toBe(want?.name);
      expect(e.kind).toBe("exercise");
      expect(e.type).toBe(want?.type);
      expect(e.level).toBe("beginner");
      expect(e.equipment).toEqual(["machine"]);
      expect(e.bodyweight).toBe(false);
      expect(e.timed).toBe(false);
      expect(e.increment_kg).toBe(5);
      expect(e.areas).toEqual(want?.areas);
      expect(e.variants).toEqual(want?.variants);
    });
  }
});

describe("T-0691 AC3 text shape and provenance (UF-04.2, UF-09.3, D-0234 §2)", () => {
  for (const id of IDS) {
    it(`${id}: 3-5 one-sentence steps <= 120 chars, one 3-60 char cue, 1-3 mistakes`, () => {
      const e = row(id);
      expect(e.instructions.length).toBeGreaterThanOrEqual(3);
      expect(e.instructions.length).toBeLessThanOrEqual(5);
      for (const step of e.instructions) {
        expect(step.length, step).toBeGreaterThanOrEqual(1);
        expect(step.length, step).toBeLessThanOrEqual(120);
        expect(step, step).not.toMatch(ONE_SENTENCE);
      }
      expect(typeof e.cue).toBe("string");
      expect(e.cue.length).toBeGreaterThanOrEqual(3);
      expect(e.cue.length).toBeLessThanOrEqual(60);
      expect(e.cue).not.toMatch(/\n/);
      expect(e.mistakes.length).toBeGreaterThanOrEqual(1);
      expect(e.mistakes.length).toBeLessThanOrEqual(3);
    });

    it(`${id}: source workoutlab, LicenseRef-workoutLab, no source_url or attribution`, () => {
      const e = row(id);
      expect(e.source).toBe("workoutlab");
      expect(e.license).toBe("LicenseRef-workoutLab");
      expect(e).not.toHaveProperty("source_url");
      expect(e).not.toHaveProperty("attribution");
    });
  }
});

describe("T-0691 AC6 profile availability (UF-08.3, D-0022 §6)", () => {
  for (const id of IDS) {
    it(`${id}: available in full-gym and a rule 7.2 candidate (an area at weight 1)`, () => {
      const e = row(id);
      expect(isAvailableIn(e.equipment, "full-gym")).toBe(true);
      expect(Object.values(e.areas)).toContain(1);
    });

    it(`${id}: not available in bodyweight or dumbbells`, () => {
      const e = row(id);
      expect(isAvailableIn(e.equipment, "bodyweight")).toBe(false);
      expect(isAvailableIn(e.equipment, "dumbbells")).toBe(false);
    });
  }
});

describe("T-0691 AC7 machine rows stay distinct from the cable rows (D-0234 §3, rule 12)", () => {
  const PAIRS: readonly (readonly [string, string])[] = [
    ["machine-row", "seated-cable-row"],
    ["machine-lat-pulldown", "lat-pulldown"],
  ];
  for (const [machine, cable] of PAIRS) {
    it(`${machine} and ${cable} share no equipment item`, () => {
      const cableEquipment = row(cable).equipment;
      expect(cableEquipment.length).toBeGreaterThanOrEqual(1);
      const shared = row(machine).equipment.filter((item) => cableEquipment.includes(item));
      expect(shared).toEqual([]);
    });
  }
});
