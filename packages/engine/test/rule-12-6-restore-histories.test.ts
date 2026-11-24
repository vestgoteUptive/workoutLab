// T-1022 UF-08.2: rules 12.6 and 12.7 `ctx.restore` over the simulated histories (D-0290, AC9).
import { describe, expect, it } from "vitest";
import {
  addArea,
  areaCandidates,
  areaGroups,
  availableS,
  homeAreaOf,
  orderItems,
  removeArea,
  setMainLift,
  suggest,
  type HistorySet,
  type Workout,
  type WorkoutItem,
} from "@workoutlab/engine";
import { F_PROFILE, F_TARGETS, LIBRARY, NOW, TZ, deepFreeze, input } from "./fixtures/common.js";
import { SIMULATED_HISTORIES } from "./fixtures/histories.js";
import { ctxOf } from "./fixtures/area-edits.js";

const HISTORIES: ReadonlyArray<readonly [string, readonly HistorySet[]]> = [
  ["zero history", []],
  ["balanced", SIMULATED_HISTORIES.balanced],
  ["all-chest-no-legs", SIMULATED_HISTORIES.allChestNoLegs],
  ["returning after 10 days off", SIMULATED_HISTORIES.returningAfter10Days],
];
const BUDGETS = [15, 20, 30, 45, 60, 75, 90, 105, 120];
const ENERGIES = ["low", "normal", "high"] as const;

const overBudget = (w: Workout): boolean =>
  w.itemsTotalS > availableS(w.budgetMin, w.warmupInBudget);
const itemsOf = (w: Workout, area: string): WorkoutItem[] =>
  w.plan.items.filter((i) => homeAreaOf(i) === area);

describe("T-1022 rule-12-6 restore over simulated histories (AC9)", () => {
  it.each(HISTORIES)("T-1022 AC9 %s: remove then add back round-trips", (_n, history) => {
    let rounds = 0;
    for (const budgetMin of BUDGETS) {
      for (const energy of ENERGIES) {
        // UF-08.2 holds the plan in rule 7.6 order, so the round trip is exact for that plan.
        const w = deepFreeze(
          orderItems(
            suggest(history, F_TARGETS, F_PROFILE, LIBRARY, input({ budgetMin, energy }), NOW, TZ),
            LIBRARY,
          ),
        );
        const ctx = ctxOf({ history });
        for (const g of areaGroups(w)) {
          const removed = itemsOf(w, g.area);
          const gone = removeArea(w, g.area);
          const back = addArea(gone, g.area, { ...ctx, restore: removed });
          const got = back as Workout;
          // Same plan; the order is rule 7.6's, which can break a tie by position differently
          // once the item has been re-appended (D-0290 §5, details corrected in the build).
          const byId = (x: Workout): WorkoutItem[] =>
            [...x.plan.items].sort((a, b) => a.exerciseId.localeCompare(b.exerciseId));
          expect(byId(got)).toStrictEqual(byId(w));
          expect(orderItems(got, LIBRARY)).toStrictEqual(got);
          expect({ ...got, plan: { ...got.plan, items: [] } }).toStrictEqual({
            ...w,
            plan: { ...w.plan, items: [] },
            sessionReasons: got.sessionReasons,
          });
          expect(got.sessionReasons.map((r) => JSON.stringify(r)).sort()).toStrictEqual(
            w.sessionReasons.map((r) => JSON.stringify(r)).sort(),
          );
          expect(addArea(gone, g.area, { ...ctx, restore: removed })).toStrictEqual(back);
          expect(overBudget(got) && !overBudget(w)).toBe(false);
          const c = areaCandidates(gone, { ...ctx, restore: removed }).find(
            (x) => x.area === g.area,
          );
          expect(c?.available).toBe(true);
          rounds += 1;
        }
      }
    }
    expect(rounds).toBeGreaterThan(0);
  });

  it.each(HISTORIES)(
    "T-1022 AC9 %s: a main-lift change in between restores an accessory, never over budget",
    (_n, history) => {
      let demoted = 0;
      for (const budgetMin of BUDGETS) {
        for (const energy of ENERGIES) {
          const w = suggest(
            history,
            F_TARGETS,
            F_PROFILE,
            LIBRARY,
            input({ budgetMin, energy }),
            NOW,
            TZ,
          );
          const main = w.plan.items.find((i) => i.isMain);
          if (main === undefined) continue;
          const area = homeAreaOf(main);
          if (area === null) continue;
          const ctx = ctxOf({ history });
          const gone = removeArea(w, area);
          // "Start with this" elsewhere: another compound becomes the main lift.
          const other = LIBRARY.find(
            (e) => e.kind === "exercise" && e.type === "compound" && e.id !== main.exerciseId,
          );
          const withOther = other === undefined ? gone : setMainLift(gone, other.id, ctx);
          if ("refused" in withOther) continue;
          const back = addArea(withOther, area, { ...ctx, restore: [main] });
          if ("refused" in back) continue;
          expect(overBudget(back)).toBe(
            withOther.itemsTotalS > availableS(budgetMin, w.warmupInBudget),
          );
          expect(back.plan.items.filter((i) => i.isMain)).toHaveLength(1);
          const restored = back.plan.items.find((i) => i.exerciseId === main.exerciseId);
          if (restored !== undefined) {
            expect(restored.isMain).toBe(false);
            expect(restored.sets).toBeLessThanOrEqual(3);
            expect(back.plan.mainLiftId).toBe(other?.id);
            demoted += 1;
          }
        }
      }
      // Non-vacuity (T-1022 review): the grid must reach a demoted restore at least once.
      expect(demoted).toBeGreaterThan(0);
    },
  );
});
