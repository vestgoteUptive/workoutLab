// T-0945 UF-09.10 UF-09.9: rule 8 `timeLeftS`, the time left in a workout in progress
// (D-0244 §2, D-0246 §11). AC1–AC7 (R8-E4…R8-E7). Fixture P is the spec's (fixtures/insert-p.ts).
import { describe, expect, it } from "vitest";
import { timeCheck, timeLeftS, type TimeLeftProgress, type Workout } from "@workoutlab/engine";
import { deepFreeze } from "./fixtures/common.js";
import { B1_STATE, fixtureP, progress } from "./fixtures/insert-p.js";

const P = fixtureP();

describe("rule 8 timeLeftS examples (R8-E4…R8-E7)", () => {
  it("rule-8 fixture P: 720 + 555 + 270 = 1545 s of items, available 2520, no back-off", () => {
    expect(P.plan.items.map((i) => [i.exerciseId, i.sets, i.costS, i.isMain])).toEqual([
      ["bench-press", 4, 720, true],
      ["inverted-row", 3, 555, false],
      ["leg-extension", 2, 270, false],
    ]);
    expect(P.plan.items.every((i) => i.backoff === null)).toBe(true);
    expect([P.budgetMin, P.itemsTotalS, P.unusedS, P.warmupInBudget]).toEqual([
      45,
      1545,
      975,
      true,
    ]);
  });

  it("R8-E4 rule-8 (AC1, B1) 2700 − 600 − 2 × 165 − 555 − 270 = 945", () => {
    // bench-press per set (720 − 60) / 4 = 165; 2 of 4 sets left = 330, no transition.
    expect(timeLeftS(P, B1_STATE)).toBe(945);
  });

  it.each([
    [35, 345],
    [32, 165],
    [30, 45],
  ])("R8-E5 rule-8 (AC2, B2–B4) AC1's state at budgetMin %i gives %i", (budgetMin, left) => {
    // budgetMin × 60 − 600 − 330 − 825.
    expect(timeLeftS(fixtureP({ budgetMin }), B1_STATE)).toBe(left);
  });

  it("R8-E6 rule-8 (AC3, B7) paused in the warm-up: 2700 − 60 − 120 − 1545 = 975", () => {
    expect(timeLeftS(P, progress(P, { elapsedS: 60, warmupLeftS: 120 }))).toBe(975);
  });

  it("R8-E7 rule-8 (AC4, B8) on leg-extension set 2 of 2: 2700 − 1500 − 0 − 0 − 105 = 1095", () => {
    // leg-extension per set (270 − 60) / 2 = 105; bench-press and inverted-row are done.
    expect(timeLeftS(P, progress(P, { elapsedS: 1500, setsDone: [4, 3, 1] }))).toBe(1095);
  });

  it("rule-8 (AC4) more sets logged than planned leave 0, never a negative remainder", () => {
    expect(timeLeftS(P, progress(P, { elapsedS: 1500, setsDone: [6, 3, 2] }))).toBe(1200);
  });

  it("rule-8 a back-off counts as a set: 4 + 1 sets at (885 − 60) / 5 = 165", () => {
    const main = P.plan.items[0]!;
    const withBackoff: Workout = {
      ...P,
      plan: {
        ...P.plan,
        items: [
          { ...main, costS: 885, backoff: { weightKg: null, reps: 6 } },
          ...P.plan.items.slice(1),
        ],
      },
    };
    // 2 of 5 done: 3 × 165 = 495 left; 2700 − 600 − 495 − 825 = 780.
    expect(timeLeftS(withBackoff, B1_STATE)).toBe(780);
    // 5 of 5 done: nothing left of it.
    expect(timeLeftS(withBackoff, { ...B1_STATE, setsDone: [5, 0, 0] })).toBe(1275);
  });
});

describe("rule 8 timeLeftS skipped items and the warm-up (AC5)", () => {
  it("rule-8 (AC5) a skipped item's cost is not subtracted", () => {
    // AC1 with inverted-row skipped: 945 + 555.
    expect(timeLeftS(P, { ...B1_STATE, skippedItems: [1] })).toBe(1500);
    // A skipped item with sets logged ahead counts for nothing either.
    expect(timeLeftS(P, { ...B1_STATE, setsDone: [2, 0, 1], skippedItems: [2] })).toBe(1215);
    // Duplicate entries change nothing.
    expect(timeLeftS(P, { ...B1_STATE, skippedItems: [1, 1] })).toBe(1500);
  });

  it("rule-8 (AC5) with warmupInBudget off, warmupLeftS must be 0", () => {
    const off = fixtureP({ warmupInBudget: false });
    expect(timeLeftS(off, B1_STATE)).toBe(945);
    expect(() => timeLeftS(off, { ...B1_STATE, warmupLeftS: 1 })).toThrow(RangeError);
    expect(() => timeLeftS(off, { ...B1_STATE, warmupLeftS: 180 })).toThrow(RangeError);
  });
});

