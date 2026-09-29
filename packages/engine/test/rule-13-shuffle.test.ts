// T-0204 UF-08.2: rule 13 deterministic shuffle inside suggest(). AC13–AC23.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  availableS,
  isEligible,
  normalizeHistory,
  primaryAreas,
  rankSwaps,
  recoveringAreas,
  suggest,
  type Energy,
  type HistorySet,
  type LibraryExercise,
  type SessionInput,
  type Workout,
  type WorkoutItem,
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
} from "./fixtures/common.js";
import {
  SIMULATED_HISTORIES,
  allChestNoLegsHistory,
  balancedHistory,
  offlineMergedHistory,
  offlineQueue,
  returningAfter10DaysHistory,
} from "./fixtures/histories.js";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const BASELINE = JSON.parse(
  readFileSync(path.join(TEST_DIR, "fixtures", "pre-t0204-suggest.json"), "utf8"),
) as Record<string, Workout>;

/**
 * T-0205 (rule 14, AC22, D-0062 §6): the only baseline fields rule 14 changes at F-input.
 * returningAfter10Days last did bench-press and calf-raise on 09-12 (gap 15), so both are
 * `hold_after_break` at 50 kg. Every other field of the baseline is still compared exactly.
 */
const T0205_PREFILL: Record<string, Record<string, WorkoutItem["prefill"]>> = {
  returningAfter10Days: {
    "bench-press": { weightKg: 50, reps: 6, durationS: null, kind: "hold_after_break" },
    "calf-raise": { weightKg: 50, reps: 10, durationS: null, kind: "hold_after_break" },
  },
};

function withRule14(name: string, before: Workout | undefined): Workout | undefined {
  const patch = T0205_PREFILL[name];
  if (before === undefined || patch === undefined) return before;
  const items = before.plan.items.map((i) => {
    const pf = patch[i.exerciseId];
    if (pf === undefined) return i;
    const reasons = i.reasons.map((r) => (r.code === "prefill" ? { ...r, kind: pf.kind } : r));
    return { ...i, prefill: pf, reasons };
  });
  expect(items.map((i) => i.exerciseId)).toEqual(expect.arrayContaining(Object.keys(patch)));
  return { ...before, plan: { ...before.plan, items } };
}

const HISTORIES: Array<[string, HistorySet[]]> = [
  ["zero", []],
  ...Object.entries(SIMULATED_HISTORIES).map(([k, h]): [string, HistorySet[]] => [k, h]),
];
const ENERGIES: Energy[] = ["normal", "low", "high"];

function run(
  history: readonly HistorySet[],
  si: SessionInput = input(),
  library: readonly LibraryExercise[] = LIBRARY,
): Workout {
  return suggest(history, F_TARGETS, F_PROFILE, library, si, NOW, TZ);
}

const hasSwap = (i: WorkoutItem): boolean => i.reasons.some((r) => r.code === "swap");
const swapped = (w: Workout): string[] => w.plan.items.filter(hasSwap).map((i) => i.exerciseId);

function item(w: Workout, id: string): WorkoutItem {
  const found = w.plan.items.find((i) => i.exerciseId === id);
  if (found === undefined) throw new Error(`no ${id} in plan`);
  return found;
}

describe("rule 13 shuffle = 0", () => {
  it("rule-13 (AC13) shuffle 0 deep-equals the pre-T-0204 suggest output for every history and energy", () => {
    for (const [name, history] of HISTORIES) {
      for (const energy of ENERGIES) {
        const w = run(history, input({ energy }));
        const before = withRule14(name, BASELINE[`${name}/${energy}`]);
        expect(before, `${name}/${energy}`).toBeDefined();
        expect(w, `${name}/${energy}`).toEqual(before);
        expect(swapped(w), `${name}/${energy}`).toEqual([]);
      }
    }
  });

  it("rule-13 (AC13) the R7-E4 plan is unchanged at shuffle 0", () => {
    const w = run([]);
    expect(itemsOf(w)).toEqual([
      ["bench-press", 4],
      ["inverted-row", 3],
      ["leg-extension", 2],
    ]);
    expect(w.itemsTotalS).toBe(1545);
  });
});

