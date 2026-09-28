// T-0201a UF-08.1: simulated histories through suggest(), R0-E1 on suggest and R7-E8.
// AC14, AC18–AC20. T-0201b UF-08.1 UF-09.8: the AC28 energy sweep and a timeCheck property.
import { describe, expect, it } from "vitest";
import {
  availableS,
  isEligible,
  normalizeHistory,
  primaryAreas,
  recoveringAreas,
  suggest,
  timeCheck,
  type Energy,
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

/** AC28: Low never changes the main item or adds items; High adds ≤ 1 back-off, main only. */
function checkEnergy(history: readonly HistorySet[], si: SessionInput): void {
  const normal = run(history, { ...si, energy: "normal" });
  const w = run(history, si);
  checkInvariants(history, si, w);
  const items = w.plan.items;
  const base = normal.plan.items;
  expect(items.map((i) => i.exerciseId)).toEqual(base.map((i) => i.exerciseId));
  expect(w.plan.mainLiftId).toBe(normal.plan.mainLiftId);
  if (si.energy === "low") {
    items.forEach((it, k) => {
      const b = base[k];
      if (it.isMain) expect(it).toEqual(b);
      else expect(it.sets).toBe(b?.sets === 3 ? 2 : b?.sets);
      expect(it.backoff).toBeNull();
    });
  } else {
    const withBackoff = items.filter((i) => i.backoff !== null);
    expect(withBackoff.length).toBeLessThanOrEqual(1);
    for (const it of withBackoff) expect(it.isMain).toBe(true);
    items.forEach((it, k) => {
      if (it.backoff === null) expect(it).toEqual(base[k]);
      else expect(it.sets).toBe(base[k]?.sets);
    });
  }
}

describe("rule 7.4 energy keeps the R7-E8 invariants (property)", () => {
  for (const energy of ["low", "high"] as Energy[]) {
    it(`rule-7 (AC28) energy ${energy}: budget sweep 15..120 over zero and the simulated histories`, () => {
      for (const [name, history] of HISTORIES) {
        for (let budgetMin = 15; budgetMin <= 120; budgetMin += 5) {
          for (const warmupInBudget of [true, false]) {
            try {
              checkEnergy(history, input({ budgetMin, warmupInBudget, energy }));
            } catch (err) {
              throw new Error(
                `${name} budget ${budgetMin} warm-up ${warmupInBudget}: ${(err as Error).message}`,
              );
            }
          }
        }
      }
    });

    it(`rule-7 (AC28) energy ${energy}: 200 seeded histories with budgets 1–480 (a failure prints its seed)`, () => {
      for (let seed = 1; seed <= 200; seed++) {
        const rand = mulberry32(30_000 + seed);
        const history = randomHistory(rand);
        const si = input({
          budgetMin: 1 + Math.floor(rand() * 480),
          warmupInBudget: rand() < 0.5,
          energy,
        });
        try {
          checkEnergy(history, si);
        } catch (err) {
          throw new Error(`seed ${seed}: ${(err as Error).message}`);
        }
      }
    });
  }
});

describe("rule 8 timeCheck over suggested workouts (property)", () => {
  it("rule-8 (AC35) Trim never cuts the main lift or started items and never projects past Continue", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rand = mulberry32(40_000 + seed);
      const history = randomHistory(rand);
      const energies: Energy[] = ["low", "normal", "high"];
      const si = input({
        budgetMin: 15 + Math.floor(rand() * 106),
        warmupInBudget: rand() < 0.5,
        energy: energies[Math.floor(rand() * 3)] as Energy,
      });
      const w = run(history, si);
      const n = w.plan.items.length;
      const next = Math.floor(rand() * (n + 1));
      const elapsedS = Math.floor(rand() * 2 * si.budgetMin * 60);
      try {
        const r = timeCheck(w, { elapsedS, nextItemIndex: next });
        expect(Number.isInteger(r.behindS)).toBe(true);
        expect(r.show).toBe(next < n && r.behindS >= 60);
        expect(r.trim.items.slice(0, next)).toEqual(w.plan.items.slice(0, next));
        const main = w.plan.items.find((i) => i.isMain);
        if (main !== undefined) {
          const idx = w.plan.items.indexOf(main);
          if (idx >= next) expect(r.trim.items).toContainEqual(main);
        }
        expect(r.trim.projectedS).toBeLessThanOrEqual(r.projectedS);
        for (const it of r.trim.items) expect(Number.isInteger(it.costS)).toBe(true);
        expect(r.skipNext.items).toHaveLength(next < n ? n - 1 : n);
        expect(timeCheck(w, { elapsedS, nextItemIndex: next })).toEqual(r);
      } catch (err) {
        throw new Error(`seed ${seed}: ${(err as Error).message}`);
      }
    }
  });
});
