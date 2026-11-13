// T-0936 UF-08.2 (D-0237, D-0239 §4, §15): the rule 7.2 switches `autoMainLift` (step 1) and
// `fill` (step 3) on `SessionInput`. Examples R7-E31…E36, the B18 deep-equal checks, the
// RangeError on a non-boolean switch and "never copied into Workout".
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { suggest, type HistorySet, type SessionInput, type Workout } from "@workoutlab/engine";
import {
  F_PROFILE,
  F_TARGETS,
  LIBRARY,
  NOW,
  TZ,
  input,
  itemsOf,
  warmupOf,
} from "./fixtures/common.js";
import { SIMULATED_HISTORIES } from "./fixtures/histories.js";
import { RULE13_NOTE_D0237 } from "./fixtures/rule13-note-d0237.js";
import { t0204GuardOk, t0224GuardOk } from "./rule12-guards.js";

const REPO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const DOC = readFileSync(path.join(REPO_DIR, "docs", "engine-rules.md"), "utf8");

function run(si: SessionInput, history: readonly HistorySet[] = []): Workout {
  return suggest(history, F_TARGETS, F_PROFILE, LIBRARY, si, NOW, TZ);
}

const OFF = { autoMainLift: false, fill: false } as const;

describe("rule 7.2 switches: B18 deep-equal (D-0237 §1, D-0239 §15)", () => {
  it("rule-7 (AC2) R7-E32 autoMainLift false with an eligible mainLiftId (fill absent) deep-equals the call without it", () => {
    const base = run(input({ mainLiftId: "bench-press" }));
    const w = run(input({ mainLiftId: "bench-press", autoMainLift: false }));
    expect(w).toEqual(base);
    expect(itemsOf(w)).toEqual([
      ["bench-press", 4],
      ["inverted-row", 3],
      ["leg-extension", 2],
    ]);
    // Over every simulated history too (the explicit main lift is eligible in each).
    for (const [name, h] of Object.entries(SIMULATED_HISTORIES)) {
      const mainLiftId = run(input(), h).plan.mainLiftId;
      expect(mainLiftId, name).not.toBeNull();
      expect(run(input({ mainLiftId, autoMainLift: false }), h), name).toEqual(
        run(input({ mainLiftId }), h),
      );
    }
  });

  it("rule-7 (AC4) `undefined` switches are absent: deep-equal to the call without the keys", () => {
    const base = run(input());
    // A caller without exactOptionalPropertyTypes (or a JSON-less JS caller) may pass undefined.
    const withUndefined = { ...input(), autoMainLift: undefined, fill: undefined };
    expect(run(withUndefined as unknown as SessionInput)).toEqual(base);
    expect(run(input({ autoMainLift: true, fill: true }))).toEqual(base);
  });
});

describe("rule 7.2 switches: examples (D-0237 §2, D-0239 §4)", () => {
  it("rule-7 (AC3) R7-E31 both off, no pins: items [], mainLiftId null, itemsTotalS 0, unusedS 1620, general warm-up", () => {
    const w = run(input(OFF));
    expect(w.plan.items).toEqual([]);
    expect(w.plan.mainLiftId).toBeNull();
    expect(w.itemsTotalS).toBe(0);
    expect(w.totalS).toBe(180);
    expect(w.unusedS).toBe(1620);
    expect(w.sessionReasons).toEqual([]);
    // Rule 7.3 with no items: general moves by id, then any unused move by id.
    expect(warmupOf(w)).toEqual([
      "wu-jumping-jack",
      "wu-march-in-place",
      "wu-arm-circle",
      "wu-band-pull-apart",
    ]);
    expect(w.plan.warmup.every((m) => m.durationS === 40)).toBe(true);
  });

  it("rule-7 (AC6) R7-E32 explicit main, nothing else: bench-press × 4 (main, 720 s) only, unusedS 900", () => {
    const w = run(input({ mainLiftId: "bench-press", ...OFF }));
    expect(w.plan.items.map((i) => [i.exerciseId, i.sets, i.isMain, i.costS])).toEqual([
      ["bench-press", 4, true, 720],
    ]);
    expect(w.plan.mainLiftId).toBe("bench-press");
    expect(w.itemsTotalS).toBe(720);
    expect(w.unusedS).toBe(900);
    expect(w.plan.items[0]?.reasons[0]).toEqual({ code: "main_lift" });
  });

  it("rule-7 (AC7) R7-E33 picks only: leg-extension × 3 (not main), mainLiftId null, unusedS 1620 − 375", () => {
    const w = run(input({ pinnedIds: ["leg-extension"], ...OFF }));
    expect(w.plan.items.map((i) => [i.exerciseId, i.sets, i.isMain, i.costS])).toEqual([
      ["leg-extension", 3, false, 375],
    ]);
    expect(w.plan.mainLiftId).toBeNull();
    expect(w.itemsTotalS).toBe(375);
    expect(w.unusedS).toBe(1620 - (w.plan.items[0]?.costS ?? NaN));
    expect(w.unusedS).toBe(1245);
  });

  it("rule-7 (AC8) R7-E34 auto main equal to a pin: bench-press once, as the main lift, first, nothing else", () => {
    const w = run(input({ pinnedIds: ["bench-press"], fill: false }));
    expect(w.plan.items.filter((i) => i.exerciseId === "bench-press")).toHaveLength(1);
    expect(w.plan.items.map((i) => [i.exerciseId, i.sets, i.isMain])).toEqual([
      ["bench-press", 4, true],
    ]);
    expect(w.plan.mainLiftId).toBe("bench-press");
    expect(w.unusedS).toBe(900);
  });

  it("rule-7 (AC9) R7-E35 caps on pins at 60 min: two chest pins, the third (push-up) dropped, nothing added", () => {
    const pinnedIds = ["bench-press", "db-bench-press", "push-up"];
    const w = run(input({ budgetMin: 60, pinnedIds, ...OFF }));
    expect(w.plan.items.map((i) => [i.exerciseId, i.sets, i.isMain, i.costS])).toEqual([
      ["bench-press", 3, false, 555],
      ["db-bench-press", 3, false, 555],
    ]);
    const chestPrimary = w.plan.items.filter(
      (i) => LIBRARY.find((e) => e.id === i.exerciseId)?.areas.chest === 1,
    );
    expect(chestPrimary).toHaveLength(2);
    expect(w.plan.mainLiftId).toBeNull();
    expect(w.itemsTotalS).toBe(1110);
    expect(w.unusedS).toBe(2310);
    // Pin order decides which one is dropped.
    const reordered = run(
      input({ budgetMin: 60, pinnedIds: ["push-up", "db-bench-press", "bench-press"], ...OFF }),
    );
    expect(itemsOf(reordered)).toEqual([
      ["push-up", 3],
      ["db-bench-press", 3],
    ]);
  });

  it("rule-7 (AC10) R7-E36 suggestions call: main → pins → fill, deep-equal to the call without switches", () => {
    const w = run(input({ pinnedIds: ["leg-extension"], autoMainLift: true, fill: true }));
    expect(w.plan.items.map((i) => [i.exerciseId, i.sets, i.isMain, i.costS])).toEqual([
      ["bench-press", 4, true, 720],
      ["leg-extension", 3, false, 375],
      ["inverted-row", 2, false, 390],
    ]);
    expect(w.itemsTotalS).toBe(1485);
    expect(w.unusedS).toBe(135);
    expect(w).toEqual(run(input({ pinnedIds: ["leg-extension"] })));
    // Every other item is the one the engine adds around the pin: the main lift is step 1's
    // (R7-E34 with fill off), and the rest is what the fill adds after the pins.
    const mainOnly = run(input({ pinnedIds: ["leg-extension"], fill: false }));
    expect(itemsOf(mainOnly)).toEqual([
      ["bench-press", 4],
      ["leg-extension", 3],
    ]);
    expect(itemsOf(w).slice(0, 2)).toEqual(itemsOf(mainOnly));
  });

  it("rule-13 (AC3) shuffle with fill false has no effect on items (every slot is the main lift or a pin)", () => {
    const si = input({ mainLiftId: "bench-press", pinnedIds: ["inverted-row", "leg-extension"] });
    const base = run({ ...si, ...OFF });
    for (let n = 1; n <= 6; n++) expect(run({ ...si, ...OFF, shuffle: n }), `n=${n}`).toEqual(base);
    // With the fill on, shuffle does change something (so the check above is not vacuous).
    expect(itemsOf(run(input({ shuffle: 1 })))).not.toEqual(itemsOf(run(input())));
  });
});

