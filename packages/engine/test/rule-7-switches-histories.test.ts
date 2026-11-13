// T-0936 UF-08.2 (D-0237, D-0239 §14): the simulated 14-day histories with the rule 7.2
// switches `autoMainLift` / `fill`, R7-E8's caps and R0-E1 with random switches, and the B5
// "fits by construction" property for the empty-start suggestion taps. fast-check isn't in the
// lockfile (D-0036 §5), so the seeded mulberry32 harness drives every random case and a failure
// reports its seed.
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
} from "@workoutlab/engine";
import { F_PROFILE, F_TARGETS, L1, LIBRARY, NOW, TZ, input, itemsOf } from "./fixtures/common.js";
import {
  SIMULATED_HISTORIES,
  allChestNoLegsHistory,
  balancedHistory,
  returningAfter10DaysHistory,
} from "./fixtures/histories.js";
import { mulberry32 } from "./fixtures/random.js";

/** T-0230: seeded and sweep tests get a ≥ 30 s runtime budget. */
const BUDGET_MS = 60_000;
const SEED = 936_000;

const HISTORIES: ReadonlyArray<readonly [string, readonly HistorySet[]]> = [
  ["zero", []],
  ["balanced", SIMULATED_HISTORIES.balanced],
  ["allChestNoLegs", SIMULATED_HISTORIES.allChestNoLegs],
  ["returningAfter10Days", SIMULATED_HISTORIES.returningAfter10Days],
  ["offlineMerged", SIMULATED_HISTORIES.offlineMerged],
];
const BUDGETS = Array.from({ length: 22 }, (_, i) => 15 + 5 * i);
const ENERGIES: readonly Energy[] = ["low", "normal", "high"];
const SHUFFLES = [0, 1, 2, 3, 4, 5, 6];
const LIB = new Map(LIBRARY.map((e) => [e.id, e]));
const L1_IDS = L1.map((e) => e.id);

function run(history: readonly HistorySet[], si: SessionInput): Workout {
  return suggest(history, F_TARGETS, F_PROFILE, LIBRARY, si, NOW, TZ);
}

/** Every grid point of AC11/AC12: budgets × warm-up × energy × shuffle. */
function* grid(): Generator<SessionInput> {
  for (const budgetMin of BUDGETS) {
    for (const warmupInBudget of [true, false]) {
      for (const energy of ENERGIES) {
        for (const shuffle of SHUFFLES) yield input({ budgetMin, warmupInBudget, energy, shuffle });
      }
    }
  }
}

/** R7-E8's caps: Σ cost ≤ available, ≤ 8 items, ≤ 2 per primary area, no duplicate id. */
function expectCaps(w: Workout, si: SessionInput, label: string): void {
  const items = w.plan.items;
  const sum = items.reduce((s, i) => s + i.costS, 0);
  expect(sum, `${label} Σ cost`).toBeLessThanOrEqual(
    Math.max(0, availableS(si.budgetMin, si.warmupInBudget)),
  );
  expect(sum, `${label} itemsTotalS`).toBe(w.itemsTotalS);
  expect(items.length, `${label} items`).toBeLessThanOrEqual(8);
  const perArea = new Map<string, number>();
  for (const i of items) {
    for (const a of primaryAreas(LIB.get(i.exerciseId) as LibraryExercise)) {
      perArea.set(a, (perArea.get(a) ?? 0) + 1);
    }
  }
  for (const [a, n] of perArea) expect(n, `${label} ${a}`).toBeLessThanOrEqual(2);
  expect(new Set(items.map((i) => i.exerciseId)).size, `${label} unique`).toBe(items.length);
}

