// T-0201b UF-09.8: rule 8 running over time, timeCheck() and TimeCheckResult
// (D-0024, D-0037 §8, D-0040 §10). AC29–AC35.
import { describe, expect, it } from "vitest";
import {
  AREAS,
  itemCostS,
  timeCheck,
  type Area,
  type AreaNumbers,
  type LibraryExercise,
  type TimeCheckResult,
  type Workout,
  type WorkoutItem,
} from "@workoutlab/engine";
import { LIBRARY, deepFreeze } from "./fixtures/common.js";

function lib(id: string): LibraryExercise {
  const found = LIBRARY.find((e) => e.id === id);
  if (!found) throw new Error(`fixture: ${id}`);
  return found;
}

function planItem(id: string, sets: number, area: Area, isMain = false): WorkoutItem {
  const ex = lib(id);
  const [repsMin, repsMax] = isMain ? [6, 8] : ex.type === "compound" ? [8, 12] : [10, 15];
  const reasons: WorkoutItem["reasons"] = isMain ? [{ code: "main_lift" }] : [];
  reasons.push({ code: "area_deficit", area, deficit: 1 });
  reasons.push({ code: "days_since", area, days: null });
  reasons.push({ code: "prefill", kind: "first_time" });
  return {
    exerciseId: id,
    isMain,
    sets,
    repsMin,
    repsMax,
    durationS: null,
    costS: itemCostS(ex, sets),
    backoff: null,
    prefill: { weightKg: null, reps: repsMin, durationS: null, kind: "first_time" },
    reasons,
  };
}

/** Rule 8 fixture: 45 min, warm-up on, deficits chest .8, back .6, hamstrings .9, shoulders .5. */
function fixture(deficits: Partial<AreaNumbers> = {}): Workout {
  const startDeficits = Object.fromEntries(AREAS.map((a) => [a, 1])) as AreaNumbers;
  Object.assign(
    startDeficits,
    { chest: 0.8, back: 0.6, hamstrings: 0.9, shoulders: 0.5 },
    deficits,
  );
  const items = [
    planItem("bench-press", 4, "chest", true),
    planItem("barbell-row", 3, "back"),
    planItem("leg-curl", 3, "hamstrings"),
    planItem("lateral-raise", 3, "shoulders"),
  ];
  const itemsTotalS = items.reduce((s, i) => s + i.costS, 0);
  return {
    plan: { version: 1, mainLiftId: "bench-press", warmup: [], items, startDeficits },
    budgetMin: 45,
    warmupInBudget: true,
    energy: "normal",
    itemsTotalS,
    totalS: itemsTotalS + 180,
    unusedS: Math.max(0, 45 * 60 - 180 - itemsTotalS),
    sessionReasons: [],
  };
}

const setsOf = (items: readonly WorkoutItem[]): Array<[string, number]> =>
  items.map((i) => [i.exerciseId, i.sets]);