describe("rule 7.2 switches: validation and output shape (D-0239 §4)", () => {
  it.each(["autoMainLift", "fill"] as const)(
    "rule-7 (AC4) a present non-boolean %s throws RangeError naming the key",
    (key) => {
      for (const bad of ["false", 0, null, 1, "true", {}, []] as unknown[]) {
        const si = { ...input(), [key]: bad } as unknown as SessionInput;
        expect(() => run(si), `${key}=${JSON.stringify(bad)}`).toThrow(RangeError);
        expect(() => run(si), `${key}=${JSON.stringify(bad)}`).toThrow(new RegExp(key));
      }
    },
  );

  it("rule-7 (AC5) the returned Workout never carries autoMainLift or fill", () => {
    const variants: Partial<SessionInput>[] = [
      {},
      { autoMainLift: true, fill: true },
      { autoMainLift: false },
      { fill: false },
      OFF,
      { ...OFF, pinnedIds: ["leg-extension"], mainLiftId: "bench-press" },
    ];
    for (const v of variants) {
      const w = run(input(v));
      for (const obj of [w, w.plan, ...w.plan.items] as object[]) {
        expect(Object.keys(obj), JSON.stringify(v)).not.toContain("autoMainLift");
        expect(Object.keys(obj), JSON.stringify(v)).not.toContain("fill");
      }
      expect(JSON.stringify(w)).not.toMatch(/"(autoMainLift|fill)"/);
    }
  });

  it("rule-7 (AC3) inputs are never mutated with the switches set", () => {
    const si = Object.freeze(input({ ...OFF, pinnedIds: Object.freeze(["leg-extension"]) }));
    const copy = structuredClone(si);
    run(si);
    expect(si).toEqual(copy);
  });
});

describe("rule 13 note (D-0237 §2): the rule 12 / 13 guards accept exactly this edit", () => {
  it("rule-13 (AC3) the rule 13 paragraph is the fixture's after line, once", () => {
    const lines = DOC.split("\n");
    expect(lines.filter((l) => l === RULE13_NOTE_D0237.after)).toHaveLength(1);
    expect(lines).not.toContain(RULE13_NOTE_D0237.before);
    expect(RULE13_NOTE_D0237.after.startsWith(RULE13_NOTE_D0237.before)).toBe(true);
  });

  it("rule-13 (AC3) both guards accept a main before or after the note, and reject any other rule 13 change", () => {
    const before = DOC.replace(RULE13_NOTE_D0237.after, RULE13_NOTE_D0237.before);
    expect(before).not.toBe(DOC);
    for (const guard of [t0204GuardOk, t0224GuardOk]) {
      expect(guard(DOC, before)).toBe(true);
      expect(guard(DOC, DOC)).toBe(true);
      const touched = DOC.replace("There is no randomness.", "There is no randomness at all.");
      expect(guard(touched, before)).toBe(false);
      expect(guard(touched, DOC)).toBe(false);
    }
  });
});
