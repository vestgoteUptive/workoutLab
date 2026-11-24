// T-0995 UF-08.2 UF-08.6: AC12 (suggest unchanged, no clock or entropy in the new file) and the
// T-0994 review follow-up (an item with no `area_deficit` reason in rule 12.4 and rule 7.6).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  addArea,
  adjustAreaSets,
  areaCandidates,
  areaGroups,
  orderItems,
  removeArea,
  suggest,
  type Workout,
  type WorkoutItem,
} from "@workoutlab/engine";
import { F_PROFILE, F_TARGETS, LIBRARY, NOW, TZ, deepFreeze, input } from "./fixtures/common.js";
import { SIMULATED_HISTORIES } from "./fixtures/histories.js";
import { ctxOf } from "./fixtures/area-edits.js";
import { mkItem, mkWorkout } from "./fixtures/order-groups.js";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

describe("rule-12-5 (AC12) suggest is unchanged and the new file is pure", () => {
  it("rule-12-5 calling the area edits never changes suggest output (byte-identical)", () => {
    const cases = [
      [[], 30],
      [SIMULATED_HISTORIES.balanced, 45],
      [SIMULATED_HISTORIES.allChestNoLegs, 15],
      [SIMULATED_HISTORIES.returningAfter10Days, 90],
    ] as const;
    for (const [history, budgetMin] of cases) {
      const args = [history, F_TARGETS, F_PROFILE, LIBRARY, input({ budgetMin }), NOW, TZ] as const;
      const before = JSON.stringify(suggest(...args));
      const w = suggest(...args);
      const ctx = ctxOf({ history });
      for (const g of areaGroups(w)) {
        adjustAreaSets(w, g.area, 1, ctx);
        adjustAreaSets(w, g.area, -1, ctx);
        removeArea(w, g.area);
      }
      for (const c of areaCandidates(w, ctx)) addArea(w, c.area, ctx);
      expect(JSON.stringify(w)).toBe(before);
      expect(JSON.stringify(suggest(...args))).toBe(before);
    }
  });

  it("rule-12-5 suggest's module never imports the area edits", () => {
    for (const f of ["session.ts", "swaps.ts", "balance.ts", "apply-swap.ts", "insert-item.ts"]) {
      expect(readFileSync(path.join(SRC, f), "utf8")).not.toMatch(/area-edits/);
    }
  });

  it("rule-12-5 area-edits.ts has no Date.now(), new Date() or Math.random()", () => {
    const code = readFileSync(path.join(SRC, "area-edits.ts"), "utf8");
    expect(code).not.toMatch(/Date\.now\s*\(/);
    expect(code).not.toMatch(/new\s+Date\s*\(/);
    expect(code).not.toMatch(/Math\.random\s*\(/);
  });
});

/** An item with no `area_deficit` reason (a plan from before rule 10, or a hand-built one). */
const noHome = (id: string, sets = 3): WorkoutItem => ({
  ...mkItem(id, sets),
  reasons: [{ code: "prefill", kind: "first_time" }],
});

describe("rule-12-4 and rule-7-6 an item with no area_deficit reason (T-0994 review)", () => {
  it("rule-12-4 areaGroups skips it: no group, sums cover only the grouped items", () => {
    const w = mkWorkout(
      [mkItem("bench-press", 4, true), noHome("db-row"), mkItem("leg-extension", 2)],
      "bench-press",
    );
    const g = areaGroups(deepFreeze(w));
    expect(g).toStrictEqual([
      { area: "chest", itemIds: ["bench-press"], sets: 4, costS: 720 },
      { area: "quads", itemIds: ["leg-extension"], sets: 2, costS: 270 },
    ]);
    expect(areaGroups(mkWorkout([noHome("db-row")]))).toStrictEqual([]);
  });

  it("rule-7-6 orderItems gives it area null: two of them are never 'the same area'", () => {
    // x1, x2 have no home area; c1 is chest. After x1, x2 (same group, original index 1) must
    // still come before c1; if null counted as "same area" c1 would jump ahead.
    const w: Workout = mkWorkout([
      noHome("db-row"),
      noHome("db-bench-press"),
      mkItem("push-up", 3),
    ]);
    const o = orderItems(deepFreeze(w), LIBRARY);
    expect(o.plan.items.map((i) => i.exerciseId)).toEqual(["db-row", "db-bench-press", "push-up"]);
    expect(orderItems(o, LIBRARY)).toStrictEqual(o);
  });

  it("rule-7-6 a null-area item does not block a real area from alternating", () => {
    // chest, then null, then chest: the null item is not the previous 'chest', so the second
    // chest item may follow the null item immediately.
    const w = mkWorkout([
      mkItem("db-bench-press", 3),
      noHome("lat-pulldown"),
      mkItem("push-up", 3),
    ]);
    const ids = orderItems(w, LIBRARY).plan.items.map((i) => i.exerciseId);
    expect(ids).toEqual(["db-bench-press", "lat-pulldown", "push-up"]);
  });
});