describe("rule 7.2 switches over the simulated 14-day histories (D-0239 §14)", () => {
  it(
    "rule-7 (AC11) sweep: 5 histories × budgets 15..120 × warm-up × energy × shuffle 0..6, absent deep-equals both true",
    () => {
      let cases = 0;
      for (const [name, h] of HISTORIES) {
        for (const si of grid()) {
          const label = `${name} ${si.budgetMin} ${si.warmupInBudget} ${si.energy} ${si.shuffle}`;
          expect(run(h, { ...si, autoMainLift: true, fill: true }), label).toEqual(run(h, si));
          cases++;
        }
      }
      expect(cases).toBe(5 * 22 * 2 * 3 * 7);
    },
    BUDGET_MS,
  );

  it(
    "rule-7 (AC12) sweep: the same grid with both switches false, no pins and no mainLiftId gives items []",
    () => {
      for (const [name, h] of HISTORIES) {
        for (const si of grid()) {
          const label = `${name} ${si.budgetMin} ${si.warmupInBudget} ${si.energy} ${si.shuffle}`;
          const w = run(h, { ...si, autoMainLift: false, fill: false });
          expect(w.plan.items, label).toEqual([]);
          expect(w.plan.mainLiftId, label).toBeNull();
          expect(w.itemsTotalS, label).toBe(0);
          expect(w.unusedS, label).toBe(Math.max(0, availableS(si.budgetMin, si.warmupInBudget)));
        }
      }
    },
    BUDGET_MS,
  );

  it("rule-7 (AC13) R7-E30 returning after 10 days: R7-E30's items as picks with both switches off give R7-E30's items", () => {
    const full = run(returningAfter10DaysHistory, input());
    expect(itemsOf(full)).toEqual([
      ["bench-press", 4],
      ["inverted-row", 3],
      ["calf-raise", 2],
    ]);
    const main = full.plan.items.find((i) => i.isMain);
    const picks = full.plan.items.filter((i) => !i.isMain).map((i) => i.exerciseId);
    const plan = run(
      returningAfter10DaysHistory,
      input({
        mainLiftId: main?.exerciseId ?? null,
        pinnedIds: picks,
        autoMainLift: false,
        fill: false,
      }),
    );
    expect(itemsOf(plan)).toEqual(itemsOf(full));
    expect(plan.plan.items.map((i) => i.isMain)).toEqual([true, false, false]);
    expect(plan.itemsTotalS).toBe(1545);
    expect(plan.unusedS).toBe(75);
  });

  it(
    "rule-7 (AC14) R7-E8 seeded: random switches, pins and mainLiftId over every history and budget keep the caps",
    () => {
      const pick = <T>(rand: () => number, xs: readonly T[]): T =>
        xs[Math.floor(rand() * xs.length)] as T;
      const SWITCH = [undefined, true, false] as const;
      for (const [name, h] of HISTORIES) {
        for (const budgetMin of BUDGETS) {
          for (const warmupInBudget of [true, false]) {
            const seed =
              SEED +
              14_000 +
              HISTORIES.findIndex(([n]) => n === name) * 1000 +
              budgetMin * 2 +
              (warmupInBudget ? 1 : 0);
            const rand = mulberry32(seed);
            const pinnedIds = L1_IDS.filter(() => rand() < 0.25);
            for (let i = pinnedIds.length - 1; i > 0; i--) {
              const j = Math.floor(rand() * (i + 1));
              [pinnedIds[i], pinnedIds[j]] = [pinnedIds[j] as string, pinnedIds[i] as string];
            }
            const autoMainLift = pick(rand, SWITCH);
            const fill = pick(rand, SWITCH);
            const si = input({
              ...(autoMainLift === undefined ? {} : { autoMainLift }),
              ...(fill === undefined ? {} : { fill }),
              budgetMin,
              warmupInBudget,
              energy: pick(rand, ENERGIES),
              shuffle: Math.floor(rand() * 7),
              mainLiftId: rand() < 0.4 ? pick(rand, L1_IDS) : null,
              pinnedIds,
            });
            expectCaps(run(h, si), si, `seed ${seed} ${name} ${JSON.stringify(si)}`);
          }
        }
      }
    },
    BUDGET_MS,
  );

  it(
    "rule-7 (AC15) R0-E1 seeded: with the switches set, suggest twice gives deep-equal results",
    () => {
      for (let i = 0; i < 300; i++) {
        const seed = SEED + 15_000 + i;
        const rand = mulberry32(seed);
        const [name, h] = HISTORIES[
          Math.floor(rand() * HISTORIES.length)
        ] as (typeof HISTORIES)[number];
        const si = input({
          budgetMin: BUDGETS[Math.floor(rand() * BUDGETS.length)] as number,
          warmupInBudget: rand() < 0.5,
          energy: ENERGIES[Math.floor(rand() * 3)] as Energy,
          shuffle: Math.floor(rand() * 7),
          mainLiftId: rand() < 0.4 ? (L1_IDS[Math.floor(rand() * L1_IDS.length)] as string) : null,
          pinnedIds: L1_IDS.filter(() => rand() < 0.2),
          autoMainLift: rand() < 0.5,
          fill: rand() < 0.5,
        });
        expect(run(h, si), `seed ${seed} ${name}`).toEqual(run(h, si));
      }
    },
    BUDGET_MS,
  );
});

