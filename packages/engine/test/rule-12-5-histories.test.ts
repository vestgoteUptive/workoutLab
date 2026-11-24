// T-0995 UF-08.2 UF-08.6: rules 12.5 to 12.7 over the simulated 14-day histories and seeded
// edit sequences (D-0275 §9, AC11). Inline mulberry32, no fast-check (D-0036 §5).
import { describe, expect, it } from "vitest";
import {
  addArea,
  adjustAreaSets,
  areaCandidates,
  areaGroups,
  availableS,
  itemCostS,
  removeArea,
  setCostS,
  suggest,
  AREAS,
  type Area,
  type HistorySet,
  type Workout,
} from "@workoutlab/engine";
import { F_PROFILE, F_TARGETS, LIBRARY, NOW, TZ, deepFreeze, input } from "./fixtures/common.js";
import { SIMULATED_HISTORIES } from "./fixtures/histories.js";
import { mulberry32 } from "./fixtures/random.js";
import { ctxOf } from "./fixtures/area-edits.js";

const CASES: ReadonlyArray<readonly [string, readonly HistorySet[], number | null]> = [
  ["zero history", [], null],
  ["balanced", SIMULATED_HISTORIES.balanced, null],
  ["all-chest-no-legs", SIMULATED_HISTORIES.allChestNoLegs, null],
  ["returning after 10 days off", SIMULATED_HISTORIES.returningAfter10Days, null],
  ["15-minute budget", SIMULATED_HISTORIES.balanced, 15],
  ["90-minute budget", SIMULATED_HISTORIES.balanced, 90],
  ["offline-merged", SIMULATED_HISTORIES.offlineMerged, null],
];

const lib = new Map(LIBRARY.map((e) => [e.id, e] as const));
const available = (w: Workout): number => availableS(w.budgetMin, w.warmupInBudget);

/** Every invariant of a plan after an edit (rules 7.2 caps, 12.5 set caps, the rule 7.1 totals). */
function checkShape(w: Workout): void {
  const items = w.plan.items;
  expect(items.length).toBeLessThanOrEqual(8);
  expect(new Set(items.map((i) => i.exerciseId)).size).toBe(items.length);
  for (const i of items) {
    expect(i.sets).toBeGreaterThanOrEqual(2);
    expect(i.sets).toBeLessThanOrEqual(i.isMain ? 4 : 3);
    const ex = lib.get(i.exerciseId);
    if (ex === undefined) throw new Error(i.exerciseId);
    const backoff = i.backoff === null ? 0 : setCostS(ex, i.durationS);
    expect(i.costS).toBe(itemCostS(ex, i.sets, i.durationS) + backoff);
  }
  const total = items.reduce((s, i) => s + i.costS, 0);
  expect([w.itemsTotalS, w.totalS, w.unusedS]).toEqual([
    total,
    total + 180,
    Math.max(0, available(w) - total),
  ]);
  expect(w.unusedS).toBeGreaterThanOrEqual(0);
  for (const g of areaGroups(w)) expect(g.itemIds.length).toBeLessThanOrEqual(2);
  const mains = items.filter((i) => i.isMain);
  expect(mains.length).toBeLessThanOrEqual(1);
  expect(w.plan.mainLiftId).toBe(mains[0]?.exerciseId ?? null);
}

function pick<T>(rand: () => number, xs: readonly T[]): T {
  return xs[Math.floor(rand() * xs.length)] as T;
}

