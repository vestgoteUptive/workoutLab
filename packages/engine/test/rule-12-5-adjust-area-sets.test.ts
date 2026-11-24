// T-0995 UF-08.2 UF-08.6: rule 12.5 `adjustAreaSets` (D-0275 §3). AC1 to AC5 and AC10.
import { describe, expect, it } from "vitest";
import {
  adjustAreaSets,
  removeItem,
  type Workout,
  type WorkoutItem,
  type AdjustRefusal,
  type AreaRefused,
} from "@workoutlab/engine";
import { LIBRARY, deepFreeze } from "./fixtures/common.js";
import { ctxOf, fixtureW45, sets, setS } from "./fixtures/area-edits.js";
import { mkItem, mkWorkout } from "./fixtures/order-groups.js";
import { L1_ONE } from "./fixtures/one-side.js";

function ok(r: Workout | AreaRefused<AdjustRefusal>): Workout {
  if ("refused" in r) throw new Error(`refused: ${r.refused}`);
  return r;
}
const refusal = (r: Workout | AreaRefused<AdjustRefusal>): string | null =>
  "refused" in r ? r.refused : null;

/** A workout at W45's frame (available 2520) with the given items. */
function plan(items: WorkoutItem[], main: string | null = null): Workout {
  const w = mkWorkout(items, main);
  return { ...w, budgetMin: 45, unusedS: Math.max(0, 2520 - w.itemsTotalS) };
}

describe("rule-12-5 adjustAreaSets +1 (AC1)", () => {
  it("rule-12-5 R12-E31 W45: back has no room (3 sets), so a second back item at 2 sets is added", () => {
    const w = deepFreeze(fixtureW45());
    const r = ok(adjustAreaSets(w, "back", 1, ctxOf()));
    expect(sets(r)).toEqual([
      ["bench-press", 4],
      ["inverted-row", 3],
      ["leg-extension", 2],
      ["barbell-row", 2],
    ]);
    const added = r.plan.items[3] as WorkoutItem;
    expect(added.isMain).toBe(false);
    expect(added.costS).toBe(390);
    expect(r.itemsTotalS).toBe(1545 + 390);
    expect(r.unusedS).toBe(2520 - 1935);
    expect(r.plan.mainLiftId).toBe("bench-press");
    // The first three items are untouched.
    expect(r.plan.items.slice(0, 3)).toStrictEqual(w.plan.items);
  });

  it("rule-12-5 R12-E32 quads with leg-extension x 2: +1 makes it x 3 and costS rises by one set cost", () => {
    const w = fixtureW45();
    const r = ok(adjustAreaSets(deepFreeze(w), "quads", 1, ctxOf()));
    expect(sets(r)[2]).toEqual(["leg-extension", 3]);
    const before = w.plan.items[2] as WorkoutItem;
    const after = r.plan.items[2] as WorkoutItem;
    expect(after.costS - before.costS).toBe(setS("leg-extension"));
    expect(after.costS).toBe(375);
    expect(r.itemsTotalS - w.itemsTotalS).toBe(105);
    expect(r.totalS).toBe(r.itemsTotalS + 180);
    expect(r.unusedS).toBe(w.unusedS - 105);
    expect(r.plan.items).toHaveLength(3);
  });

  it("rule-12-5 the first item with room gets the set, in item order", () => {
    const w = plan([mkItem("barbell-row", 3), mkItem("inverted-row", 2)]);
    expect(sets(ok(adjustAreaSets(w, "back", 1, ctxOf())))).toEqual([
      ["barbell-row", 3],
      ["inverted-row", 3],
    ]);
    const w2 = plan([mkItem("barbell-row", 2), mkItem("inverted-row", 2)]);
    expect(sets(ok(adjustAreaSets(w2, "back", 1, ctxOf())))).toEqual([
      ["barbell-row", 3],
      ["inverted-row", 2],
    ]);
  });
});

