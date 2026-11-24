// T-0978b UF-08.1 (D-0268, D-0239 §14): the simulated 14-day histories on L1-ONE (db-row and a
// timed plank flagged as one-side rows). Zero history, balanced, all-chest-no-legs, returning
// after 10 days off and offline-merged, budgets 15..120 step 5, warm-up on and off, every energy
// and shuffle 0..6. Seeded mulberry32 harness (fast-check is not in the lockfile, D-0036 §5).
import { describe, expect, it } from "vitest";
import {
  availableS,
  primaryAreas,
  suggest,
  type Energy,
  type HistorySet,
  type LibraryExercise,
  type SessionInput,
  type Workout,
} from "../src/index.js";
import { F_PROFILE, F_TARGETS, LIBRARY, NOW, TZ, input } from "./fixtures/common.js";
import { SIMULATED_HISTORIES } from "./fixtures/histories.js";
import { L1_ONE, itemFormula, oneSide } from "./fixtures/one-side.js";
import { mulberry32 } from "./fixtures/random.js";

const BUDGET_MS = 120_000;
const HISTORIES: ReadonlyArray<readonly [string, readonly HistorySet[]]> = [
  ["zero", []],
  ["balanced", SIMULATED_HISTORIES.balanced],
  ["allChestNoLegs", SIMULATED_HISTORIES.allChestNoLegs],
  ["returningAfter10Days", SIMULATED_HISTORIES.returningAfter10Days],
  ["offlineMerged", SIMULATED_HISTORIES.offlineMerged],
];
const BUDGETS = Array.from({ length: 22 }, (_, i) => 15 + 5 * i);
const ENERGIES: readonly Energy[] = ["low", "normal", "high"];
const ONE = new Map(L1_ONE.map((e) => [e.id, e]));

function run(lib: readonly LibraryExercise[], h: readonly HistorySet[], si: SessionInput): Workout {
  return suggest(h, F_TARGETS, F_PROFILE, lib, si, NOW, TZ);
}

function* grid(): Generator<SessionInput> {
  for (const budgetMin of BUDGETS) {
    for (const warmupInBudget of [true, false]) {
      for (const energy of ENERGIES) {
        for (let shuffle = 0; shuffle <= 6; shuffle++) {
          yield input({ budgetMin, warmupInBudget, energy, shuffle });
        }
      }
    }
  }
}

/** R7-E8's caps and the independent cost formula, flag included. */
function expectPlan(w: Workout, si: SessionInput, label: string): void {
  const available = availableS(si.budgetMin, si.warmupInBudget);
  const items = w.plan.items;
  const sum = items.reduce((s, i) => s + i.costS, 0);
  expect(sum, `${label} Σ cost`).toBeLessThanOrEqual(Math.max(0, available));
  expect(w.itemsTotalS, `${label} itemsTotalS`).toBe(sum);
  expect(w.unusedS, `${label} unusedS`).toBe(Math.max(0, available - sum));
  expect(items.length, `${label} items`).toBeLessThanOrEqual(8);
  const perArea = new Map<string, number>();
  for (const i of items) {
    const ex = ONE.get(i.exerciseId) as LibraryExercise;
    for (const a of primaryAreas(ex)) perArea.set(a, (perArea.get(a) ?? 0) + 1);
    const sets = i.sets + (i.backoff === null ? 0 : 1);
    expect(i.costS, `${label} ${i.exerciseId}`).toBe(itemFormula(ex, sets, i.durationS));
  }
  for (const [a, n] of perArea) expect(n, `${label} ${a}`).toBeLessThanOrEqual(2);
}

describe("rule 7.1 one side over the simulated 14-day histories (D-0268)", () => {
  it(
    "rule-7.1 (AC8) sweep: caps, determinism, the independent formula and never more flagged sets than plain L1",
    () => {
      let cases = 0;
      let flaggedPlans = 0;
      for (const [name, h] of HISTORIES) {
        for (const si of grid()) {
          const label = `${name} ${si.budgetMin} ${si.warmupInBudget} ${si.energy} ${si.shuffle}`;
          const w = run(L1_ONE, h, si);
          expect(run(L1_ONE, h, si), `${label} R0-E1`).toEqual(w);
          expectPlan(w, si, label);
          const plain = run(LIBRARY, h, si);
          for (const i of w.plan.items.filter((x) =>
            oneSide(ONE.get(x.exerciseId) as LibraryExercise),
          )) {
            flaggedPlans++;
            const p = plain.plan.items.find((x) => x.exerciseId === i.exerciseId);
            if (p !== undefined)
              expect(i.sets, `${label} ${i.exerciseId} sets`).toBeLessThanOrEqual(p.sets);
          }
          cases++;
        }
      }
      expect(cases).toBe(5 * 22 * 2 * 3 * 7);
      expect(flaggedPlans).toBeGreaterThan(0);
    },
    BUDGET_MS,
  );

  it(
    "rule-7.1 (AC8) seeded B5: up to 8 suggestion taps never refuse a tap, with autoMainLift and fill",
    () => {
      let taps = 0;
      let sawFlagged = false;
      let caseNo = 0;
      for (const [name, h] of HISTORIES) {
        for (const budgetMin of BUDGETS) {
          for (const warmupInBudget of [true, false]) {
            const seed = 978_000 + caseNo++;
            const rand = mulberry32(seed);
            const base = input({
              budgetMin,
              warmupInBudget,
              energy: ENERGIES[caseNo % 3] as Energy,
            });
            let main: string | null = null;
            const picks: string[] = [];
            for (let t = 0; t < 8; t++) {
              const call = (m: string | null, auto: boolean): Workout =>
                run(L1_ONE, h, {
                  ...base,
                  shuffle: Math.floor(rand() * 7),
                  mainLiftId: m,
                  pinnedIds: [...picks],
                  autoMainLift: auto,
                  fill: true,
                });
              const have = new Set([...(main ? [main] : []), ...picks]);
              let w = call(main, main === null);
              if (![...have].every((id) => w.plan.items.some((i) => i.exerciseId === id))) {
                w = call(null, false);
              }
              const rows = w.plan.items.filter((i) => !have.has(i.exerciseId));
              if (rows.length === 0) break;
              const row = rows[
                Math.floor(rand() * rows.length)
              ] as Workout["plan"]["items"][number];
              if (row.isMain) main = row.exerciseId;
              else picks.push(row.exerciseId);
              if (oneSide(ONE.get(row.exerciseId) as LibraryExercise)) sawFlagged = true;
              const plan = run(L1_ONE, h, {
                ...base,
                mainLiftId: main,
                pinnedIds: [...picks],
                autoMainLift: false,
                fill: false,
              });
              const ids = plan.plan.items.map((i) => i.exerciseId);
              const label = `seed ${seed} ${name} ${budgetMin} tap ${t + 1} ${row.exerciseId}`;
              expect(ids, label).toContain(row.exerciseId);
              for (const id of picks) expect(ids, `${label} pick ${id}`).toContain(id);
              expect(ids.length, `${label} only picks`).toBe(picks.length + (main ? 1 : 0));
              expectPlan(plan, base, label);
              taps++;
            }
          }
        }
      }
      expect(taps).toBeGreaterThan(100);
      expect(sawFlagged).toBe(true);
    },
    BUDGET_MS,
  );
});
