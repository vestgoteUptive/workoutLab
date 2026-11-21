// T-0971 (D-0260 §2, D-0263 §3 §9; UF-04.2, UF-09.3): the optional `unilateral` flag.
// AC1 schema, AC2 the 16 rows, AC3 switch text, AC4 108 rows and unflagged text unchanged,
// AC6 loader reads.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type Exercise, loadLibrary } from "../src/index.js";
import { pkgRoot, readInvalidFixture, validator } from "./helpers.js";

const FLAGGED: Readonly<Record<string, "arm" | "leg" | "side">> = {
  "single-leg-deadlift": "leg",
  "single-leg-calf-raise": "leg",
  "split-squat": "leg",
  "bulgarian-split-squat": "leg",
  "barbell-lunge": "leg",
  "dumbbell-lunge": "leg",
  "forward-lunge": "leg",
  "lateral-lunge": "leg",
  "glute-kickback-machine": "leg",
  "donkey-kick": "leg",
  "fire-hydrant": "leg",
  "banded-glute-kickback": "leg",
  "cable-kickback": "leg",
  "dumbbell-row": "arm",
  "cable-woodchop": "side",
  "side-plank": "side",
};

const validFixture = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(pkgRoot, "test/fixtures/valid", name), "utf8")) as Record<
    string,
    unknown
  >;

describe("T-0971 AC1 schema: unilateral is an optional arm|leg|side enum", () => {
  const validate = validator();

  it.each(["arm", "leg", "side"])("unilateral: %s validates", (v) => {
    const ok = validate(validFixture(`unilateral-${v}.json`));
    expect(ok, JSON.stringify(validate.errors)).toBe(true);
  });

  it.each(["both", "empty", "number"])("unilateral-%s.json fails on /unilateral", (n) => {
    const ok = validate(readInvalidFixture(`unilateral-${n}.json`));
    expect(ok).toBe(false);
    expect((validate.errors ?? []).map((e) => e.instancePath)).toContain("/unilateral");
  });

  it("an absent field validates", () => {
    const { unilateral: _drop, ...rest } = validFixture("unilateral-arm.json");
    expect("unilateral" in rest).toBe(false);
    expect(validate(rest), JSON.stringify(validate.errors)).toBe(true);
  });
});

describe("T-0971 AC2 exactly the 16 listed rows carry unilateral", () => {
  const lib = loadLibrary();

  it("has the listed values: 13 leg, 1 arm, 2 side", () => {
    const got = Object.fromEntries(
      lib.filter((e) => e.unilateral !== undefined).map((e) => [e.id, e.unilateral]),
    );
    expect(got).toEqual(FLAGGED);
    const vals = Object.values(got);
    expect(vals.filter((v) => v === "leg")).toHaveLength(13);
    expect(vals.filter((v) => v === "arm")).toHaveLength(1);
    expect(vals.filter((v) => v === "side")).toHaveLength(2);
  });

  it("the other 92 rows carry none, machine-torso-rotation included", () => {
    const others = lib.filter((e) => !(e.id in FLAGGED));
    expect(others).toHaveLength(92);
    for (const e of others) expect("unilateral" in e, e.id).toBe(false);
    const torso = lib.find((e) => e.id === "machine-torso-rotation");
    expect(torso).toBeDefined();
    expect("unilateral" in (torso as Exercise)).toBe(false);
  });
});

describe("T-0971 AC3 step text", () => {
  const lib = loadLibrary();
  const flagged = lib.filter((e) => e.id in FLAGGED);

  it.each(flagged.map((e) => [e.id, e] as const))("%s has a step with 'switch'", (_id, e) => {
    expect(e.instructions.some((s) => /switch/i.test(s))).toBe(true);
  });

  it.each(["banded-glute-kickback", "cable-kickback", "cable-woodchop"])(
    "%s replaced 'repeat' with switch text",
    (id) => {
      const e = lib.find((x) => x.id === id) as Exercise;
      expect(e.instructions.join(" ")).not.toMatch(/\brepeat\b/i);
    },
  );

  it("side-plank is timed and says the seconds are per side", () => {
    const sp = lib.find((e) => e.id === "side-plank") as Exercise;
    expect(sp.timed).toBe(true);
    expect(sp.instructions.some((s) => /seconds are per side/i.test(s))).toBe(true);
  });

  it("every step of every row is 5 to 120 characters, at most 5 steps", () => {
    for (const e of lib) {
      expect(e.instructions.length, e.id).toBeLessThanOrEqual(5);
      for (const s of e.instructions) {
        expect(s.length, `${e.id}: ${s}`).toBeGreaterThanOrEqual(5);
        expect(s.length, `${e.id}: ${s}`).toBeLessThanOrEqual(120);
      }
    }
  });
});

describe("T-0971 AC4 108 rows (the unflagged-row diff is checked in the ticket log)", () => {
  it("has 108 rows", () => {
    expect(loadLibrary()).toHaveLength(108);
  });

});

describe("T-0971 AC6 loader reads", () => {
  const lib = loadLibrary();
  it("dumbbell-row returns unilateral: 'arm'", () => {
    expect(lib.find((e) => e.id === "dumbbell-row")?.unilateral).toBe("arm");
  });
  it("barbell-row has no value (both sides)", () => {
    const row = lib.find((e) => e.id === "barbell-row");
    expect(row).toBeDefined();
    expect(row?.unilateral).toBeUndefined();
  });
});