// ---- AC16: B5, fits by construction (spec "How the plan and the suggestions are computed") ----

/**
 * "first" / "last": always that row. "seeded": a PRNG row with a PRNG `shuffle`. "seeded-add":
 * as "seeded", after one UF-08.5 Add of a PRNG L1 exercise kept by the plan call, so the auto
 * main lift can crowd a pick out and the D-0239 §3 fallback call runs.
 */
type Strategy = "first" | "last" | "seeded" | "seeded-add";

interface Visit {
  mainPickId: string | null;
  addedIds: string[];
}

/** The spec's plan call: both switches off, the picks and the user's main lift, shuffle 0. */
function planCall(h: readonly HistorySet[], base: SessionInput, v: Visit): Workout {
  return run(h, {
    ...base,
    shuffle: 0,
    mainLiftId: v.mainPickId,
    pinnedIds: [...v.addedIds],
    autoMainLift: false,
    fill: false,
  });
}

/**
 * The spec's suggestions call (and its fallback when an id in the current plan is missing,
 * D-0239 §3). Returns the result the rows come from.
 */
function suggestionsCall(
  h: readonly HistorySet[],
  base: SessionInput,
  v: Visit,
  shuffle: number,
  planIds: ReadonlySet<string>,
): { w: Workout; fallback: boolean } {
  const first = run(h, {
    ...base,
    shuffle,
    mainLiftId: v.mainPickId,
    pinnedIds: [...v.addedIds],
    autoMainLift: v.mainPickId === null,
    fill: true,
  });
  const ids = new Set(first.plan.items.map((i) => i.exerciseId));
  if ([...planIds].every((id) => ids.has(id))) return { w: first, fallback: false };
  const w = run(h, {
    ...base,
    shuffle,
    mainLiftId: null,
    pinnedIds: [...v.addedIds],
    autoMainLift: false,
    fill: true,
  });
  return { w, fallback: true };
}

/** Runs one tap sequence of ≤ 8 taps and checks B5 after every tap. Returns the taps made. */
function tapSequence(
  h: readonly HistorySet[],
  base: SessionInput,
  strategy: Strategy,
  rand: () => number,
  label: string,
): { taps: number; fallbacks: number } {
  const v: Visit = { mainPickId: null, addedIds: [] };
  let plan = planCall(h, base, v);
  expect(plan.plan.items, `${label} empty start`).toEqual([]);
  if (strategy === "seeded-add") {
    const id = L1_IDS[Math.floor(rand() * L1_IDS.length)] as string;
    const added = planCall(h, base, { mainPickId: null, addedIds: [id] });
    if (added.plan.items.some((i) => i.exerciseId === id)) {
      v.addedIds.push(id);
      plan = added;
    }
  }
  let fallbacks = 0;
  let taps = 0;
  for (; taps < 8; taps++) {
    const planIds = new Set(plan.plan.items.map((i) => i.exerciseId));
    const seeded = strategy === "seeded" || strategy === "seeded-add";
    const shuffle = seeded ? Math.floor(rand() * 7) : 0;
    const { w, fallback } = suggestionsCall(h, base, v, shuffle, planIds);
    if (fallback) fallbacks++;
    // The rows: the result's items not in the plan, in engine order.
    const rows = w.plan.items.filter((i) => !planIds.has(i.exerciseId));
    if (rows.length === 0) break;
    const row =
      strategy === "first"
        ? rows[0]
        : strategy === "last"
          ? rows[rows.length - 1]
          : rows[Math.floor(rand() * rows.length)];
    if (row === undefined) break;
    if (row.isMain) v.mainPickId = row.exerciseId;
    else v.addedIds.push(row.exerciseId);
    plan = planCall(h, base, v);
    const step = `${label} tap ${taps + 1} (${row.exerciseId}${row.isMain ? ", main" : ""}) picks ${JSON.stringify(v)}`;
    const ids = plan.plan.items.map((i) => i.exerciseId);
    // No tap is refused: the new item, every earlier pick and the main lift are all in.
    expect(ids, `${step} new item`).toContain(row.exerciseId);
    for (const id of v.addedIds) expect(ids, `${step} pick ${id}`).toContain(id);
    if (v.mainPickId !== null) {
      expect(plan.plan.mainLiftId, `${step} main`).toBe(v.mainPickId);
      expect(plan.plan.items[0]?.isMain, `${step} main first`).toBe(true);
    }
    // Nothing but the picks: the plan call adds nothing of its own.
    expect(ids.length, `${step} only picks`).toBe(v.addedIds.length + (v.mainPickId ? 1 : 0));
    expectCaps(plan, base, step);
  }
  return { taps, fallbacks };
}