describe("rule 13 examples", () => {
  it("R13-E1 rule-13 (AC14) n = 1: barbell-row replaces inverted-row; back-squat doesn't fit", () => {
    const w = run([], input({ shuffle: 1 }));
    expect(itemsOf(w)).toEqual([
      ["bench-press", 4],
      ["barbell-row", 3],
      ["leg-extension", 2],
    ]);
    expect(w.plan.items[0]?.isMain).toBe(true);
    expect([w.itemsTotalS, w.totalS, w.unusedS]).toEqual([1545, 1725, 75]);
    expect(item(w, "barbell-row").reasons).toContainEqual({ code: "swap", reason: null });
    expect(hasSwap(item(w, "leg-extension"))).toBe(false);
    expect(hasSwap(item(w, "bench-press"))).toBe(false);
    // The shuffle lists behind the result, as rankSwaps' variety ranking of the originals.
    const base = run([]);
    const back = rankSwaps("inverted-row", "variety", base, F_PROFILE, LIBRARY, [], NOW, TZ);
    expect(["inverted-row", ...back.map((c) => c.exerciseId)]).toEqual([
      "inverted-row",
      "barbell-row",
      "db-row",
      "lat-pulldown",
      "seated-cable-row",
      "straight-arm-pulldown",
    ]);
    expect(back.map((c) => c.muscleMatch)).toEqual([0.75, 0.75, 0.75, 0.75, 0.5]);
    const quads = rankSwaps("leg-extension", "variety", w, F_PROFILE, LIBRARY, [], NOW, TZ);
    expect(quads.map((c) => [c.exerciseId, c.timeCostS, c.fitsBudget])).toEqual([
      ["back-squat", 390, false],
    ]);
  });

  it("R13-E2 rule-13 (AC15) n = 2 picks db-row; n = 6 is the R7-E4 plan exactly", () => {
    const two = run([], input({ shuffle: 2 }));
    expect(itemsOf(two)).toEqual([
      ["bench-press", 4],
      ["db-row", 3],
      ["leg-extension", 2],
    ]);
    expect(two.itemsTotalS).toBe(1545);
    expect(swapped(two)).toEqual(["db-row"]);
    const six = run([], input({ shuffle: 6 }));
    expect(six).toEqual(run([]));
    expect(swapped(six)).toEqual([]);
  });

  it("rule-13 (AC16) the main lift is never shuffled, for shuffle 0…12", () => {
    for (let n = 0; n <= 12; n++) {
      const w = run([], input({ shuffle: n }));
      expect(w.plan.mainLiftId, `n=${n}`).toBe("bench-press");
      expect(w.plan.items[0]?.exerciseId).toBe("bench-press");
      expect(w.plan.items[0]?.sets).toBe(4);
      expect(w.plan.items[0]?.isMain).toBe(true);
      for (const i of w.plan.items) if (i.isMain) expect(hasSwap(i)).toBe(false);
    }
  });

  it("rule-13 (AC17) a pinned slot is skipped; the other accessory still shuffles", () => {
    const w = run([], input({ pinnedIds: ["biceps-curl"], shuffle: 1 }));
    expect(itemsOf(w)).toEqual([
      ["bench-press", 4],
      ["biceps-curl", 3],
      ["barbell-row", 2],
    ]);
    expect(hasSwap(item(w, "biceps-curl"))).toBe(false);
    expect(item(w, "barbell-row").reasons).toContainEqual({ code: "swap", reason: null });
    expect(item(w, "barbell-row").costS).toBe(390);
    expect([w.itemsTotalS, w.unusedS]).toEqual([1485, 135]);
  });

  it("rule-13 (AC17) pinned at shuffle 0 is the T-0201a AC11 plan exactly", () => {
    const w = run([], input({ pinnedIds: ["biceps-curl"], shuffle: 0 }));
    expect(itemsOf(w)).toEqual([
      ["bench-press", 4],
      ["biceps-curl", 3],
      ["inverted-row", 2],
    ]);
    expect([w.itemsTotalS, w.unusedS]).toEqual([1485, 135]);
    expect(swapped(w)).toEqual([]);
  });

  it("rule-13 (AC18) a shuffled item's reasons, reps, cost and pre-fill", () => {
    const w = run([], input({ shuffle: 1 }));
    const row = item(w, "barbell-row");
    expect(row.reasons).toEqual([
      { code: "area_deficit", area: "back", deficit: 1 },
      { code: "days_since", area: "back", days: null },
      { code: "swap", reason: null },
      { code: "prefill", kind: "first_time" },
    ]);
    expect([row.repsMin, row.repsMax, row.costS]).toEqual([8, 12, 555]);
    expect(row.prefill).toEqual({ weightKg: null, reps: 8, durationS: null, kind: "first_time" });
    expect(w.sessionReasons.map((r) => (r.code === "area_deficit" ? r.area : r.code))).toEqual([
      "chest",
      "back",
      "quads",
    ]);
  });

  it("rule-13 (AC20) shuffle runs before energy: Low trims the shuffled exercise", () => {
    const w = run([], input({ shuffle: 1, energy: "low" }));
    expect(itemsOf(w)).toEqual([
      ["bench-press", 4],
      ["barbell-row", 2],
      ["leg-extension", 2],
    ]);
    expect(item(w, "barbell-row").reasons).toEqual([
      { code: "area_deficit", area: "back", deficit: 1 },
      { code: "days_since", area: "back", days: null },
      { code: "swap", reason: null },
      { code: "energy_low_trim" },
      { code: "prefill", kind: "first_time" },
    ]);
    expect(w.itemsTotalS).toBe(1380);
  });

  it("rule-13 (AC20) with no accessory, High still backs off the main lift as in R7-E12", () => {
    const si = input({ shuffle: 2, budgetMin: 15, warmupInBudget: false, energy: "high" });
    const w = run([], si);
    expect(itemsOf(w)).toEqual([["bench-press", 4]]);
    expect(item(w, "bench-press").backoff).toEqual({ weightKg: null, reps: 6 });
    expect(item(w, "bench-press").reasons).toContainEqual({ code: "energy_high_backoff" });
    expect(w).toEqual(run([], { ...si, shuffle: 0 }));
  });
});

