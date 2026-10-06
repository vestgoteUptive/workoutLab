// T-0519 UF-08.2: rule 12.2 removeItem (D-0191 §4, GitHub #33). Remove drops an item and
// nothing refills the freed time. AC1–AC8 (R12-E13…E16), the simulated 14-day histories, a
// seeded property run, and an in-suite planted fault: the old Remove (re-suggest with
// `excludeIds`, D-0065 §4) refills the slot, and the no-refill check catches it.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  applySwap,
  availableS,
  removeItem,
  suggest,
  WARMUP_COST_S,
  type Energy,
  type HistorySet,
  type SessionInput,
  type Workout,
} from "@workoutlab/engine";
import {
  F_INPUT,
  F_PROFILE,
  F_TARGETS,
  HOUR,
  LIBRARY,
  NOW,
  TZ,
  deepFreeze,
  input,
  sessionOf,
  setsAt,
  shift,
} from "./fixtures/common.js";
import { SIMULATED_HISTORIES } from "./fixtures/histories.js";
import { mulberry32, randomHistory } from "./fixtures/random.js";

const REPO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function run(si: SessionInput = F_INPUT, history: readonly HistorySet[] = []): Workout {
  return suggest(history, F_TARGETS, F_PROFILE, LIBRARY, si, NOW, TZ);
}

/**
 * Rule 12.2's no-refill check: `after` is `before` with exactly the item `id` dropped. Every
 * remaining item is deep-equal to its counterpart, in the same order, and nothing new appears.
 * Returns the first violation, or null.
 */
function refillViolation(before: Workout, after: Workout, id: string): string | null {
  const expected = before.plan.items.filter((i) => i.exerciseId !== id);
  if (after.plan.items.length !== before.plan.items.length - 1) {
    return `expected ${before.plan.items.length - 1} items, got ${after.plan.items.length}`;
  }
  const beforeIds = new Set(before.plan.items.map((i) => i.exerciseId));
  for (const [k, item] of after.plan.items.entries()) {
    if (!beforeIds.has(item.exerciseId)) return `refilled with ${item.exerciseId}`;
    if (JSON.stringify(item) !== JSON.stringify(expected[k])) return `item ${k} changed`;
  }
  if (after.itemsTotalS > before.itemsTotalS) return "itemsTotalS grew";
  return null;
}

// W = R7-E4: bench-press × 4 (main, 720), inverted-row × 3 (555), leg-extension × 2 (270).
// 1545 items, 1725 with the warm-up, available 30 × 60 − 180 = 1620, unusedS 75.
const W = run();

// R7-E2: budget 15, warm-up on → available 900 − 180 = 720; bench-press × 4 = 720.
const W_E2 = run(input({ budgetMin: 15 }));

// R7-E3: 6 hard back-squat sets at now − 24 h, so glutes and quads are recovering.
const W_E3 = run(F_INPUT, setsAt(6, "back-squat", shift(NOW, -24 * HOUR)));

// R12-E11: W with leg-extension → back-squat × 2 (390 s): 720 + 555 + 390 = 1665 > 1620.
const W_E11 = applySwap(W, "leg-extension", "back-squat", null, [], F_PROFILE, LIBRARY, NOW, TZ);

describe("rule 12.2 removeItem fixtures (preconditions)", () => {
  it("rule-12.2 W is R7-E4, W_E2 is R7-E2, W_E3 is R7-E3, W_E11 is R12-E11", () => {
    expect(W.plan.items.map((i) => [i.exerciseId, i.sets, i.costS, i.isMain])).toEqual([
      ["bench-press", 4, 720, true],
      ["inverted-row", 3, 555, false],
      ["leg-extension", 2, 270, false],
    ]);
    expect([W.itemsTotalS, W.totalS, W.unusedS, W.budgetMin, W.warmupInBudget]).toEqual([
      1545,
      1725,
      75,
      30,
      true,
    ]);
    expect(availableS(W.budgetMin, W.warmupInBudget)).toBe(1620);
    expect(W.sessionReasons).toEqual([
      { code: "area_deficit", area: "chest", deficit: 1 },
      { code: "area_deficit", area: "back", deficit: 1 },
      { code: "area_deficit", area: "quads", deficit: 1 },
    ]);
    expect(W_E2.plan.items.map((i) => [i.exerciseId, i.sets])).toEqual([["bench-press", 4]]);
    expect(W_E3.sessionReasons.slice(0, 2)).toEqual([
      { code: "recovering_skipped", area: "glutes" },
      { code: "recovering_skipped", area: "quads" },
    ]);
    expect([W_E11.itemsTotalS, W_E11.unusedS]).toEqual([1665, 0]);
  });
});

