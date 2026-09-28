// T-0201a UF-08.1: simulated histories through suggest(), R0-E1 on suggest and R7-E8.
// AC14, AC18–AC20.
import { describe, expect, it } from "vitest";
import {
  availableS,
  isEligible,
  normalizeHistory,
  primaryAreas,
  recoveringAreas,
  suggest,
  type HistorySet,
  type LibraryExercise,
  type SessionInput,
  type Workout,
} from "@workoutlab/engine";
import { F_PROFILE, F_TARGETS, LIBRARY, NOW, TZ, deepFreeze, input } from "./fixtures/common.js";
import {
  SIMULATED_HISTORIES,
  offlineMergedHistory,
  offlineQueue,
  returningAfter10DaysHistory,
} from "./fixtures/histories.js";
import { mulberry32, randomHistory } from "./fixtures/random.js";

const HISTORIES: Array<[string, HistorySet[]]> = [
  ["zero", []],
  ...Object.entries(SIMULATED_HISTORIES).map(([k, h]): [string, HistorySet[]] => [k, h]),
];

function run(
  history: readonly HistorySet[],
  si: SessionInput = input(),
  library = LIBRARY,
): Workout {
  return suggest(history, F_TARGETS, F_PROFILE, library, si, NOW, TZ);
}

const LIB = new Map(LIBRARY.map((e) => [e.id, e]));
const WARMUP_ROWS = LIBRARY.filter((e) => e.kind === "warmup").length;

function checkInvariants(history: readonly HistorySet[], si: SessionInput, w: Workout): void {
  const available = availableS(si.budgetMin, si.warmupInBudget);
  const items = w.plan.items;
  const sum = items.reduce((s, i) => s + i.costS, 0);
  expect(sum).toBeLessThanOrEqual(Math.max(0, available));
  expect(items.length).toBeLessThanOrEqual(8);
  const perArea = new Map<string, number>();
  const recovering = new Set(recoveringAreas(history, LIBRARY, NOW));
  for (const i of items) {
    const ex = LIB.get(i.exerciseId) as LibraryExercise;
    expect(isEligible(ex, F_PROFILE, si.excludeIds)).toBe(true);
    for (const a of primaryAreas(ex)) {
      perArea.set(a, (perArea.get(a) ?? 0) + 1);
      expect(recovering.has(a)).toBe(false);
    }
  }
  for (const n of perArea.values()) expect(n).toBeLessThanOrEqual(2);
  expect(new Set(items.map((i) => i.exerciseId)).size).toBe(items.length);
  expect(w.itemsTotalS).toBe(sum);
  expect(w.totalS).toBe(sum + 180);
  expect(w.unusedS).toBe(Math.max(0, available - sum));
  expect(new Set(w.plan.warmup.map((m) => m.exerciseId)).size).toBe(Math.min(4, WARMUP_ROWS));
  expect(w.plan.warmup).toHaveLength(Math.min(4, WARMUP_ROWS));
  for (const d of Object.values(w.plan.startDeficits)) expect(d).toBeGreaterThanOrEqual(0);
  expect(run(history, si)).toEqual(w);
}

describe("simulated histories through suggest()", () => {
  it("rule-7 (AC18) returning after 10 days off: bench-press × 4 with chest 15 days since", () => {
    const w = run(returningAfter10DaysHistory);
    const main = w.plan.items[0];
    expect(main?.exerciseId).toBe("bench-press");
    expect(main?.isMain).toBe(true);
    expect(main?.sets).toBe(4);
    expect(main?.reasons).toContainEqual({ code: "area_deficit", area: "chest", deficit: 1 });
    expect(main?.reasons).toContainEqual({ code: "days_since", area: "chest", days: 15 });
  });

  it("rule-0 (AC19) offline-merged history equals its normalised form, and replays change nothing", () => {
    const merged = run(offlineMergedHistory);
    const normalised = normalizeHistory(offlineMergedHistory).map((row) => {
      const copy: HistorySet = { ...row };
      delete copy.pending;
      return copy;
    });
    expect(run(normalised)).toEqual(merged);
    const replayed = [...offlineMergedHistory, ...offlineQueue.map((r) => ({ ...r }))];
    expect(run(replayed)).toEqual(merged);
  });

  it("R0-E1 rule-0 (AC20) suggest is deterministic, frozen-safe and order-independent", () => {
    for (const [name, history] of HISTORIES) {
      const a = run(history);
      expect(run(history), name).toEqual(a);
      const frozenHistory = deepFreeze(structuredClone(history));
      const frozenLib = deepFreeze(structuredClone(LIBRARY));
      const frozenTargets = deepFreeze(structuredClone(F_TARGETS));
      const frozenProfile = deepFreeze(structuredClone(F_PROFILE));
      const frozenInput = deepFreeze(input());
      expect(
        suggest(frozenHistory, frozenTargets, frozenProfile, frozenLib, frozenInput, NOW, TZ),
        name,
      ).toEqual(a);
      expect(run([...history].reverse()), name).toEqual(a);
      expect(run(history, input(), [...LIBRARY].reverse()), name).toEqual(a);
    }
  });
});

describe("R7-E8 never over budget (property)", () => {
  it("R7-E8 rule-7 (AC14) budget sweep 15..120 over zero and the simulated histories", () => {
    for (const [name, history] of HISTORIES) {
      for (let budgetMin = 15; budgetMin <= 120; budgetMin += 5) {
        for (const warmupInBudget of [true, false]) {
          const si = input({ budgetMin, warmupInBudget });
          try {
            checkInvariants(history, si, run(history, si));
          } catch (err) {
            throw new Error(
              `${name} budget ${budgetMin} warm-up ${warmupInBudget}: ${(err as Error).message}`,
            );
          }
        }
      }
    }
  });

  it("R7-E8 rule-7 (AC14) 200 seeded histories with budgets 1–480 (a failure prints its seed)", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rand = mulberry32(20_000 + seed);
      const history = randomHistory(rand);
      const si = input({
        budgetMin: 1 + Math.floor(rand() * 480),
        warmupInBudget: rand() < 0.5,
      });
      try {
        checkInvariants(history, si, run(history, si));
      } catch (err) {
        throw new Error(`seed ${seed}: ${(err as Error).message}`);
      }
    }
  });
});
