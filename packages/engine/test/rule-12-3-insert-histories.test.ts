// T-0945 UF-09.10: rule 12.3 `insertItem` with rule 8 `timeLeftS` over the simulated 14-day
// histories (D-0244 Consequences, D-0246 §13). AC20–AC23.
import { describe, expect, it } from "vitest";
import {
  itemCostS,
  removeItem,
  suggest,
  timeLeftS,
  type Energy,
  type HistorySet,
  type InsertResult,
  type TimeLeftProgress,
  type Workout,
  type WorkoutItem,
} from "@workoutlab/engine";
import { F_PROFILE, F_TARGETS, LIBRARY, NOW, TZ, input } from "./fixtures/common.js";
import { SIMULATED_HISTORIES } from "./fixtures/histories.js";
import { insert, notInPlan, progress, progressAfterInsert } from "./fixtures/insert-p.js";

const HISTORIES: ReadonlyArray<readonly [string, readonly HistorySet[]]> = [
  ["zero history", []],
  ["balanced", SIMULATED_HISTORIES.balanced],
  ["allChestNoLegs", SIMULATED_HISTORIES.allChestNoLegs],
  ["returningAfter10Days", SIMULATED_HISTORIES.returningAfter10Days],
  ["offlineMerged", SIMULATED_HISTORIES.offlineMerged],
];

function plan(history: readonly HistorySet[], budgetMin: number, energy: Energy = "normal") {
  return suggest(history, F_TARGETS, F_PROFILE, LIBRARY, input({ budgetMin, energy }), NOW, TZ);
}

/** The states an add can happen in: at the start (warm-up not begun) and ahead after item 0. */
function states(w: Workout): Array<[string, TimeLeftProgress]> {
  const first = w.plan.items[0] as WorkoutItem;
  const setsDone = w.plan.items.map((it, i) => (i === 0 ? it.sets : 0));
  // 600 s ahead of plan after the warm-up and item 0.
  const elapsedS = Math.max(0, 180 + first.costS - 600);
  return [
    ["at the start", progress(w, { warmupLeftS: 180 })],
    ["after item 0, 600 s ahead", progress(w, { elapsedS, setsDone })],
  ];
}

/**
 * A "valid insert" (AC20): one more item at `at`, the others unchanged, ≤ 8 items, unique ids,
 * an accessory of 3 or 2 sets that fits `leftS`, totals recomputed, and the time left after it
 * equal to `leftS − costS`.
 */
function expectValid(
  r: InsertResult,
  w: Workout,
  id: string,
  at: number,
  leftS: number,
  p: TimeLeftProgress,
): void {
  if (r.workout === undefined) throw new Error(`not an insert: ${JSON.stringify(r)}`);
  const items = r.workout.plan.items;
  const added = items[at] as WorkoutItem;
  expect(items).toHaveLength(w.plan.items.length + 1);
  expect(items.length).toBeLessThanOrEqual(8);
  expect(new Set(items.map((i) => i.exerciseId)).size).toBe(items.length);
  expect(items.filter((_, i) => i !== at)).toStrictEqual(w.plan.items);
  expect([added.exerciseId, added.isMain, added.backoff]).toEqual([id, false, null]);
  expect(w.energy === "low" ? [2] : [3, 2]).toContain(added.sets);
  expect(r.sets).toBe(added.sets);
  expect(added.costS).toBeLessThanOrEqual(leftS);
  expect(r.workout.itemsTotalS).toBe(w.itemsTotalS + added.costS);
  expect(r.workout.totalS).toBe(r.workout.itemsTotalS + 180);
  expect(r.workout.plan.warmup).toStrictEqual(w.plan.warmup);
  expect(r.workout.sessionReasons).toStrictEqual(w.sessionReasons);
  expect(timeLeftS(r.workout, progressAfterInsert(p, at))).toBe(leftS - added.costS);
}

describe("rule 12.3 over the simulated histories at 45 min (AC20)", () => {
  it.each(HISTORIES.slice(0, 3))(
    "rule-12.3 (AC20) %s: every L1 exercise not in the plan, at index 1, is a valid insert or refused for time",
    (_name, history) => {
      let valid = 0;
      let refused = 0;
      for (const energy of ["low", "normal", "high"] as const) {
        const w = plan(history, 45, energy);
        expect(w.plan.items.length).toBeLessThan(8);
        for (const [state, p] of states(w)) {
          const leftS = timeLeftS(w, p);
          for (const e of notInPlan(w)) {
            const r = insert(w, e.id, 1, leftS, history);
            if (r.refused === "time") {
              // Refused only when even 2 sets don't fit.
              // (No simulated history logs a timed set, so the planned duration is the default.)
              expect(leftS, `${energy} ${state} ${e.id}`).toBeLessThan(itemCostS(e, 2));
              refused++;
            } else {
              expectValid(r, w, e.id, 1, leftS, p);
              valid++;
            }
          }
        }
      }
      // Both outcomes occur: at the start of a normal 45-min plan nothing fits, and
      // Low energy (480 s unused) or 600 s ahead leaves room.
      expect(valid).toBeGreaterThan(0);
      expect(refused).toBeGreaterThan(0);
    },
  );
});