describe("rule 12.2 removeItem (UF-08.2, D-0191 §4)", () => {
  it("R12-E13 rule-12.2 (AC1) remove an accessory: the rest is unchanged, nothing refills", () => {
    const r = removeItem(W, "leg-extension");
    expect(r.plan.items).toStrictEqual([W.plan.items[0], W.plan.items[1]]);
    // 720 + 555 = 1275; + 180 = 1455; 1620 − 1275 = 345.
    expect([r.itemsTotalS, r.totalS, r.unusedS]).toEqual([1275, 1455, 345]);
    expect(r.plan.mainLiftId).toBe("bench-press");
  });

  it("R12-E14 rule-12.2 (AC2) remove the main lift: mainLiftId null, nobody is promoted", () => {
    const r = removeItem(W, "bench-press");
    expect(r.plan.items.map((i) => [i.exerciseId, i.sets, i.isMain])).toEqual([
      ["inverted-row", 3, false],
      ["leg-extension", 2, false],
    ]);
    expect(r.plan.items).toStrictEqual([W.plan.items[1], W.plan.items[2]]);
    expect(r.plan.mainLiftId).toBeNull();
    // 555 + 270 = 825; + 180 = 1005; 1620 − 825 = 795.
    expect([r.itemsTotalS, r.totalS, r.unusedS]).toEqual([825, 1005, 795]);
  });

  it("rule-12.2 (AC3) no refill: every removal returns length − 1 items, each deep-equal", () => {
    for (const item of W.plan.items) {
      const r = removeItem(W, item.exerciseId);
      expect(r.plan.items).toHaveLength(W.plan.items.length - 1);
      expect(r.plan.items).toStrictEqual(
        W.plan.items.filter((i) => i.exerciseId !== item.exerciseId),
      );
      expect(refillViolation(W, r, item.exerciseId), item.exerciseId).toBeNull();
    }
  });

  it("rule-12.2 (AC4) warm-up, startDeficits, version, budget, warm-up flag and energy unchanged", () => {
    const low = run(input({ energy: "low" }));
    for (const w of [W, low, W_E3]) {
      for (const item of w.plan.items) {
        const r = removeItem(w, item.exerciseId);
        expect(r.plan.warmup).toStrictEqual(w.plan.warmup);
        expect(r.plan.startDeficits).toStrictEqual(w.plan.startDeficits);
        expect(r.plan.version).toBe(w.plan.version);
        expect(r.budgetMin).toBe(w.budgetMin);
        expect(r.warmupInBudget).toBe(w.warmupInBudget);
        expect(r.energy).toBe(w.energy);
      }
    }
  });

  it("R12-E13 rule-12.2 (AC5) session reasons drop the area no item covers; recovering stays", () => {
    expect(removeItem(W, "leg-extension").sessionReasons).toEqual([
      { code: "area_deficit", area: "chest", deficit: 1 },
      { code: "area_deficit", area: "back", deficit: 1 },
    ]);
    expect(removeItem(W, "bench-press").sessionReasons).toEqual([
      { code: "area_deficit", area: "back", deficit: 1 },
      { code: "area_deficit", area: "quads", deficit: 1 },
    ]);
    for (const item of W_E3.plan.items) {
      const r = removeItem(W_E3, item.exerciseId);
      expect(r.sessionReasons, item.exerciseId).toContainEqual({
        code: "recovering_skipped",
        area: "quads",
      });
      expect(r.sessionReasons.slice(0, 2), item.exerciseId).toEqual(
        W_E3.sessionReasons.slice(0, 2),
      );
    }
  });

  it("rule-12.2 (AC5) nothing is added back when the rule 10 cap of 3 had left an area out", () => {
    // 60 min, zero history: more than 3 distinct first primary areas, so rule 10 cut some.
    const big = run(input({ budgetMin: 60 }));
    const firstAreas = big.plan.items.map(
      (i) => i.reasons.find((x) => x.code === "area_deficit") as { area: string },
    );
    expect(new Set(firstAreas.map((r) => r.area)).size).toBeGreaterThan(3);
    for (const item of big.plan.items) {
      const r = removeItem(big, item.exerciseId);
      for (const reason of r.sessionReasons) expect(big.sessionReasons).toContainEqual(reason);
      expect(r.sessionReasons.length).toBeLessThanOrEqual(big.sessionReasons.length);
    }
  });

  it("R12-E15 rule-12.2 (AC6) remove the last item: [] and unusedS = available", () => {
    const r = removeItem(W_E2, "bench-press");
    expect(r.plan.items).toEqual([]);
    expect([r.itemsTotalS, r.totalS, r.unusedS]).toEqual([0, WARMUP_COST_S, 720]);
    expect(r.unusedS).toBe(availableS(15, true));
    expect(r.plan.mainLiftId).toBeNull();
    expect(r.sessionReasons).toEqual([]);
  });

  it("R12-E16 rule-12.2 (AC7) over budget stays honest: 1665 → remove inverted-row → 1110", () => {
    const r = removeItem(W_E11, "inverted-row");
    // 720 + 390 = 1110; + 180 = 1290; 1620 − 1110 = 510.
    expect([r.itemsTotalS, r.totalS, r.unusedS]).toEqual([1110, 1290, 510]);
    expect(r.plan.items.map((i) => i.exerciseId)).toEqual(["bench-press", "back-squat"]);
  });

  it("rule-12.2 (AC7) still over budget after a removal: unusedS is 0, never negative", () => {
    // 720 + 720 + 555 + 270 = 2265 > 1620. Without leg-extension: 1995, still > 1620.
    const over = sessionOf([
      ["bench-press", 4, true],
      ["back-squat", 4],
      ["inverted-row", 3],
      ["leg-extension", 2],
    ]);
    expect([over.itemsTotalS, over.unusedS]).toEqual([2265, 0]);
    const r = removeItem(over, "leg-extension");
    expect([r.itemsTotalS, r.totalS, r.unusedS]).toEqual([1995, 2175, 0]);
    // Items without an `area_deficit` reason (hand-built plan) cover no area (rule 12.2).
    expect(r.sessionReasons).toEqual([]);
  });

  it("rule-12.2 (AC8) an id that isn't an item is a RangeError (incl. a warm-up move)", () => {
    const warmupId = W.plan.warmup[0]?.exerciseId as string;
    expect(warmupId).toMatch(/^wu-/);
    for (const id of ["plank", warmupId, "", "not-in-library"]) {
      expect(() => removeItem(W, id), id).toThrow(RangeError);
    }
    expect(() => removeItem(removeItem(W_E2, "bench-press"), "bench-press")).toThrow(RangeError);
  });

  it("rule-12.2 (AC8) pure: a deep-frozen input is not mutated; two calls are deep-equal", () => {
    const frozen = deepFreeze(structuredClone(W_E11));
    const snapshot = structuredClone(frozen);
    for (const item of frozen.plan.items) {
      const a = removeItem(frozen, item.exerciseId);
      const b = removeItem(frozen, item.exerciseId);
      expect(a).toStrictEqual(b);
      expect(a).not.toBe(b);
      // No shared references with the input: the result is safe to mutate.
      expect(a.plan.warmup).not.toBe(frozen.plan.warmup);
      expect(a.plan.startDeficits).not.toBe(frozen.plan.startDeficits);
      a.plan.items.forEach((it) => expect(frozen.plan.items).not.toContain(it));
    }
    expect(frozen).toStrictEqual(snapshot);
  });
});