// ---- AC19: the rule 7.2 invariants hold after a shuffle ----

const LIB = new Map(LIBRARY.map((e) => [e.id, e]));

function checkInvariants(
  history: readonly HistorySet[],
  si: SessionInput,
  w: Workout,
  library: ReadonlyMap<string, LibraryExercise> = LIB,
): void {
  const available = availableS(si.budgetMin, si.warmupInBudget);
  const items = w.plan.items;
  const sum = items.reduce((s, i) => s + i.costS, 0);
  expect(sum).toBeLessThanOrEqual(Math.max(0, available));
  expect(items.length).toBeLessThanOrEqual(8);
  const recovering = new Set(recoveringAreas(history, [...library.values()], NOW));
  const perArea = new Map<string, number>();
  for (const i of items) {
    const ex = library.get(i.exerciseId) as LibraryExercise;
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
}

describe("rule 13 keeps the rule 7.2 invariants", () => {
  const GLUTE_BRIDGE: LibraryExercise = {
    id: "glute-bridge",
    name: "Glute bridge",
    kind: "exercise",
    type: "isolation",
    level: "beginner",
    equipment: [],
    areas: { glutes: 1 },
    timed: false,
    defaultDurationS: null,
    incrementKg: null,
    externalLoad: false,
  };

  it("rule-13 (AC19) a pick that would put an area over 2 primary items leaves the original", () => {
    const library = [...LIBRARY, GLUTE_BRIDGE];
    const si = input({ budgetMin: 90, pinnedIds: ["hip-thrust", "glute-bridge"] });
    const base = run([], si, library);
    // glutes already has 2 items (both pinned); the leg-extension slot's only alternative is
    // back-squat (quads + glutes), which fits the budget but would make glutes 3.
    expect(itemsOf(base).map(([id]) => id)).toEqual(
      expect.arrayContaining(["hip-thrust", "glute-bridge", "leg-extension"]),
    );
    const alt = rankSwaps("leg-extension", "variety", base, F_PROFILE, library, [], NOW, TZ);
    expect(alt.map((c) => [c.exerciseId, c.fitsBudget])).toEqual([["back-squat", true]]);
    const w = run([], { ...si, shuffle: 1 }, library);
    expect(item(w, "leg-extension").sets).toBe(item(base, "leg-extension").sets);
    expect(hasSwap(item(w, "leg-extension"))).toBe(false);
    expect(w.plan.items.map((i) => i.exerciseId)).not.toContain("back-squat");
    // The other accessory slots still shuffle in the same run.
    expect(swapped(w)).toEqual(["barbell-row", "leg-curl", "lateral-raise"]);
    checkInvariants([], { ...si, shuffle: 1 }, w, new Map(library.map((e) => [e.id, e])));
  });

  it("rule-13 (AC19) a candidate with a recovering area at weight 1.0 is never picked", () => {
    // 6 hip-thrust sets 24 h ago: glutes recovering, so back-squat (glutes 1.0) is out. A small
    // library leaves the budget room, so back-squat would otherwise fit the leg-extension slot.
    const keep = new Set([
      "bench-press",
      "inverted-row",
      "leg-extension",
      "back-squat",
      "hip-thrust",
    ]);
    const library = LIBRARY.filter((e) => e.kind === "warmup" || keep.has(e.id));
    const history = setsAt(6, "hip-thrust", shift(NOW, -24 * HOUR));
    const si = input({ budgetMin: 60, warmupInBudget: false, shuffle: 1 });
    const base = run(history, { ...si, shuffle: 0 }, library);
    expect(itemsOf(base).map(([id]) => id)).toContain("leg-extension");
    expect(
      rankSwaps("leg-extension", "variety", base, F_PROFILE, library, history, NOW, TZ),
    ).toEqual([]);
    // Once glutes has recovered (now + 48 h), back-squat is a fitting alternative.
    const later = shift(NOW, 48 * HOUR);
    expect(
      rankSwaps("leg-extension", "variety", base, F_PROFILE, library, history, later, TZ).map(
        (c) => [c.exerciseId, c.fitsBudget],
      ),
    ).toEqual([["back-squat", true]]);
    const libMap = new Map(library.map((e) => [e.id, e]));
    for (let n = 1; n <= 7; n++) {
      const w = run(history, { ...si, shuffle: n }, library);
      expect(item(w, "leg-extension").sets, `n=${n}`).toBe(item(base, "leg-extension").sets);
      expect(hasSwap(item(w, "leg-extension"))).toBe(false);
      expect(w.plan.items.map((i) => i.exerciseId)).not.toContain("back-squat");
      checkInvariants(history, { ...si, shuffle: n }, w, libMap);
    }
  });

  it("rule-13 (AC19) shuffle 0…20 × histories × warm-up × energy keeps every invariant and the item count", () => {
    for (const [name, history] of HISTORIES) {
      for (const warmupInBudget of [true, false]) {
        for (const energy of ENERGIES) {
          const zero = run(history, input({ warmupInBudget, energy }));
          for (let n = 0; n <= 20; n++) {
            const si = input({ warmupInBudget, energy, shuffle: n });
            const w = run(history, si);
            try {
              checkInvariants(history, si, w);
              expect(w.plan.items.length).toBe(zero.plan.items.length);
              expect(w.plan.mainLiftId).toBe(zero.plan.mainLiftId);
            } catch (err) {
              throw new Error(
                `${name} warm-up ${warmupInBudget} ${energy} n=${n}: ${(err as Error).message}`,
              );
            }
          }
        }
      }
    }
  });
});

describe("rule 13 determinism and validation", () => {
  it("R0-E1 rule-13 (AC21) with shuffle: deterministic, frozen-safe, order-independent, no hidden state", () => {
    for (const [name, history] of HISTORIES) {
      for (const n of [0, 1, 2, 3, 7, 41]) {
        const si = input({ shuffle: n });
        const a = run(history, si);
        const label = `${name} n=${n}`;
        expect(run(history, si), label).toEqual(a);
        const frozen = suggest(
          deepFreeze(structuredClone(history)),
          deepFreeze(structuredClone(F_TARGETS)),
          deepFreeze(structuredClone(F_PROFILE)),
          deepFreeze(structuredClone(LIBRARY)),
          deepFreeze({ ...si }),
          NOW,
          TZ,
        );
        expect(frozen, label).toEqual(a);
        expect(run([...history].reverse(), si), label).toEqual(a);
        expect(run(history, si, [...LIBRARY].reverse()), label).toEqual(a);
      }
      const one = run(history, input({ shuffle: 1 }));
      run(history, input({ shuffle: 2 }));
      expect(run(history, input({ shuffle: 1 })), name).toEqual(one);
    }
  });

  it("rule-13 (AC22) shuffle must be an integer ≥ 0", () => {
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "1" as unknown as number]) {
      expect(() => run([], input({ shuffle: bad })), String(bad)).toThrow(RangeError);
    }
  });

  it("rule-13 (AC22) shuffle wraps with no upper bound: 6 and 1_000_002 equal 0", () => {
    const zero = run([]);
    expect(run([], input({ shuffle: 6 }))).toEqual(zero);
    expect(run([], input({ shuffle: 1_000_002 }))).toEqual(zero);
    expect(run([], input({ shuffle: 1_000_003 }))).toEqual(run([], input({ shuffle: 1 })));
  });
});