describe("rule 12.3 returning after 10 days off (AC21)", () => {
  it("rule-12.3 (AC21) romanian-deadlift, last trained 2026-09-17, gets hold_after_break and days_since 10", () => {
    const history = SIMULATED_HISTORIES.returningAfter10Days;
    const w = plan(history, 45, "low");
    expect(w.plan.items.map((i) => i.exerciseId)).not.toContain("romanian-deadlift");
    const p = progress(w, { warmupLeftS: 180 });
    const leftS = timeLeftS(w, p);
    const r = insert(w, "romanian-deadlift", 1, leftS, history);
    expectValid(r, w, "romanian-deadlift", 1, leftS, p);
    const added = r.workout?.plan.items[1] as WorkoutItem;
    // Rule 14 step 3: gap 10, W 50 at the 8–12 slot's low reps.
    expect(added.prefill).toStrictEqual({
      weightKg: 50,
      reps: 8,
      durationS: null,
      kind: "hold_after_break",
    });
    expect(added.reasons).toContainEqual({ code: "days_since", area: "hamstrings", days: 10 });
  });

  it("rule-12.3 (AC21) every insert over returningAfter10Days is valid or refused for time", () => {
    const history = SIMULATED_HISTORIES.returningAfter10Days;
    for (const energy of ["low", "normal"] as const) {
      const w = plan(history, 45, energy);
      for (const [, p] of states(w)) {
        const leftS = timeLeftS(w, p);
        for (const e of notInPlan(w)) {
          const r = insert(w, e.id, 1, leftS, history);
          if (r.refused !== "time") expectValid(r, w, e.id, 1, leftS, p);
        }
      }
    }
  });
});

describe("rule 12.3 15-minute budget (AC22)", () => {
  it.each(HISTORIES)(
    "rule-12.3 (AC22) %s: a 15-min plan at its start refuses every insert for time",
    (_n, history) => {
      for (const energy of ["low", "normal", "high"] as const) {
        const w = plan(history, 15, energy);
        const leftS = timeLeftS(w, progress(w, { warmupLeftS: 180 }));
        expect(leftS).toBe(0);
        for (const e of notInPlan(w)) {
          expect(insert(w, e.id, 1, leftS, history), `${energy} ${e.id}`).toStrictEqual({
            refused: "time",
          });
        }
      }
    },
  );
});

describe("rule 12.3 90-minute budget (AC23)", () => {
  it.each(HISTORIES)(
    "rule-12.3 (AC23) %s: filled to 8 items, the next insert is items_cap",
    (_n, history) => {
      const full = plan(history, 90);
      // R7-E8: the 90-min suggestion already holds 8 items, so any add is capped.
      expect(full.plan.items).toHaveLength(8);
      for (const e of notInPlan(full)) {
        expect(insert(full, e.id, 1, 100_000, history)).toStrictEqual({ refused: "items_cap" });
      }
      // Free three slots, then add back other exercises until there are 8 again.
      let w = full;
      for (const it of full.plan.items.slice(5)) w = removeItem(w, it.exerciseId);
      const removed = new Set(full.plan.items.slice(5).map((i) => i.exerciseId));
      let p = progress(w, { warmupLeftS: 180 });
      const pool = notInPlan(w).filter((e) => !removed.has(e.id));
      for (const e of pool) {
        if (w.plan.items.length === 8) break;
        const leftS = timeLeftS(w, p);
        const at = 1;
        const r = insert(w, e.id, at, leftS, history);
        if (r.workout === undefined) {
          expect(r).toStrictEqual({ refused: "time" });
          continue;
        }
        expectValid(r, w, e.id, at, leftS, p);
        p = progressAfterInsert(p, at);
        w = r.workout;
      }
      expect(w.plan.items).toHaveLength(8);
      const leftS = timeLeftS(w, p);
      expect(leftS).toBeGreaterThanOrEqual(0);
      for (const e of notInPlan(w)) {
        expect(insert(w, e.id, 1, leftS, history), e.id).toStrictEqual({ refused: "items_cap" });
      }
    },
  );
});
