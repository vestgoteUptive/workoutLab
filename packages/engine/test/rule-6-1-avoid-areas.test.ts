// T-0516 UF-08.1: rule 6.1 avoided areas (D-0191 §2, GitHub #33). `sessionInput.avoidAreas`
// skips areas like recovering ones for selection only: AC1–AC10, R6-E3…E6, and the simulated
// 14-day histories (R7-E8 with avoided areas).
import { describe, expect, it } from "vitest";
import {
  AREAS,
  availableS,
  avoidedAreas,
  isEligible,
  primaryAreas,
  rankCandidates,
  recoveringAreas,
  suggest,
  type Area,
  type Energy,
  type HistorySet,
  type LibraryExercise,
  type SessionInput,
  type Workout,
} from "@workoutlab/engine";
import {
  F_PROFILE,
  F_TARGETS,
  HOUR,
  LIBRARY,
  NOW,
  TZ,
  deepFreeze,
  input,
  itemsOf,
  setsAt,
  shift,
  warmupOf,
} from "./fixtures/common.js";
import { SIMULATED_HISTORIES } from "./fixtures/histories.js";
import { mulberry32, randomHistory } from "./fixtures/random.js";

const LEGS: Area[] = ["glutes", "quads", "hamstrings", "calves"];
const LIB = new Map(LIBRARY.map((e) => [e.id, e]));
const HISTORIES: Array<[string, HistorySet[]]> = [
  ["zero", []],
  ...Object.entries(SIMULATED_HISTORIES).map(([k, h]): [string, HistorySet[]] => [k, h]),
];

function run(history: readonly HistorySet[], si: SessionInput = input()): Workout {
  return suggest(history, F_TARGETS, F_PROFILE, LIBRARY, si, NOW, TZ);
}

/** The primary (weight 1.0) areas of every item, in session order. */
function primariesOf(w: Workout): Area[] {
  return w.plan.items.flatMap((i) => primaryAreas(LIB.get(i.exerciseId) as LibraryExercise));
}

function expectNoneAvoided(w: Workout, avoid: readonly Area[], label = ""): void {
  const leaked = primariesOf(w).filter((a) => avoid.includes(a));
  expect(leaked, `${label} avoided area at weight 1.0`).toEqual([]);
}

/** R7-E8 (never over, ≤ 8 items, ≤ 2 per primary area, no recovering primary) + rule 6.1. */
function checkInvariants(history: readonly HistorySet[], si: SessionInput, w: Workout): void {
  const available = availableS(si.budgetMin, si.warmupInBudget);
  const items = w.plan.items;
  const sum = items.reduce((s, i) => s + i.costS, 0);
  expect(sum).toBeLessThanOrEqual(Math.max(0, available));
  expect(items.length).toBeLessThanOrEqual(8);
  const recovering = new Set(recoveringAreas(history, LIBRARY, NOW));
  const perArea = new Map<Area, number>();
  for (const i of items) {
    const ex = LIB.get(i.exerciseId) as LibraryExercise;
    expect(isEligible(ex, F_PROFILE, si.excludeIds)).toBe(true);
    for (const a of primaryAreas(ex)) {
      perArea.set(a, (perArea.get(a) ?? 0) + 1);
      expect(recovering.has(a)).toBe(false);
    }
  }
  for (const n of perArea.values()) expect(n).toBeLessThanOrEqual(2);
  expect(w.itemsTotalS).toBe(sum);
  expect(w.unusedS).toBe(Math.max(0, available - sum));
  expectNoneAvoided(w, si.avoidAreas ?? []);
  // No new reason codes (D-0191 §2): recovering_skipped is rule 6 only.
  for (const r of w.sessionReasons) {
    if (r.code === "recovering_skipped") expect(recovering.has(r.area)).toBe(true);
  }
  expect(run(history, si)).toEqual(w);
}

