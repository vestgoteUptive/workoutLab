// T-0994 UF-08.2 UF-08.4: rules 7.6 and 12.4 over the simulated 14-day histories (D-0275 §9).
// AC8 and AC10.
import { describe, expect, it } from "vitest";
import { areaGroups, orderItems, suggest, type HistorySet } from "@workoutlab/engine";
import { F_PROFILE, F_TARGETS, LIBRARY, NOW, TZ, deepFreeze, input } from "./fixtures/common.js";
import { SIMULATED_HISTORIES } from "./fixtures/histories.js";

const CASES: ReadonlyArray<readonly [string, readonly HistorySet[], number]> = [
  ["zero history", [], 30],
  ["balanced", SIMULATED_HISTORIES.balanced, 30],
  ["all-chest-no-legs", SIMULATED_HISTORIES.allChestNoLegs, 30],
  ["returning after 10 days off", SIMULATED_HISTORIES.returningAfter10Days, 30],
  ["15-minute budget", SIMULATED_HISTORIES.balanced, 15],
  ["90-minute budget", SIMULATED_HISTORIES.balanced, 90],
  ["offline-merged", SIMULATED_HISTORIES.offlineMerged, 30],
];

describe("rule-7-6 over the simulated histories (AC8)", () => {
  it.each(CASES)(
    "rule-7-6 %s: permutation, totals and main lift unchanged, idempotent",
    (_n, history, budgetMin) => {
      for (const energy of ["low", "normal", "high"] as const) {
        const w = deepFreeze(
          suggest(history, F_TARGETS, F_PROFILE, LIBRARY, input({ budgetMin, energy }), NOW, TZ),
        );
        const o = orderItems(w, LIBRARY);
        const key = (i: { exerciseId: string }) => i.exerciseId;
        expect(o.plan.items.map(key).sort()).toEqual(w.plan.items.map(key).sort());
        expect(o.plan.items.reduce((s, i) => s + i.costS, 0)).toBe(w.itemsTotalS);
        expect([o.itemsTotalS, o.totalS, o.unusedS]).toEqual([w.itemsTotalS, w.totalS, w.unusedS]);
        expect(o.plan.mainLiftId).toBe(w.plan.mainLiftId);
        expect(o.plan.warmup).toStrictEqual(w.plan.warmup);
        expect(o.sessionReasons).toStrictEqual(w.sessionReasons);
        expect(orderItems(o, LIBRARY)).toStrictEqual(o);
        if (w.plan.mainLiftId !== null) expect(o.plan.items[0]?.exerciseId).toBe(w.plan.mainLiftId);
        const groups = areaGroups(o);
        expect(groups.reduce((s, g) => s + g.sets, 0)).toBe(
          w.plan.items.reduce((s, i) => s + i.sets, 0),
        );
        expect(groups.reduce((s, g) => s + g.costS, 0)).toBe(w.itemsTotalS);
        expect(groups.reduce((s, g) => s + g.itemIds.length, 0)).toBe(w.plan.items.length);
      }
    },
  );

  it("rule-7-6 the 90-minute plan keeps at most 8 items", () => {
    const w = suggest(
      SIMULATED_HISTORIES.balanced,
      F_TARGETS,
      F_PROFILE,
      LIBRARY,
      input({ budgetMin: 90 }),
      NOW,
      TZ,
    );
    expect(orderItems(w, LIBRARY).plan.items.length).toBeLessThanOrEqual(8);
    expect(w.plan.items.length).toBeGreaterThan(3);
  });
});

describe("rule-7-6 (AC10) suggest is unchanged", () => {
  it("rule-7-6 calling orderItems or areaGroups never changes suggest output", () => {
    for (const [, history, budgetMin] of CASES) {
      const args = [history, F_TARGETS, F_PROFILE, LIBRARY, input({ budgetMin }), NOW, TZ] as const;
      const before = JSON.stringify(suggest(...args));
      const w = suggest(...args);
      orderItems(w, LIBRARY);
      areaGroups(w);
      expect(JSON.stringify(suggest(...args))).toBe(before);
      expect(JSON.stringify(w)).toBe(before);
    }
  });
});