describe("rule 8 timeCheck", () => {
  it("rule-8 (AC29) the fixture costs 720 / 555 / 375 / 375", () => {
    expect(fixture().plan.items.map((i) => i.costS)).toEqual([720, 555, 375, 375]);
  });

  it("R8-E1 rule-8 (AC29) 105 s behind: shown, 2 minutes, Trim cuts lateral-raise to 2 sets", () => {
    const r = timeCheck(fixture(), { elapsedS: 1500, nextItemIndex: 1 });
    expect(r.behindS).toBe(105);
    expect(r.show).toBe(true);
    expect(r.minutesBehind).toBe(2);
    expect(r.projectedS).toBe(2805);
    expect(setsOf(r.trim.items)).toEqual([
      ["bench-press", 4],
      ["barbell-row", 3],
      ["leg-curl", 3],
      ["lateral-raise", 2],
    ]);
    expect(r.trim.items[3]?.costS).toBe(270);
    expect(r.trim.projectedS).toBe(2700);
    // Trimmed items keep their reasons (D-0040 §10).
    expect(r.trim.items[3]?.reasons).toEqual(fixture().plan.items[3]?.reasons);
  });

  it("R8-E2 rule-8 (AC30) 405 s behind: sets from lateral-raise, barbell-row, leg-curl, then lateral-raise goes", () => {
    const r = timeCheck(fixture(), { elapsedS: 1800, nextItemIndex: 1 });
    expect(r.behindS).toBe(405);
    expect(setsOf(r.trim.items)).toEqual([
      ["bench-press", 4],
      ["barbell-row", 2],
      ["leg-curl", 2],
    ]);
    expect(r.trim.items.map((i) => i.costS)).toEqual([720, 390, 270]);
    expect(r.trim.projectedS).toBe(2460);
    expect(setsOf(r.skipNext.items)).toEqual([
      ["bench-press", 4],
      ["leg-curl", 3],
      ["lateral-raise", 3],
    ]);
    expect(r.skipNext.projectedS).toBe(2550);
  });

  it("R8-E3 rule-8 (AC31) 59 s behind is not shown; 60 s is shown as 1 minute", () => {
    const below = timeCheck(fixture(), { elapsedS: 1454, nextItemIndex: 1 });
    expect(below.behindS).toBe(59);
    expect(below.show).toBe(false);
    expect(below.minutesBehind).toBeNull();
    const at = timeCheck(fixture(), { elapsedS: 1455, nextItemIndex: 1 });
    expect(at.behindS).toBe(60);
    expect(at.show).toBe(true);
    expect(at.minutesBehind).toBe(1);
  });

  it("rule-8 (AC32) a deficit tie trims the later item first", () => {
    const w = fixture({ back: 0.5, hamstrings: 0.5, shoulders: 0.9 });
    const r = timeCheck(w, { elapsedS: 1500, nextItemIndex: 1 });
    expect(setsOf(r.trim.items)).toEqual([
      ["bench-press", 4],
      ["barbell-row", 3],
      ["leg-curl", 2],
      ["lateral-raise", 3],
    ]);
    expect(r.trim.projectedS).toBe(2700);
  });

  it("rule-8 (AC33) the main lift is never cut by Trim; Skip next may remove it", () => {
    const w = fixture();
    const r = timeCheck(w, { elapsedS: 2000, nextItemIndex: 0 });
    expect(r.behindS).toBe(1325);
    expect(r.show).toBe(true);
    expect(r.trim.items).toEqual([w.plan.items[0]]);
    expect(r.trim.projectedS).toBe(2720);
    expect(r.skipNext.items).toEqual(w.plan.items.slice(1));
    expect(r.skipNext.projectedS).toBe(3305);
  });

  it("rule-8 (AC34) after the last item nothing is shown and both options equal the plan", () => {
    const w = fixture();
    const r = timeCheck(w, { elapsedS: 3000, nextItemIndex: 4 });
    expect(r.behindS).toBe(300);
    expect(r.show).toBe(false);
    expect(r.minutesBehind).toBeNull();
    expect(r.projectedS).toBe(3000);
    expect(r.trim.items).toEqual(w.plan.items);
    expect(r.skipNext.items).toEqual(w.plan.items);
    expect(r.trim.projectedS).toBe(3000);
    expect(r.skipNext.projectedS).toBe(3000);
  });

  it("rule-8 (AC34) trim and skipNext are computed even when not shown; started items stay", () => {
    const w = fixture();
    const r = timeCheck(w, { elapsedS: 100, nextItemIndex: 2 });
    expect(r.show).toBe(false);
    expect(r.behindS).toBeLessThan(0);
    expect(r.trim.items).toEqual(w.plan.items);
    expect(setsOf(r.skipNext.items)).toEqual([
      ["bench-press", 4],
      ["barbell-row", 3],
      ["lateral-raise", 3],
    ]);
    // A started accessory is never trimmed.
    const late = timeCheck(w, { elapsedS: 2600, nextItemIndex: 3 });
    expect(late.trim.items.slice(0, 3)).toEqual(w.plan.items.slice(0, 3));
  });

  it("rule-8 (AC35) invalid progress throws RangeError", () => {
    const w = fixture();
    for (const p of [
      { elapsedS: -1, nextItemIndex: 1 },
      { elapsedS: 12.5, nextItemIndex: 1 },
      { elapsedS: 1500, nextItemIndex: -1 },
      { elapsedS: 1500, nextItemIndex: 5 },
      { elapsedS: 1500, nextItemIndex: 1.5 },
    ]) {
      expect(() => timeCheck(w, p), JSON.stringify(p)).toThrow(RangeError);
    }
  });

  it("rule-8 (AC35) pure on deep-frozen inputs, with the D-0037 §8 shape", () => {
    const w = deepFreeze(fixture());
    const progress = deepFreeze({ elapsedS: 1800, nextItemIndex: 1 });
    const before = structuredClone(w);
    const a: TimeCheckResult = timeCheck(w, progress);
    const b = timeCheck(w, progress);
    expect(b).toEqual(a);
    expect(w).toEqual(before);
    expect(progress).toEqual({ elapsedS: 1800, nextItemIndex: 1 });
    expect(Object.keys(a).sort()).toEqual(
      ["behindS", "minutesBehind", "projectedS", "show", "skipNext", "trim"].sort(),
    );
    expect(Object.keys(a.trim).sort()).toEqual(["items", "projectedS"]);
    expect(Object.keys(a.skipNext).sort()).toEqual(["items", "projectedS"]);
    expect(Number.isInteger(a.behindS)).toBe(true);
    // The result doesn't alias the input: changing it leaves the plan alone.
    (a.trim.items[1] as WorkoutItem).sets = 1;
    expect(w.plan.items[1]?.sets).toBe(3);
  });
});