// ---- AC23: literal plans over the simulated histories (derivations in the T-0204 commit) ----

const EXPECTED: Record<string, Array<[Array<[string, number]>, number]>> = {
  balanced: [
    [
      [
        ["db-bench-press", 4],
        ["db-row", 3],
        ["leg-extension", 2],
      ],
      1545,
    ],
    [
      [
        ["db-bench-press", 4],
        ["inverted-row", 3],
        ["leg-extension", 2],
      ],
      1545,
    ],
    [
      [
        ["db-bench-press", 4],
        ["lat-pulldown", 3],
        ["leg-extension", 2],
      ],
      1545,
    ],
  ],
  allChestNoLegs: [
    [
      [
        ["inverted-row", 4],
        ["back-squat", 3],
        ["calf-raise", 2],
      ],
      1545,
    ],
    [
      [
        ["inverted-row", 4],
        ["hip-thrust", 3],
        ["calf-raise", 2],
      ],
      1545,
    ],
    [
      [
        ["inverted-row", 4],
        ["leg-extension", 3],
        ["calf-raise", 2],
      ],
      1365,
    ],
  ],
  returningAfter10Days: [
    [
      [
        ["bench-press", 4],
        ["inverted-row", 3],
        ["calf-raise", 2],
      ],
      1545,
    ],
    [
      [
        ["bench-press", 4],
        ["db-row", 3],
        ["calf-raise", 2],
      ],
      1545,
    ],
    [
      [
        ["bench-press", 4],
        ["lat-pulldown", 3],
        ["calf-raise", 2],
      ],
      1545,
    ],
  ],
  offlineMerged: [
    [
      [
        ["inverted-row", 4],
        ["back-squat", 3],
        ["calf-raise", 2],
      ],
      1545,
    ],
    [
      [
        ["inverted-row", 4],
        ["hip-thrust", 3],
        ["calf-raise", 2],
      ],
      1545,
    ],
    [
      [
        ["inverted-row", 4],
        ["leg-extension", 3],
        ["calf-raise", 2],
      ],
      1365,
    ],
  ],
};