describe("B5 fits by construction (D-0238 §3, D-0239 §5, §14)", () => {
  it("rule-7 (AC16) seeded B5 property: up to 8 suggestion taps (first, last, seeded row, after an Add) never refuse a tap", () => {
    const B5_HISTORIES: ReadonlyArray<readonly [string, readonly HistorySet[]]> = [
      ["zero", []],
      ["balanced", balancedHistory],
      ["allChestNoLegs", allChestNoLegsHistory],
      ["returningAfter10Days", returningAfter10DaysHistory],
    ];
    let sequences = 0;
    let totalTaps = 0;
    let totalFallbacks = 0;
    let caseNo = 0;
    for (const [name, h] of B5_HISTORIES) {
      for (const budgetMin of BUDGETS) {
        for (const warmupInBudget of [true, false]) {
          for (const energy of ENERGIES) {
            const base = input({ budgetMin, warmupInBudget, energy });
            for (const strategy of ["first", "last", "seeded", "seeded-add"] as const) {
              const seed = SEED + 16_000 + caseNo++;
              const label = `seed ${seed} ${name} ${budgetMin} min warm-up ${warmupInBudget} ${energy} ${strategy}`;
              const r = tapSequence(h, base, strategy, mulberry32(seed), label);
              sequences++;
              totalTaps += r.taps;
              totalFallbacks += r.fallbacks;
            }
          }
        }
      }
    }
    expect(sequences).toBe(4 * 22 * 2 * 3 * 4);
    // Not vacuous: plenty of taps were made, and the fallback call was exercised.
    expect(totalTaps).toBeGreaterThan(sequences * 2);
    expect(totalFallbacks).toBeGreaterThan(0);
  }, 120_000);

  it("rule-7 (AC16) the fallback call: at 15 min the auto main lift crowds out a leg-extension pick, autoMainLift false keeps it", () => {
    const base = input({ budgetMin: 15 });
    const v: Visit = { mainPickId: null, addedIds: ["leg-extension"] };
    const plan = planCall([], base, v);
    expect(itemsOf(plan)).toEqual([["leg-extension", 3]]);
    const { w, fallback } = suggestionsCall([], base, v, 0, new Set(["leg-extension"]));
    expect(fallback).toBe(true);
    expect(w.plan.mainLiftId).toBeNull();
    expect(itemsOf(w)[0]).toEqual(["leg-extension", 3]);
    expect(w.plan.items.length).toBeGreaterThan(1);
  });

  it("rule-7 (AC16) B3 at zero history: taking the main lift first leaves inverted-row × 3 and leg-extension × 2 as rows", () => {
    const base = input();
    const v: Visit = { mainPickId: "bench-press", addedIds: [] };
    const plan = planCall([], base, v);
    expect(itemsOf(plan)).toEqual([["bench-press", 4]]);
    expect(plan.unusedS).toBe(900);
    const { w, fallback } = suggestionsCall([], base, v, 0, new Set(["bench-press"]));
    expect(fallback).toBe(false);
    expect(itemsOf(w).slice(1)).toEqual([
      ["inverted-row", 3],
      ["leg-extension", 2],
    ]);
  });
});