describe("rule 8 timeLeftS validation (AC6)", () => {
  const bad: Array<[string, TimeLeftProgress]> = [
    ["elapsedS 600.5", { ...B1_STATE, elapsedS: 600.5 }],
    ["elapsedS −1", { ...B1_STATE, elapsedS: -1 }],
    ["elapsedS NaN", { ...B1_STATE, elapsedS: Number.NaN }],
    ["warmupLeftS −1", { ...B1_STATE, warmupLeftS: -1 }],
    ["warmupLeftS 181", { ...B1_STATE, warmupLeftS: 181 }],
    ["warmupLeftS 1.5", { ...B1_STATE, warmupLeftS: 1.5 }],
    ["setsDone[1] −1", { ...B1_STATE, setsDone: [2, -1, 0] }],
    ["setsDone[0] 1.5", { ...B1_STATE, setsDone: [1.5, 0, 0] }],
    ["setsDone too short", { ...B1_STATE, setsDone: [2, 0] }],
    ["setsDone too long", { ...B1_STATE, setsDone: [2, 0, 0, 0] }],
    ["skippedItems [3]", { ...B1_STATE, skippedItems: [3] }],
    ["skippedItems [−1]", { ...B1_STATE, skippedItems: [-1] }],
    ["skippedItems [0.5]", { ...B1_STATE, skippedItems: [0.5] }],
  ];

  it.each(bad)("rule-8 (AC6) %s is a RangeError", (_name, p) => {
    expect(() => timeLeftS(P, p)).toThrow(RangeError);
  });

  it("rule-8 (AC6) the boundaries are accepted: elapsedS 0, warmupLeftS 0 and 180", () => {
    expect(timeLeftS(P, progress(P, { warmupLeftS: 180 }))).toBe(2700 - 180 - 1545);
    expect(timeLeftS(P, progress(P))).toBe(2700 - 1545);
  });

  it("rule-8 (AC6) a negative result is returned, not clamped", () => {
    expect(timeLeftS(P, progress(P, { elapsedS: 2000 }))).toBe(2700 - 2000 - 1545);
  });
});

describe("rule 8 timeLeftS consistency with timeCheck (AC7, D-0246 §11)", () => {
  it("rule-8 (AC7) between exercises, nothing ahead and nothing skipped: timeLeftS = −behindS", () => {
    // After bench-press, elapsedS 1300: behindS = 1300 + 825 − 2700 = −575.
    const p = progress(P, { elapsedS: 1300, setsDone: [4, 0, 0] });
    const { behindS } = timeCheck(P, { elapsedS: 1300, nextItemIndex: 1 });
    expect(behindS).toBe(-575);
    expect(timeLeftS(P, p)).toBe(575);
    expect(timeLeftS(P, p)).toBe(-behindS);
    // After inverted-row too, elapsedS 1900.
    const p2 = progress(P, { elapsedS: 1900, setsDone: [4, 3, 0] });
    expect(timeLeftS(P, p2)).toBe(-timeCheck(P, { elapsedS: 1900, nextItemIndex: 2 }).behindS);
  });

  it("rule-8 (AC7) sibling: a later item with a set logged ahead breaks the equality, so it is not asserted", () => {
    // leg-extension has 1 set logged ahead from List view: timeCheck still counts its whole
    // 270 s (it is not started in rule 8's sense), timeLeftS counts 105 s. The 165 s gap is
    // the transition plus one set; this is the documented exception, not a defect.
    const p = progress(P, { elapsedS: 1300, setsDone: [4, 0, 1] });
    const { behindS } = timeCheck(P, { elapsedS: 1300, nextItemIndex: 1 });
    expect(timeLeftS(P, p)).toBe(740);
    expect(timeLeftS(P, p) - -behindS).toBe(165);
    // A skipped later item is the other exception: timeCheck has no skip input.
    const s = progress(P, { elapsedS: 1300, setsDone: [4, 0, 0], skippedItems: [2] });
    expect(timeLeftS(P, s) - -behindS).toBe(270);
  });
});

describe("rule 8 timeLeftS purity (AC18)", () => {
  it("rule-8 (AC18) frozen inputs: two calls agree and nothing is mutated", () => {
    const w = deepFreeze(structuredClone(P));
    const p = deepFreeze(structuredClone({ ...B1_STATE, skippedItems: [2] }));
    const before = structuredClone([w, p]);
    expect(timeLeftS(w, p)).toBe(timeLeftS(w, p));
    expect([w, p]).toStrictEqual(before);
  });
});