describe("rule 12.2 planted fault: the old Remove refills the slot (D-0065 §4, GitHub #33)", () => {
  it("rule-12.2 re-suggesting with excludeIds refills; removeItem does not", () => {
    // The pre-D-0191 Remove: suggest again with the id excluded. Rule 7.2 refills the freed
    // time from the same lowest-r area, so the no-refill check must go red on it.
    const resuggested = run(input({ excludeIds: ["leg-extension"] }));
    expect(refillViolation(W, resuggested, "leg-extension")).not.toBeNull();
    expect(refillViolation(W, removeItem(W, "leg-extension"), "leg-extension")).toBeNull();
  });
});

/** T-0230 (D-0096): sweeps and seeded runs carry an explicit runtime budget. */
const SWEEP_TIMEOUT_MS = 30_000;
const BUDGETS = [15, 30, 90] as const;
const ENERGIES: readonly Energy[] = ["low", "normal", "high"];
const HISTORIES: Array<[string, HistorySet[]]> = [
  ["zero", []],
  ...Object.entries(SIMULATED_HISTORIES).map(([k, h]): [string, HistorySet[]] => [k, h]),
];

/** Rule 12.2's invariants for one removal; used by the simulated histories and the property run. */
function checkRemoval(w: Workout, id: string, label: string): Workout {
  const r = removeItem(w, id);
  expect(refillViolation(w, r, id), label).toBeNull();
  const removed = w.plan.items.find((i) => i.exerciseId === id);
  const sum = r.plan.items.reduce((s, i) => s + i.costS, 0);
  const available = availableS(w.budgetMin, w.warmupInBudget);
  expect(r.itemsTotalS, label).toBe(sum);
  expect(r.itemsTotalS, label).toBe(w.itemsTotalS - (removed?.costS ?? NaN));
  expect(r.totalS, label).toBe(sum + WARMUP_COST_S);
  expect(r.unusedS, label).toBe(Math.max(0, available - sum));
  expect(r.unusedS, label).toBeGreaterThanOrEqual(w.unusedS);
  expect(r.plan.mainLiftId, label).toBe(removed?.isMain ? null : w.plan.mainLiftId);
  for (const reason of r.sessionReasons) expect(w.sessionReasons, label).toContainEqual(reason);
  expect(
    r.sessionReasons.filter((x) => x.code === "recovering_skipped"),
    label,
  ).toEqual(w.sessionReasons.filter((x) => x.code === "recovering_skipped"));
  expect(removeItem(w, id), label).toStrictEqual(r);
  return r;
}