describe("rule-12-5 adjustAreaSets refusals (AC2)", () => {
  it("rule-12-5 R12-E33 an area with 2 full items is refused area_full", () => {
    const w = plan([
      mkItem("barbell-row", 3),
      mkItem("inverted-row", 3),
      mkItem("leg-extension", 2),
    ]);
    const r = adjustAreaSets(deepFreeze(w), "back", 1, ctxOf());
    expect(r).toStrictEqual({ refused: "area_full" });
  });

  it("rule-12-5 an 8-item plan with a full one-item area is refused area_full", () => {
    const ids = [
      "bench-press",
      "barbell-row",
      "overhead-press",
      "biceps-curl",
      "dead-bug",
      "hip-thrust",
      "leg-extension",
      "leg-curl",
    ];
    const items = ids.map((id, k) => mkItem(id, k === 0 ? 4 : 3, k === 0));
    const w = plan(items, "bench-press");
    expect(w.plan.items).toHaveLength(8);
    expect(adjustAreaSets(w, "chest", 1, ctxOf())).toStrictEqual({ refused: "area_full" });
    // But a set on an item with room still works at 8 items (arms at 2 sets, room to spare).
    const roomy = plan(
      items.map((it) => (it.exerciseId === "biceps-curl" ? mkItem("biceps-curl", 2) : it)),
      "bench-press",
    );
    const r = ok(adjustAreaSets({ ...roomy, budgetMin: 120 }, "arms", 1, ctxOf()));
    expect(r.plan.items).toHaveLength(8);
    expect(r.plan.items.find((it) => it.exerciseId === "biceps-curl")?.sets).toBe(3);
  });

  it("rule-12-5 R12-E34 a +1 that fits succeeds; with unusedS below one set cost it is refused time", () => {
    const w = fixtureW45();
    expect(refusal(adjustAreaSets(w, "quads", 1, ctxOf()))).toBeNull();
    // 105 s per leg-extension set: leave 104 s.
    const tight = plan([
      mkItem("bench-press", 4, true),
      mkItem("inverted-row", 3),
      mkItem("leg-extension", 2),
    ]);
    // available = budgetMin x 60 - 180, so this budget leaves exactly n seconds.
    const left = (n: number): Workout => ({
      ...tight,
      budgetMin: (tight.itemsTotalS + n + 180) / 60,
    });
    expect(refusal(adjustAreaSets(left(105), "quads", 1, ctxOf()))).toBeNull();
    expect(adjustAreaSets(left(104), "quads", 1, ctxOf())).toStrictEqual({ refused: "time" });
    expect(adjustAreaSets(left(0), "quads", 1, ctxOf())).toStrictEqual({ refused: "time" });
  });

  it("rule-12-5 a plan already over budget refuses +1 for time", () => {
    const w = {
      ...plan([mkItem("bench-press", 4, true), mkItem("leg-extension", 2)]),
      budgetMin: 10,
    };
    expect(w.itemsTotalS).toBeGreaterThan(10 * 60 - 180);
    expect(adjustAreaSets(w, "quads", 1, ctxOf())).toStrictEqual({ refused: "time" });
    expect(adjustAreaSets(w, "chest", 1, ctxOf())).toStrictEqual({ refused: "time" });
  });

  it("rule-12-5 check order: a structural RangeError beats area_full and time", () => {
    const w = plan([mkItem("barbell-row", 3), mkItem("inverted-row", 3)]);
    expect(() => adjustAreaSets(w, "shoulders", 1, ctxOf())).toThrow(RangeError);
    expect(() => adjustAreaSets(w, "nowhere" as never, 1, ctxOf())).toThrow(RangeError);
    expect(() => adjustAreaSets(w, "back", 0 as never, ctxOf())).toThrow(RangeError);
    expect(() => adjustAreaSets(w, "back", 2 as never, ctxOf())).toThrow(RangeError);
    expect(() => adjustAreaSets(w, "back", 1, ctxOf({ now: "2026-09-27T12:00:00" }))).toThrow(
      RangeError,
    );
    expect(() =>
      adjustAreaSets(
        w,
        "back",
        1,
        ctxOf({ library: LIBRARY.filter((e) => e.id !== "barbell-row") }),
      ),
    ).toThrow(RangeError);
    // area_full is reported before time, even when time is also short.
    const full = { ...w, budgetMin: 5 };
    expect(adjustAreaSets(full, "back", 1, ctxOf())).toStrictEqual({ refused: "area_full" });
  });
});