describe("rule-12-5 seeded edit sequences (AC11)", () => {
  it.each(CASES)(
    "rule-12-5 %s: 200 sequences",
    (_name, history, fixedBudget) => {
      const ctx = ctxOf({ history });
      const rand = mulberry32(12_005 + history.length + (fixedBudget ?? 0));
      for (let n = 0; n < 200; n++) {
        const budgetMin = fixedBudget ?? 15 + 5 * Math.floor(rand() * 22);
        const energy = pick(rand, ["low", "normal", "high"] as const);
        const warmupInBudget = rand() < 0.7;
        let w: Workout = suggest(
          history,
          F_TARGETS,
          F_PROFILE,
          LIBRARY,
          input({ budgetMin, energy, warmupInBudget }),
          NOW,
          TZ,
        );
        for (let step = 0; step < 14; step++) {
          deepFreeze(w);
          const snapshot = JSON.stringify(w);
          const inPlan = areaGroups(w).map((g) => g.area);
          const outside = AREAS.filter((a) => !inPlan.includes(a));
          const op = rand();
          let r: Workout | { refused: string };
          let kind: "plus" | "minus" | "add" | "remove";
          let area: Area;
          if (op < 0.4 && inPlan.length > 0) {
            kind = "plus";
            area = pick(rand, inPlan);
            r = adjustAreaSets(w, area, 1, ctx);
            if (step % 4 === 0) expect(adjustAreaSets(w, area, 1, ctx)).toStrictEqual(r);
          } else if (op < 0.6 && inPlan.length > 0) {
            kind = "minus";
            area = pick(rand, inPlan);
            r = adjustAreaSets(w, area, -1, ctx);
            expect(adjustAreaSets(w, area, -1, ctx)).toStrictEqual(r);
          } else if (op < 0.9 && outside.length > 0) {
            kind = "add";
            area = pick(rand, outside);
            r = addArea(w, area, ctx);
            expect(addArea(w, area, ctx)).toStrictEqual(r);
          } else if (inPlan.length > 0) {
            kind = "remove";
            area = pick(rand, inPlan);
            r = removeArea(w, area);
          } else continue;

          expect(JSON.stringify(w)).toBe(snapshot); // never mutated, refused or not
          if ("refused" in r) {
            expect(r).toStrictEqual({ refused: r.refused });
            continue;
          }
          checkShape(r);
          const before = w.plan.items.reduce((s, i) => s + i.costS, 0);
          if (kind === "plus" || kind === "add") {
            // Never over budget through an add, unless the plan was over before (then it is refused).
            expect(r.itemsTotalS).toBeLessThanOrEqual(Math.max(available(w), before));
            expect(r.itemsTotalS).toBeGreaterThan(before);
            if (before > available(w)) throw new Error("an over-budget plan accepted an add");
            expect(r.itemsTotalS).toBeLessThanOrEqual(available(w));
          } else {
            expect(r.itemsTotalS).toBeLessThan(before); // freed time stays unused
          }
          if (kind === "plus" && r.plan.items.length === w.plan.items.length) {
            // +1 then -1 round-trips when no item was added and +1 raised the area's last item.
            const items = w.plan.items.filter((i) =>
              i.reasons.some((x) => x.code === "area_deficit" && x.area === area),
            );
            const last = items[items.length - 1];
            const after = r.plan.items.find((i) => i.exerciseId === last?.exerciseId);
            if (after !== undefined && last !== undefined && after.sets === last.sets + 1) {
              expect(adjustAreaSets(r, area, -1, ctx)).toStrictEqual(w);
            }
          }
          w = r;
        }
      }
    },
    120_000,
  );
});

describe("rule-12-5 never over budget, budgets 15..120 step 5 (AC11)", () => {
  it.each(CASES)(
    "rule-12-5 %s: + on every area, then Fill the rest, never over budget",
    (_n, history, fixed) => {
      const ctx = ctxOf({ history });
      for (const budgetMin of fixed === null ? range(15, 120, 5) : [fixed]) {
        for (const warmupInBudget of [true, false]) {
          let w: Workout = suggest(
            history,
            F_TARGETS,
            F_PROFILE,
            LIBRARY,
            input({ budgetMin, warmupInBudget }),
            NOW,
            TZ,
          );
          // Fill the rest for me: addArea of the first available candidate until none is.
          for (let guard = 0; guard < 9; guard++) {
            const c = areaCandidates(w, ctx).find((x) => x.available === true);
            if (c === undefined) break;
            const r = addArea(w, c.area, ctx);
            if ("refused" in r)
              throw new Error(`${c.area} listed available but refused ${r.refused}`);
            w = r;
            checkShape(w);
            expect(w.itemsTotalS).toBeLessThanOrEqual(available(w));
          }
          // Press + on every area until each refuses.
          for (let round = 0; round < 8; round++) {
            for (const g of areaGroups(w)) {
              const r = adjustAreaSets(w, g.area, 1, ctx);
              if ("refused" in r) continue;
              w = r;
              checkShape(w);
              expect(w.itemsTotalS).toBeLessThanOrEqual(available(w));
            }
          }
          for (const g of areaGroups(w)) {
            expect(adjustAreaSets(w, g.area, 1, ctx)).toHaveProperty("refused");
          }
          // Every area holds at most 7 sets (6 without the main lift), at least 2.
          for (const g of areaGroups(w)) {
            const hasMain = w.plan.items.some((i) => i.isMain && g.itemIds.includes(i.exerciseId));
            expect(g.sets).toBeLessThanOrEqual(hasMain ? 7 : 6);
            expect(g.sets).toBeGreaterThanOrEqual(2);
          }
          // Remove every area: the plan ends empty and all the time is unused.
          for (const g of areaGroups(w)) w = adjustAreaSets(w, g.area, -1, ctx) as Workout;
          for (const g of areaGroups(w)) w = removeArea(w, g.area);
          expect(w.plan.items).toEqual([]);
          expect(w.plan.mainLiftId).toBeNull();
          expect(w.unusedS).toBe(Math.max(0, available(w)));
        }
      }
    },
    120_000,
  );
});

function range(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  for (let v = from; v <= to; v += step) out.push(v);
  return out;
}