describe("rule 6.1 avoided areas in suggest()", () => {
  it("rule-6.1 (AC1) absent avoidAreas ≡ [] ≡ R7-E4", () => {
    const absent = run([], input());
    expect("avoidAreas" in input()).toBe(false);
    const empty = run([], input({ avoidAreas: [] }));
    expect(empty).toEqual(absent);
    expect(itemsOf(absent)).toEqual([
      ["bench-press", 4],
      ["inverted-row", 3],
      ["leg-extension", 2],
    ]);
    expect(absent.itemsTotalS).toBe(1545);
    expect(absent.unusedS).toBe(75);
  });

  it("R6-E3 rule-6.1 (AC2) legs skipped: bench-press, inverted-row, lateral-raise", () => {
    const w = run([], input({ avoidAreas: LEGS }));
    expectNoneAvoided(w, LEGS);
    expect(w.plan.items.map((i) => [i.exerciseId, i.sets, i.costS, i.isMain])).toEqual([
      ["bench-press", 4, 720, true],
      ["inverted-row", 3, 555, false],
      ["lateral-raise", 2, 270, false],
    ]);
    expect(w.plan.mainLiftId).toBe("bench-press");
    expect(w.itemsTotalS).toBe(1545);
    expect(w.totalS).toBe(1725);
    expect(w.unusedS).toBe(75);
    expect(warmupOf(w)).toEqual([
      "wu-scap-push-up",
      "wu-band-pull-apart",
      "wu-arm-circle",
      "wu-cat-cow",
    ]);
    // Avoided areas add no reason code and don't change startDeficits (D-0191 §2).
    expect(w.sessionReasons.map((r) => r.code)).toEqual([
      "area_deficit",
      "area_deficit",
      "area_deficit",
    ]);
    expect(w.plan.startDeficits).toEqual(run([]).plan.startDeficits);
  });

  it("R6-E5 rule-6.1 (AC3) sore legs that rule 6 doesn't see as recovering", () => {
    const history = setsAt(6, "back-squat", shift(NOW, -49 * HOUR));
    expect(recoveringAreas(history, LIBRARY, NOW)).toEqual([]);
    const avoid: Area[] = ["quads", "glutes"];
    expectNoneAvoided(run(history, input({ budgetMin: 45, avoidAreas: avoid })), avoid, "45");
    // D-0193: at 45 min the seven areas at load 0 fill the plan first, so the control runs at 75.
    const skipped = run(history, input({ budgetMin: 75, avoidAreas: avoid }));
    expectNoneAvoided(skipped, avoid, "75");
    const control = run(history, input({ budgetMin: 75, avoidAreas: [] }));
    expect(primariesOf(control).some((a) => avoid.includes(a))).toBe(true);
    expect(itemsOf(control)).toContainEqual(["leg-extension", 3]);
  });

  it("R6-E6 rule-6.1 (AC4) a mainLiftId with an avoided primary area is ignored", () => {
    const w = run([], input({ mainLiftId: "bench-press", avoidAreas: ["chest"] }));
    expect(w.plan.items.map((i) => i.exerciseId)).not.toContain("bench-press");
    expect(w.plan.mainLiftId).not.toBe("bench-press");
    const main = w.plan.items.find((i) => i.isMain);
    if (main !== undefined) {
      expect(primaryAreas(LIB.get(main.exerciseId) as LibraryExercise)).not.toContain("chest");
    }
    expect(itemsOf(w)[0]).toEqual(["inverted-row", 4]);
    expect(w.plan.mainLiftId).toBe("inverted-row");
    expectNoneAvoided(w, ["chest"]);
  });

  it("rule-6.1 (AC5) R13-E1 shuffle with legs skipped keeps legs out and never goes over", () => {
    const one = run([], input({ shuffle: 1, avoidAreas: LEGS }));
    expectNoneAvoided(one, LEGS);
    expect(itemsOf(one)).toEqual([
      ["bench-press", 4],
      ["barbell-row", 3],
      ["lateral-raise", 2],
    ]);
    const available = availableS(30, true);
    for (let n = 0; n <= 6; n++) {
      const w = run([], input({ shuffle: n, avoidAreas: LEGS }));
      expectNoneAvoided(w, LEGS, `n=${n}`);
      expect(w.plan.items.reduce((s, i) => s + i.costS, 0)).toBeLessThanOrEqual(available);
    }
  });

  it("rule-6.1 a shuffle pick with an avoided primary area leaves the slot's original", () => {
    // leg-extension's variety ranking includes back-squat (quads + glutes); with glutes avoided
    // and room to spare, every n either keeps leg-extension or picks a non-glutes exercise.
    for (const budgetMin of [30, 45, 60, 90]) {
      for (let n = 0; n <= 8; n++) {
        const w = run(
          [],
          input({ budgetMin, warmupInBudget: false, shuffle: n, avoidAreas: ["glutes"] }),
        );
        expectNoneAvoided(w, ["glutes"], `budget ${budgetMin} n=${n}`);
      }
    }
  });

  it("rule-6.1 (AC6) every area skipped: an empty plan", () => {
    const w = run([], input({ avoidAreas: [...AREAS] }));
    expect(w.plan.items).toEqual([]);
    expect(w.plan.mainLiftId).toBeNull();
    expect(w.itemsTotalS).toBe(0);
    expect(w.unusedS).toBe(availableS(30, true));
  });

  it("rule-6.1 (AC7) an unknown area is a RangeError; duplicates are ignored", () => {
    const bad = input({ avoidAreas: ["legs"] as unknown as Area[] });
    expect(() => run([], bad)).toThrow(RangeError);
    expect(() => run([], input({ avoidAreas: "chest" as unknown as Area[] }))).toThrow(RangeError);
    expect(() => avoidedAreas({ avoidAreas: [null] as unknown as Area[] })).toThrow(RangeError);
    expect(run([], input({ avoidAreas: ["chest", "chest"] }))).toEqual(
      run([], input({ avoidAreas: ["chest"] })),
    );
    expect([...avoidedAreas({ avoidAreas: ["quads", "chest", "quads"] })]).toEqual([
      "quads",
      "chest",
    ]);
    expect(avoidedAreas({}).size).toBe(0);
  });

  it("R6-E4 rule-6.1 (AC8) gap fit counts an avoided area 0: barbell-row beats inverted-row", () => {
    const w = run([], input({ avoidAreas: ["core"] }));
    expect(itemsOf(w)).toEqual([
      ["bench-press", 4],
      ["barbell-row", 3],
      ["leg-extension", 2],
    ]);
    expect(w.itemsTotalS).toBe(1545);
    expect(w.unusedS).toBe(75);
    // R7-E7's helper sees the same ranking.
    const ranked = rankCandidates(
      "back",
      [],
      F_TARGETS,
      F_PROFILE,
      LIBRARY,
      { excludeIds: [], avoidAreas: ["core"] },
      NOW,
      TZ,
    );
    expect(ranked[0]).toBe("barbell-row");
    const plain = rankCandidates(
      "back",
      [],
      F_TARGETS,
      F_PROFILE,
      LIBRARY,
      { excludeIds: [] },
      NOW,
      TZ,
    );
    expect(plain[0]).toBe("inverted-row");
  });

  it("rule-6.1 (AC10) inputs are never mutated (frozen avoidAreas)", () => {
    const si = deepFreeze(input({ avoidAreas: ["quads", "quads", "chest"] }));
    const w = suggest([], deepFreeze(structuredClone(F_TARGETS)), F_PROFILE, LIBRARY, si, NOW, TZ);
    expect(si.avoidAreas).toEqual(["quads", "quads", "chest"]);
    expect(w).toEqual(run([], input({ avoidAreas: ["chest", "quads"] })));
  });
});