describe("rule-12-5 main lift caps (AC3)", () => {
  it("rule-12-5 R12-E35 the main lift at 3 sets goes to 4", () => {
    const w = plan([mkItem("bench-press", 3, true)], "bench-press");
    expect(sets(ok(adjustAreaSets(w, "chest", 1, ctxOf())))).toEqual([["bench-press", 4]]);
  });

  it("rule-12-5 R12-E36 at 4 and no second item, +1 adds a second item at 2; the area holds 7 at most", () => {
    const w = fixtureW45();
    const a = ok(adjustAreaSets(w, "chest", 1, ctxOf()));
    expect(sets(a).slice(0, 1)).toEqual([["bench-press", 4]]);
    expect(sets(a)[3]).toEqual(["db-bench-press", 2]);
    expect((a.plan.items[3] as WorkoutItem).isMain).toBe(false);
    const b = ok(adjustAreaSets(a, "chest", 1, ctxOf()));
    expect(sets(b)[3]).toEqual(["db-bench-press", 3]);
    expect(adjustAreaSets(b, "chest", 1, ctxOf())).toStrictEqual({ refused: "area_full" });
    const chest = b.plan.items.filter((i) => i.exerciseId.includes("bench"));
    expect(chest.reduce((s, i) => s + i.sets, 0)).toBe(7);
  });

  it("rule-12-5 R12-E37 an area without the main lift holds 6 (3 + 3)", () => {
    let w = fixtureW45();
    for (let k = 0; k < 4; k++) {
      const r = adjustAreaSets(w, "back", 1, ctxOf());
      if ("refused" in r) break;
      w = r;
    }
    expect(sets(w).filter(([id]) => id === "inverted-row" || id === "barbell-row")).toEqual([
      ["inverted-row", 3],
      ["barbell-row", 3],
    ]);
    expect(adjustAreaSets(w, "back", 1, ctxOf())).toStrictEqual({ refused: "area_full" });
  });
});