describe("rule 12.2 over the simulated 14-day histories (engine-rules §Required tests)", () => {
  it(
    "rule-12.2 sweep: every item of every suggested workout, then removed down to empty",
    () => {
      let removals = 0;
      for (const [name, history] of HISTORIES) {
        for (const budgetMin of BUDGETS) {
          for (const warmupInBudget of [true, false]) {
            for (const energy of ENERGIES) {
              const si = input({ budgetMin, warmupInBudget, energy });
              const w = deepFreeze(run(si, history));
              const label = `${name}/${budgetMin}/${warmupInBudget}/${energy}`;
              for (const item of w.plan.items) {
                checkRemoval(w, item.exerciseId, `${label}/${item.exerciseId}`);
                removals++;
              }
              // Remove front to back until the plan is empty: never refills, ends at available.
              let cur: Workout = w;
              while (cur.plan.items.length > 0) {
                cur = checkRemoval(cur, cur.plan.items[0]!.exerciseId, `${label}/drain`);
              }
              expect(cur.unusedS, label).toBe(availableS(budgetMin, warmupInBudget));
              expect(
                cur.sessionReasons.every((x) => x.code === "recovering_skipped"),
                label,
              ).toBe(true);
            }
          }
        }
      }
      expect(removals).toBeGreaterThan(200);
    },
    SWEEP_TIMEOUT_MS,
  );
});

describe("rule 12.2 property run (seeded, D-0036 §5)", () => {
  it(
    "rule-12.2 never refills, never negative unusedS, same input gives the same output",
    () => {
      for (let seed = 1; seed <= 60; seed++) {
        const rand = mulberry32(seed);
        const history = randomHistory(rand);
        const budgetMin = 15 + 5 * Math.floor(rand() * 22);
        const si = input({
          budgetMin,
          warmupInBudget: rand() < 0.5,
          energy: ENERGIES[Math.floor(rand() * 3)]!,
          shuffle: Math.floor(rand() * 4),
        });
        const w = deepFreeze(run(si, history));
        for (const item of w.plan.items) {
          const r = checkRemoval(w, item.exerciseId, `seed ${seed}/${item.exerciseId}`);
          expect(r.unusedS).toBeGreaterThanOrEqual(0);
        }
      }
    },
    SWEEP_TIMEOUT_MS,
  );
});

describe("rule 12.2 contract text (docs/engine-rules.md, D-0191 §4)", () => {
  it("rule-12.2 the rules doc has rule 12.2, R12-E13…E16 and the traceability row", () => {
    const doc = readFileSync(path.join(REPO_DIR, "docs", "engine-rules.md"), "utf8");
    expect(doc).toContain("### 12.2 removeItem (UF-08.2, D-0191 §4)");
    for (const e of ["R12-E13", "R12-E14", "R12-E15", "R12-E16"]) {
      expect(doc).toContain(`- **${e} `);
    }
    expect(doc).toContain("| 12.2 removeItem (R12-E13…E16, D-0191 §4) | T-0519 |");
    const r122 = doc.indexOf("### 12.2");
    expect(r122).toBeGreaterThan(doc.indexOf("### 12.1"));
    expect(r122).toBeLessThan(doc.indexOf("## 13."));
  });
});