describe("rule 6.1 over the simulated 14-day histories (AC9, property)", () => {
  const AVOIDS: Array<[string, Area[]]> = [
    ["legs", LEGS],
    ["chest+back", ["chest", "back"]],
  ];

  it("R7-E8 rule-6.1 (AC9) budgets 15..120 × warm-up × avoided sets: never over, never avoided, deterministic", () => {
    for (const [name, history] of HISTORIES) {
      for (const [label, avoid] of AVOIDS) {
        for (let budgetMin = 15; budgetMin <= 120; budgetMin += 5) {
          for (const warmupInBudget of [true, false]) {
            const si = input({ budgetMin, warmupInBudget, avoidAreas: avoid });
            try {
              const w = run(history, si);
              checkInvariants(history, si, w);
              expect(run(history, deepFreeze(structuredClone(si)))).toEqual(w);
            } catch (err) {
              throw new Error(
                `${name} ${label} budget ${budgetMin} warm-up ${warmupInBudget}: ${(err as Error).message}`,
              );
            }
          }
        }
      }
    }
  }, 60_000); // runtime budget only (sweep)

  it("rule-6.1 (AC9) each single area skipped, shuffle 0..6 and every energy, over the histories", () => {
    const energies: Energy[] = ["normal", "low", "high"];
    for (const [name, history] of HISTORIES) {
      for (const area of AREAS) {
        for (const budgetMin of [15, 30, 45, 60, 90, 120]) {
          for (let shuffle = 0; shuffle <= 6; shuffle++) {
            const energy = energies[shuffle % 3] as Energy;
            const si = input({ budgetMin, shuffle, energy, avoidAreas: [area] });
            try {
              checkInvariants(history, si, run(history, si));
            } catch (err) {
              throw new Error(
                `${name} ${area} budget ${budgetMin} n=${shuffle}: ${(err as Error).message}`,
              );
            }
          }
        }
      }
    }
  }, 60_000); // runtime budget only (sweep)

  it("rule-6.1 200 seeded histories with random avoided sets, budgets 1–480 and shuffles (a failure prints its seed)", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rand = mulberry32(61_000 + seed);
      const history = randomHistory(rand);
      const avoid = AREAS.filter(() => rand() < 0.3);
      const si = input({
        budgetMin: 1 + Math.floor(rand() * 480),
        warmupInBudget: rand() < 0.5,
        shuffle: Math.floor(rand() * 8),
        avoidAreas: avoid,
      });
      try {
        checkInvariants(history, si, run(history, si));
      } catch (err) {
        throw new Error(`seed ${seed}: ${(err as Error).message}`);
      }
    }
  }, 60_000); // runtime budget only (sweep)
});