describe("rule 13 over the simulated 14-day histories", () => {
  const cases: Array<[string, HistorySet[]]> = [
    ["balanced", balancedHistory],
    ["allChestNoLegs", allChestNoLegsHistory],
    ["returningAfter10Days", returningAfter10DaysHistory],
    ["offlineMerged", offlineMergedHistory],
  ];

  for (const [name, history] of cases) {
    it(`rule-13 (AC23) ${name}: exact items at shuffle 0, 1 and 2`, () => {
      const expected = EXPECTED[name];
      expect(expected).toBeDefined();
      const zero = run(history);
      [0, 1, 2].forEach((n) => {
        const w = run(history, input({ shuffle: n }));
        const [items, total] = expected?.[n] ?? [[], -1];
        expect(itemsOf(w), `n=${n}`).toEqual(items);
        expect(w.itemsTotalS, `n=${n}`).toBe(total);
        expect(w.plan.items.length).toBe(zero.plan.items.length);
        expect(w.plan.items.find((i) => i.isMain)).toEqual(zero.plan.items.find((i) => i.isMain));
        expect(swapped(w)).toEqual(n === 0 ? [] : [items[1]?.[0]]);
      });
    });
  }

  it("rule-13 (AC23) all-chest-no-legs keeps inverted-row as the main lift at every shuffle", () => {
    for (let n = 0; n <= 12; n++) {
      expect(run(allChestNoLegsHistory, input({ shuffle: n })).plan.mainLiftId).toBe(
        "inverted-row",
      );
    }
  });

  it("rule-0 rule-13 (AC23) offline-merged with shuffle equals its normalised form; replays change nothing", () => {
    const normalised = normalizeHistory(offlineMergedHistory).map((row) => {
      const copy: HistorySet = { ...row };
      delete copy.pending;
      return copy;
    });
    const replayed = [...offlineMergedHistory, ...offlineQueue.map((r) => ({ ...r }))];
    for (const n of [0, 1, 2]) {
      const si = input({ shuffle: n });
      const merged = run(offlineMergedHistory, si);
      expect(run(normalised, si), `n=${n}`).toEqual(merged);
      expect(run(replayed, si), `n=${n}`).toEqual(merged);
    }
  });
});