describe("rule-12-5 adjustAreaSets -1 (AC4, AC5)", () => {
  it("rule-12-5 R12-E38 one item at 3 sets goes to 2 and the freed time stays unused", () => {
    const w = fixtureW45();
    const r = ok(adjustAreaSets(deepFreeze(w), "back", -1, ctxOf()));
    expect(sets(r)[1]).toEqual(["inverted-row", 2]);
    expect(r.plan.items[1]?.costS).toBe(390);
    expect(r.unusedS).toBe(1140);
    expect(r.unusedS).toBe(w.unusedS + setS("inverted-row"));
    expect(r.plan.items).toHaveLength(3);
  });

  it("rule-12-5 R12-E39 two items of 3 and 2 sets: -1 removes the second, the first stays at 3", () => {
    const w = plan([
      mkItem("barbell-row", 3),
      mkItem("inverted-row", 2),
      mkItem("leg-extension", 2),
    ]);
    const r = ok(adjustAreaSets(w, "back", -1, ctxOf()));
    expect(sets(r)).toEqual([
      ["barbell-row", 3],
      ["leg-extension", 2],
    ]);
    expect(r).toStrictEqual(removeItem(w, "inverted-row"));
  });

  it("rule-12-5 R12-E40 two items of 3 and 3 give 3 and 2", () => {
    const w = plan([mkItem("barbell-row", 3), mkItem("inverted-row", 3)]);
    expect(sets(ok(adjustAreaSets(w, "back", -1, ctxOf())))).toEqual([
      ["barbell-row", 3],
      ["inverted-row", 2],
    ]);
  });

  it("rule-12-5 R12-E41 one item at 2 sets: -1 removes the area, equal to removeItem", () => {
    const w = fixtureW45();
    const r = ok(adjustAreaSets(w, "quads", -1, ctxOf()));
    expect(r).toStrictEqual(removeItem(w, "leg-extension"));
    expect(r.unusedS).toBe(w.unusedS + 270);
  });

  it("rule-12-5 R12-E42 -1 on the main lift area down to removal leaves mainLiftId null, nobody promoted", () => {
    let w: Workout = fixtureW45();
    const seen: number[] = [];
    for (let k = 0; k < 3; k++) {
      w = ok(adjustAreaSets(w, "chest", -1, ctxOf()));
      seen.push(w.plan.items.find((i) => i.exerciseId === "bench-press")?.sets ?? 0);
    }
    expect(seen).toEqual([3, 2, 0]);
    expect(w.plan.mainLiftId).toBeNull();
    expect(w.plan.items.every((i) => !i.isMain)).toBe(true);
    expect(sets(w)).toEqual([
      ["inverted-row", 3],
      ["leg-extension", 2],
    ]);
  });

  it("rule-12-5 -1 on an area not in the plan is a RangeError", () => {
    expect(() => adjustAreaSets(fixtureW45(), "arms", -1, ctxOf())).toThrow(RangeError);
  });

  it("rule-12-5 a back-off set stays: -1 on a main lift keeps backoff and its cost", () => {
    const base = mkItem("bench-press", 4, true);
    const item: WorkoutItem = {
      ...base,
      backoff: { weightKg: 50, reps: 6 },
      costS: base.costS + setS("bench-press"),
    };
    const w = plan([item], "bench-press");
    const r = ok(adjustAreaSets(w, "chest", -1, ctxOf()));
    expect(r.plan.items[0]?.sets).toBe(3);
    expect(r.plan.items[0]?.backoff).toEqual({ weightKg: 50, reps: 6 });
    expect(r.plan.items[0]?.costS).toBe(item.costS - setS("bench-press"));
  });
});

describe("rule-12-5 one side at a time (AC10, D-0268)", () => {
  it("rule-12-5 R12-E43 a flagged exercise adds two sides of work per set", () => {
    const base = mkItem("db-row", 2);
    const flaggedCost = 2 * (90 + 120) + 60; // 2 sets, two sides each
    const item: WorkoutItem = { ...base, costS: flaggedCost };
    const w = plan([item]);
    const ctx = ctxOf({ library: L1_ONE });
    expect(setS("db-row", L1_ONE)).toBe(210);
    expect(setS("db-row")).toBe(165);
    const r = ok(adjustAreaSets(w, "back", 1, ctx));
    expect(r.plan.items[0]?.sets).toBe(3);
    expect(r.plan.items[0]?.costS).toBe(flaggedCost + 210);
    const down = ok(adjustAreaSets(r, "back", -1, ctx));
    expect(down.plan.items[0]?.costS).toBe(flaggedCost);
    // A timed flagged hold: two sides of its planned duration.
    const plank = { ...mkItem("plank", 2), durationS: 60, costS: 2 * (120 + 60) + 60 };
    const wp = plan([plank]);
    const rp = ok(adjustAreaSets(wp, "core", 1, ctxOf({ library: L1_ONE })));
    expect(rp.plan.items[0]?.costS).toBe(plank.costS + 180);
  });

  it("rule-12-5 the flagged +1 time check uses the doubled cost", () => {
    const item: WorkoutItem = { ...mkItem("db-row", 2), costS: 2 * 210 + 60 };
    const w = plan([item]);
    // 209 s left: fits an unflagged set (165 s) but not a flagged one (210 s).
    const tight = { ...w, budgetMin: (item.costS + 209 + 180) / 60 };
    expect(refusal(adjustAreaSets(tight, "back", 1, ctxOf()))).toBeNull();
    expect(adjustAreaSets(tight, "back", 1, ctxOf({ library: L1_ONE }))).toStrictEqual({
      refused: "time",
    });
  });
});
