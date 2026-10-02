// T-0219 UF-08.1 UF-08.2 UF-08.3 UF-09.5 UF-05.1: rule 7.1 costs a timed set at its planned
// duration, the rule 14 pre-fill `durationS` (D-0092 §1–§4), in every engine time path.
// AC1–AC12 and AC15. AC13/AC14 (the rules text and the re-scoped guards) live in
// t0219-rules-text.test.ts, rule-14-suggest.test.ts and t0204-traceability.test.ts.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  availableS,
  balance,
  checkinSessions,
  evaluateCheckin,
  itemCostS,
  plannedDurationS,
  prefill,
  rankSwaps,
  setCostS,
  suggest,
  timeCheck,
  type CheckinEvaluation,
  type HistorySet,
  type LibraryExercise,
  type SessionInput,
  type SwapReason,
  type Workout,
  type WorkoutItem,
} from "@workoutlab/engine";
import { F_CHECKIN, NO_CHECKINS, sessionRefsOf } from "./fixtures/checkin.js";
import {
  F_PROFILE,
  F_TARGETS,
  LIBRARY,
  NOW,
  TZ,
  deepFreeze,
  fSwap,
  input,
  itemsOf,
  sessionOf,
  setsOn,
  setsWithReps,
} from "./fixtures/common.js";
import { SIMULATED_HISTORIES } from "./fixtures/histories.js";
import { timedCoreHistory } from "./fixtures/histories-timed.js";
import { mulberry32 } from "./fixtures/random.js";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
/** Runtime budget for the long sweeps (they take seconds under turbo load); not an assertion. */
const SWEEP_TIMEOUT_MS = 30_000;
/** Minute by minute where timed costs bite (15…30), then R7-E8's step of 5 up to 120. */
const SWEEP_BUDGETS = [
  ...Array.from({ length: 16 }, (_, i) => 15 + i),
  ...Array.from({ length: 18 }, (_, i) => 35 + 5 * i),
];
/** Captured from main (ec6782b) before this ticket's change (AC7, AC9). */
const BASELINE = JSON.parse(
  readFileSync(path.join(TEST_DIR, "fixtures", "pre-t0219-baseline.json"), "utf8"),
) as Record<string, unknown>;

const LIB = new Map(LIBRARY.map((e) => [e.id, e]));
const exOf = (id: string): LibraryExercise => {
  const e = LIB.get(id);
  if (e === undefined) throw new Error(`no ${id}`);
  return e;
};
const PLANK = exOf("plank");

/** `P(date, [d1, d2, …])`: one session at 10:00 local with one hard plank set per entry. */
function P(date: string, durations: ReadonlyArray<number | null>, opts = {}): HistorySet[] {
  return setsWithReps(
    date,
    "plank",
    durations.map((d) => ({ durationS: d })),
    opts,
  );
}

/** AC1's F-input: 20 min, warm-up off, plank pinned (`available` 1200). */
const AC1_INPUT = input({ budgetMin: 20, warmupInBudget: false, pinnedIds: ["plank"] });
const AC1_HISTORY = P("2026-09-24", [115, 115, 115]);

function run(
  history: readonly HistorySet[],
  si: SessionInput = AC1_INPUT,
  library: readonly LibraryExercise[] = LIBRARY,
): Workout {
  return suggest(history, F_TARGETS, F_PROFILE, library, si, NOW, TZ);
}

function item(w: Workout, id: string): WorkoutItem {
  const found = w.plan.items.find((i) => i.exerciseId === id);
  if (found === undefined) throw new Error(`no ${id} in plan`);
  return found;
}

const totals = (w: Workout): [number, number, number] => [w.itemsTotalS, w.unusedS, w.totalS];

/** AC8: the rule 7.1 identity for every item, at the item's own `durationS`. */
function checkIdentity(w: Workout, label: string): void {
  for (const i of w.plan.items) {
    const ex = exOf(i.exerciseId);
    const rest = ex.type === "compound" ? 120 : 60;
    const sets = i.sets + (i.backoff === null ? 0 : 1);
    if (ex.timed) {
      expect(i.durationS, `${label} ${i.exerciseId} durationS`).toBe(i.prefill.durationS);
      expect(typeof i.durationS, `${label} ${i.exerciseId}`).toBe("number");
      expect(i.costS, `${label} ${i.exerciseId} costS`).toBe(
        sets * ((i.durationS as number) + rest) + 60,
      );
    } else {
      expect(i.durationS, `${label} ${i.exerciseId} durationS`).toBeNull();
      expect(i.costS, `${label} ${i.exerciseId} costS`).toBe(sets * (45 + rest) + 60);
    }
  }
}

/** R7-E8 caps: Σ costS ≤ available, ≤ 8 items, ≤ 2 items per primary area. */
function checkCaps(w: Workout, si: SessionInput, label: string): void {
  const available = availableS(si.budgetMin, si.warmupInBudget);
  const sum = w.plan.items.reduce((s, i) => s + i.costS, 0);
  expect(sum, label).toBe(w.itemsTotalS);
  expect(sum, label).toBeLessThanOrEqual(Math.max(0, available));
  expect(w.plan.items.length, label).toBeLessThanOrEqual(8);
  const perArea = new Map<string, number>();
  for (const i of w.plan.items) {
    for (const [a, wt] of Object.entries(exOf(i.exerciseId).areas)) {
      if (wt === 1) perArea.set(a, (perArea.get(a) ?? 0) + 1);
    }
  }
  for (const [a, n] of perArea) expect(n, `${label} ${a}`).toBeLessThanOrEqual(2);
}

const AC9_HISTORIES: Array<[string, HistorySet[]]> = [
  ...Object.entries(SIMULATED_HISTORIES).map(([k, h]): [string, HistorySet[]] => [k, h]),
  ["timedCore", timedCoreHistory],
  ["zero", []],
];
const PINS: string[][] = [[], ["plank"]];

// ---- AC1: R7-E13 ----

describe("rule 7.1: a timed set costs its planned duration (D-0092)", () => {
  it("R7-E13 rule-7 (AC1) plank logged 3 × 115 s, pinned at 20 min, no warm-up: bench-press × 4 and plank × 2 at 120 s, 1140 s", () => {
    const w = run(AC1_HISTORY);
    expect(itemsOf(w)).toEqual([
      ["bench-press", 4],
      ["plank", 2],
    ]);
    expect(item(w, "bench-press").isMain).toBe(true);
    const plank = item(w, "plank");
    expect(plank.prefill).toStrictEqual({
      weightKg: null,
      reps: null,
      durationS: 120,
      kind: "add_rep",
    });
    expect(plank.durationS).toBe(120);
    expect(plank.costS).toBe(2 * (120 + 60) + 60);
    expect(plank.costS).toBe(420);
    expect(item(w, "bench-press").costS).toBe(720);
    expect(totals(w)).toEqual([1140, 60, 1320]);
  });

  it("R7-E13 rule-7 (AC1) contrast: at zero history the same input gives plank × 3 at 45 s, 375 s (today's values)", () => {
    const w = run([]);
    expect(itemsOf(w)).toEqual([
      ["bench-press", 4],
      ["plank", 3],
    ]);
    const plank = item(w, "plank");
    expect([plank.durationS, plank.costS, plank.prefill.durationS]).toEqual([45, 375, 45]);
    expect([w.itemsTotalS, w.unusedS]).toEqual([1095, 105]);
    expect(w).toStrictEqual(BASELINE["suggest/zero/normal/20/nowu/plank"]);
  });

  // ---- AC2: reentry lowers the duration ----

  it("rule-7 rule-14 (AC2) reentry after 26 days: plank × 3 at 35 s (max(15, floor5(0.9 × 40))), 345 s", () => {
    const h = P("2026-09-01", [40, 40, 40]);
    const w = run(h);
    const plank = item(w, "plank");
    expect(plank.sets).toBe(3);
    expect(plank.prefill.kind).toBe("reentry");
    expect(plank.prefill.durationS).toBe(Math.max(15, Math.floor(36 / 5) * 5));
    expect(plank.prefill.durationS).toBe(35);
    expect(plank.durationS).toBe(35);
    expect(plank.costS).toBe(3 * (35 + 60) + 60);
    expect(plank.costS).toBe(345);
    expect([w.itemsTotalS, w.unusedS]).toEqual([1065, 135]);
  });

  it("rule-7 rule-7.4 (AC2) Low energy frees exactly one planned set (95 s): plank × 2 at 250 s", () => {
    const h = P("2026-09-01", [40, 40, 40]);
    const normal = run(h);
    const low = run(h, { ...AC1_INPUT, energy: "low" });
    const plank = item(low, "plank");
    expect([plank.sets, plank.costS, plank.durationS]).toEqual([2, 250, 35]);
    expect([low.itemsTotalS, low.unusedS]).toEqual([970, 230]);
    expect(low.unusedS - normal.unusedS).toBe(35 + 60);
    expect(plank.reasons).toContainEqual({ code: "energy_low_trim" });
  });

  // ---- AC3: returning after 10+ days keeps the last duration ----

  it("rule-7 rule-14 (AC3) returning after 12 days: plank held at 100 s (hold_after_break), × 2 at 380 s", () => {
    const w = run(P("2026-09-15", [100, 100]));
    const plank = item(w, "plank");
    expect(plank.prefill.kind).toBe("hold_after_break");
    expect([plank.prefill.durationS, plank.durationS]).toEqual([100, 100]);
    // Rule 7.2: bench-press × 4 = 720 s leaves 480 s. Pinned plank × 3 = 3 × 160 + 60 = 540 s
    // doesn't fit; × 2 = 2 × 160 + 60 = 380 s does. 100 s are left, and no accessory fits
    // (the cheapest, an isolation × 2 at 45 s, is 270 s).
    expect(plank.sets).toBe(2);
    expect(plank.costS).toBe(380);
    expect(itemsOf(w)).toEqual([
      ["bench-press", 4],
      ["plank", 2],
    ]);
    expect([w.itemsTotalS, w.unusedS]).toEqual([1100, 100]);
  });

  // ---- AC4: the cost helpers and the planned-duration function ----

  it("R7-E1 rule-7 (AC4) the 1- and 2-argument cost helpers are unchanged", () => {
    expect(itemCostS(PLANK, 2)).toBe(270);
    expect(setCostS(PLANK)).toBe(105);
    expect(setCostS(PLANK, null)).toBe(105);
    expect(itemCostS(PLANK, 2, null)).toBe(270);
    expect(itemCostS(exOf("back-squat"), 4)).toBe(720);
    expect(itemCostS(exOf("leg-curl"), 3)).toBe(375);
  });

  it("rule-7 (AC4) with the planned duration passed in, a plank set at 120 s costs 180 and plank × 3 costs 600", () => {
    expect(setCostS(PLANK, 120)).toBe(180);
    expect(itemCostS(PLANK, 3, 120)).toBe(600);
    // A non-timed exercise ignores a duration; it always works 45 s.
    expect(setCostS(exOf("back-squat"), 120)).toBe(165);
    // A timed exercise with no default and no planned duration falls back to 45 s (D-0092 §1).
    const noDefault: LibraryExercise = { ...PLANK, id: "plank-x", defaultDurationS: null };
    expect(setCostS(noDefault)).toBe(105);
    expect(setCostS(noDefault, null)).toBe(105);
  });

  it("rule-7 rule-14 (AC4) plannedDurationS: 120 for AC1, 45 for [], 45 for null-duration sets, null for back-squat", () => {
    expect(plannedDurationS(PLANK, AC1_HISTORY, LIBRARY, NOW, TZ)).toBe(120);
    expect(plannedDurationS(PLANK, [], LIBRARY, NOW, TZ)).toBe(45);
    expect(plannedDurationS(PLANK, P("2026-09-24", [null, null]), LIBRARY, NOW, TZ)).toBe(45);
    expect(plannedDurationS(exOf("back-squat"), AC1_HISTORY, LIBRARY, NOW, TZ)).toBeNull();
    expect(plannedDurationS(exOf("back-squat"), [], LIBRARY, NOW, TZ)).toBeNull();
    // The 120 s cap: a 300 s hold still plans 120 s.
    expect(plannedDurationS(PLANK, P("2026-09-24", [300]), LIBRARY, NOW, TZ)).toBe(120);
  });

  it("rule-7 rule-14 (AC4) a null-duration timed set costs at defaultDurationS in suggest", () => {
    const w = run(P("2026-09-24", [null, null]));
    const plank = item(w, "plank");
    expect([plank.sets, plank.durationS, plank.costS]).toEqual([3, 45, 375]);
  });

  it("rule-7 rule-14 (AC4) plannedDurationS deep-equals prefill(plank, null range, …, previous).durationS for any previous (seeded)", () => {
    const rand = mulberry32(0x2190);
    const ids = LIBRARY.map((e) => e.id).concat(["not-in-library"]);
    const dates = ["2026-08-20", "2026-09-05", "2026-09-15", "2026-09-24", "2026-09-27"];
    for (let c = 0; c < 200; c++) {
      const history: HistorySet[] = [];
      const sessions = Math.floor(rand() * 4);
      for (let k = 0; k < sessions; k++) {
        const date = dates[Math.floor(rand() * dates.length)] as string;
        const n = 1 + Math.floor(rand() * 3);
        const ds = Array.from({ length: n }, () =>
          rand() < 0.15 ? null : 5 + Math.floor(rand() * 40) * 5,
        );
        history.push(...P(date, ds, { tag: `c${c}k${k}` }));
      }
      const previous =
        rand() < 0.3
          ? null
          : {
              exerciseId: ids[Math.floor(rand() * ids.length)] as string,
              weightKg: rand() < 0.2 ? null : Math.floor(rand() * 200) / 2,
            };
      const want = prefill(
        PLANK,
        { repsMin: null, repsMax: null },
        history,
        LIBRARY,
        NOW,
        TZ,
        previous,
      ).durationS;
      expect(plannedDurationS(PLANK, history, LIBRARY, NOW, TZ), `case ${c}`).toStrictEqual(want);
    }
  }, 30_000); // runtime budget only (sweep)
});

// ---- AC5: rule 12 timeCostS and fitsBudget ----

describe("rule 12 swaps cost a timed candidate at its planned duration (D-0092 §2)", () => {
  const swapSession = (budgetMin: number): Workout =>
    sessionOf(
      [
        ["bench-press", 4, true],
        ["dead-bug", 2],
      ],
      { budgetMin, warmupInBudget: false },
    );

  it("rule-12 (AC5) short_on_time from dead-bug: hanging-knee-raise 270, plank 420 and fits at 20 min", () => {
    const session = swapSession(20);
    expect(session.plan.items.map((i) => i.costS)).toEqual([720, 270]);
    expect(session.itemsTotalS).toBe(990);
    const list = rankSwaps(
      "dead-bug",
      "short_on_time",
      session,
      F_PROFILE,
      LIBRARY,
      AC1_HISTORY,
      NOW,
      TZ,
    );
    expect(list.map((c) => c.exerciseId)).toEqual(["hanging-knee-raise", "plank"]);
    expect(list[0]?.timeCostS).toBe(270);
    expect(list[1]?.timeCostS).toBe(420);
    expect(990 - 270 + 420).toBe(1140);
    expect(list[1]?.fitsBudget).toBe(true);
  });

  it("rule-12 (AC5) at 18 min (available 1080) the planned plank no longer fits: 1140 > 1080", () => {
    const list = rankSwaps(
      "dead-bug",
      "short_on_time",
      swapSession(18),
      F_PROFILE,
      LIBRARY,
      AC1_HISTORY,
      NOW,
      TZ,
    );
    const plank = list.find((c) => c.exerciseId === "plank");
    expect([plank?.timeCostS, plank?.fitsBudget]).toEqual([420, false]);
  });

  it("rule-12 (AC5) at zero history plank costs 270 and fits at both budgets", () => {
    for (const b of [20, 18]) {
      const list = rankSwaps(
        "dead-bug",
        "short_on_time",
        swapSession(b),
        F_PROFILE,
        LIBRARY,
        [],
        NOW,
        TZ,
      );
      const plank = list.find((c) => c.exerciseId === "plank");
      expect([plank?.timeCostS, plank?.fitsBudget], `budget ${b}`).toEqual([270, true]);
    }
  });

  it("rule-12 (AC5) every reason prices plank at 3 × 180 + 60 = 600 s in a 3-set slot", () => {
    const session = sessionOf([
      ["bench-press", 4, true],
      ["dead-bug", 3],
    ]);
    const reasons: Array<SwapReason | null> = [
      null,
      "equipment_taken",
      "discomfort",
      "variety",
      "short_on_time",
    ];
    for (const r of reasons) {
      const list = rankSwaps("dead-bug", r, session, F_PROFILE, LIBRARY, AC1_HISTORY, NOW, TZ);
      expect(list.find((c) => c.exerciseId === "plank")?.timeCostS, String(r)).toBe(600);
    }
  });
});

// ---- AC6: rule 13 shuffle fit ----

describe("rule 13 shuffle fits a timed pick at its planned duration (D-0092 §2)", () => {
  /** Every exercise outside chest and core is excluded, so greedy reaches a core slot. */
  const CORE_ONLY = LIBRARY.filter(
    (e) =>
      e.kind === "exercise" &&
      !["bench-press", "dead-bug", "hanging-knee-raise", "plank"].includes(e.id),
  ).map((e) => e.id);

  it("rule-13 (AC6) AC1's history, no pins: no shuffle 0…6 puts plank in a slot; every plan fits", () => {
    // Rule 7.2 never reaches core at AC1's input (it is the least-deficit area once the
    // plank sets count), and rule 13 only offers same-primary-area picks, so no shuffle can
    // land on plank. The forced case below excludes the other areas' exercises instead of
    // the ticket's `["dead-bug", "hanging-knee-raise"]`, which never opens a core slot.
    for (let n = 0; n <= 6; n++) {
      const si = { ...AC1_INPUT, pinnedIds: [], shuffle: n };
      const w = run(AC1_HISTORY, si);
      expect(
        w.plan.items.map((i) => i.exerciseId),
        `shuffle ${n}`,
      ).not.toContain("plank");
      checkCaps(w, si, `shuffle ${n}`);
      checkIdentity(w, `shuffle ${n}`);
    }
  });

  it("rule-13 (AC6) a shuffle onto plank at 120 s that doesn't fit leaves the original (20 min)", () => {
    // bench-press × 4 (720) + dead-bug × 3 (375) leaves 105 s. Shuffle 2 picks plank
    // (variety: hanging-knee-raise never done, then plank done 09-24); plank × 3 at 120 s
    // costs 600, and 105 + 375 − 600 < 0, so dead-bug stays. At 45 s (375) it would fit.
    for (let n = 0; n <= 6; n++) {
      const si = { ...AC1_INPUT, pinnedIds: [], shuffle: n, excludeIds: CORE_ONLY };
      const w = run(AC1_HISTORY, si);
      expect(
        w.plan.items.map((i) => i.exerciseId),
        `shuffle ${n}`,
      ).not.toContain("plank");
      expect(w.plan.items.length).toBe(2);
      checkCaps(w, si, `shuffle ${n}`);
      checkIdentity(w, `shuffle ${n}`);
    }
  });

  it("rule-13 (AC6) at 22 min the shuffle onto plank fits exactly: plank × 3 at 120 s, unusedS 0", () => {
    const placed: number[] = [];
    for (let n = 0; n <= 6; n++) {
      const si = input({
        budgetMin: 22,
        warmupInBudget: false,
        shuffle: n,
        excludeIds: CORE_ONLY,
      });
      const w = run(AC1_HISTORY, si);
      checkCaps(w, si, `shuffle ${n}`);
      checkIdentity(w, `shuffle ${n}`);
      if (w.plan.items.some((i) => i.exerciseId === "plank")) {
        placed.push(n);
        const plank = item(w, "plank");
        expect([plank.sets, plank.durationS, plank.costS]).toEqual([3, 120, 600]);
        expect(plank.reasons).toContainEqual({ code: "swap", reason: null });
        expect([w.itemsTotalS, w.unusedS]).toEqual([1320, 0]);
      }
    }
    expect(placed).toEqual([2, 5]);
  });

  /** QA F4b: plank planned at 35 s (reentry); dead-bug and hanging-knee-raise in the last session. */
  const REENTRY_CORE: HistorySet[] = [
    ...P("2026-09-01", [40, 40, 40]),
    ...setsOn(2, "dead-bug", "2026-09-24"),
    ...setsOn(2, "hanging-knee-raise", "2026-09-24"),
  ];
  /** Plank planned at 120 s (add_rep); dead-bug and hanging-knee-raise in the last session. */
  const PROGRESSED_CORE: HistorySet[] = [
    ...AC1_HISTORY,
    ...setsOn(2, "dead-bug", "2026-09-25"),
    ...setsOn(2, "hanging-knee-raise", "2026-09-25"),
  ];

  it("rule-13 (AC6) shuffling a planned-35 s plank out frees only its planned cost: a 375 s pick doesn't fit at 18 min", () => {
    // available 1080. bench-press × 4 = 720 s leaves 360. Core candidates: plank first (dead-bug
    // and hanging-knee-raise are in the most recent session); plank × 3 at 35 s = 3 × 95 + 60 =
    // 345 s, 15 s left. Shuffle 1/4 → dead-bug, 2/5 → hanging-knee-raise (variety: last done
    // 09-24 ties, then id), each × 3 = 375 s: 15 + 345 − 375 < 0, so plank stays. Freeing plank
    // at its default 45 s (375 s) instead would accept the pick and go 15 s over budget.
    for (const energy of ["normal", "high"] as const)
      for (let n = 0; n <= 6; n++) {
        const si = input({
          budgetMin: 18,
          warmupInBudget: false,
          energy,
          shuffle: n,
          excludeIds: CORE_ONLY,
        });
        const w = run(REENTRY_CORE, si);
        const label = `${energy} shuffle ${n}`;
        expect(itemsOf(w), label).toEqual([
          ["bench-press", 4],
          ["plank", 3],
        ]);
        expect(
          w.plan.items.map((i) => [i.durationS, i.costS, i.backoff]),
          label,
        ).toEqual([
          [null, 720, null],
          [35, 345, null],
        ]);
        expect([w.itemsTotalS, w.unusedS], label).toEqual([1065, 15]);
        expect(w.itemsTotalS, label).toBeLessThanOrEqual(availableS(18, false));
        checkCaps(w, si, label);
        checkIdentity(w, label);
      }
  });

  it("rule-13 rule-7.4 (AC6) shuffling a planned-120 s plank out frees 420 s, so High adds the back-off (20–21 min)", () => {
    // bench-press × 4 = 720 s. Plank (not in the last session) is the core pick: × 3 at 120 s =
    // 600 s doesn't fit, × 2 = 2 × 180 + 60 = 420 s does. Left: 60 s at 20 min, 120 s at 21.
    // Shuffle 1/4 → dead-bug × 2, 2/5 → hanging-knee-raise × 2 (270 s): left 60 + 420 − 270 =
    // 210 (270 at 21) ≥ one bench-press set (165), so High adds the back-off: 720 + 165 = 885.
    // Freeing plank at 45 s (270 s) would leave 60 (120) < 165: no back-off.
    const picks: Record<number, string> = { 1: "dead-bug", 2: "hanging-knee-raise" };
    for (const budgetMin of [20, 21])
      for (let n = 0; n <= 6; n++) {
        const si = input({
          budgetMin,
          warmupInBudget: false,
          energy: "high",
          shuffle: n,
          excludeIds: CORE_ONLY,
        });
        const w = run(PROGRESSED_CORE, si);
        const label = `${budgetMin} shuffle ${n}`;
        const available = availableS(budgetMin, false);
        const pick = picks[n % 3];
        if (pick === undefined) {
          expect(itemsOf(w), label).toEqual([
            ["bench-press", 4],
            ["plank", 2],
          ]);
          expect(item(w, "bench-press").backoff, label).toBeNull();
          expect([w.itemsTotalS, w.unusedS], label).toEqual([1140, available - 1140]);
        } else {
          expect(itemsOf(w), label).toEqual([
            ["bench-press", 4],
            [pick, 2],
          ]);
          expect(item(w, "bench-press").backoff, label).not.toBeNull();
          expect(
            w.plan.items.map((i) => i.costS),
            label,
          ).toEqual([885, 270]);
          expect([w.itemsTotalS, w.unusedS], label).toEqual([1155, available - 1155]);
        }
        checkCaps(w, si, label);
        checkIdentity(w, label);
      }
  });

  it(
    "R7-E8 rule-13 (AC6, AC10) shuffle sweep with a forced core slot: budgetMin 15…30 step 1, 35…120 step 5 × warm-up × shuffle 0…6 × energy never goes over",
    () => {
      let n = 0;
      for (const [name, h] of [
        ["AC1", AC1_HISTORY],
        ["reentryCore", REENTRY_CORE],
        ["progressedCore", PROGRESSED_CORE],
        ["timedCore", timedCoreHistory],
      ] as Array<[string, HistorySet[]]>)
        for (const budgetMin of SWEEP_BUDGETS)
          for (const wu of [true, false])
            for (let shuffle = 0; shuffle <= 6; shuffle++)
              for (const energy of ["normal", "low", "high"] as const) {
                const si = input({
                  budgetMin,
                  warmupInBudget: wu,
                  shuffle,
                  energy,
                  excludeIds: CORE_ONLY,
                });
                const label = `${name} ${budgetMin} ${wu} ${shuffle} ${energy}`;
                const w = run(h, si);
                checkCaps(w, si, label);
                checkIdentity(w, label);
                n++;
              }
      expect(n).toBe(4 * 34 * 2 * 7 * 3);
    },
    SWEEP_TIMEOUT_MS,
  );
});

// ---- AC7: zero history is byte-identical ----

describe("zero history (and any history without timed sets) is byte-identical (D-0092 §1)", () => {
  const ENERGIES = ["normal", "low", "high"] as const;
  const BUDGETS = [15, 20, 30, 90];

  it(
    "rule-7 (AC7) suggest at [] over energy × budget × warm-up × pins equals the pre-change snapshot",
    () => {
      let n = 0;
      for (const energy of ENERGIES)
        for (const budgetMin of BUDGETS)
          for (const wu of [true, false])
            for (const pins of PINS) {
              const key = `suggest/zero/${energy}/${budgetMin}/${wu ? "wu" : "nowu"}/${pins.length ? "plank" : "none"}`;
              const w = run([], input({ energy, budgetMin, warmupInBudget: wu, pinnedIds: pins }));
              expect(BASELINE[key], key).toBeDefined();
              expect(JSON.stringify(w), key).toBe(JSON.stringify(BASELINE[key]));
              n++;
            }
      expect(n).toBe(48);
    },
    SWEEP_TIMEOUT_MS,
  );

  it(
    "rule-7 (AC7) the simulated histories without timed sets are byte-identical too",
    () => {
      for (const name of Object.keys(SIMULATED_HISTORIES) as Array<
        keyof typeof SIMULATED_HISTORIES
      >) {
        for (const energy of ENERGIES)
          for (const budgetMin of BUDGETS)
            for (const wu of [true, false])
              for (const pins of PINS) {
                const key = `suggest/${name}/${energy}/${budgetMin}/${wu ? "wu" : "nowu"}/${pins.length ? "plank" : "none"}`;
                const w = run(
                  SIMULATED_HISTORIES[name],
                  input({ energy, budgetMin, warmupInBudget: wu, pinnedIds: pins }),
                );
                expect(JSON.stringify(w), key).toBe(JSON.stringify(BASELINE[key]));
              }
      }
    },
    SWEEP_TIMEOUT_MS,
  );

  it("R12-E1 R12-E2 R12-E3 R12-E4 R12-E5 rule-12 (AC7) rankSwaps over the R12 fixtures equals the pre-change snapshot", () => {
    const reasons: Array<SwapReason | null> = [
      null,
      "equipment_taken",
      "discomfort",
      "variety",
      "short_on_time",
    ];
    const cases: Array<[string, string, Workout, HistorySet[]]> = [
      ["fSwap/barbell-row", "barbell-row", fSwap(), []],
      ["fSwap/bench-press", "bench-press", fSwap(), []],
      ["fSwap/leg-extension", "leg-extension", fSwap(), []],
      [
        "e3a/barbell-row",
        "barbell-row",
        fSwap(),
        [...setsOn(3, "lat-pulldown", "2026-09-20"), ...setsOn(3, "db-row", "2026-09-10")],
      ],
      [
        "e3b/barbell-row",
        "barbell-row",
        fSwap(),
        [...setsOn(3, "lat-pulldown", "2026-09-20"), ...setsOn(3, "db-row", "2026-08-10")],
      ],
      [
        "e4/lat-pulldown",
        "lat-pulldown",
        sessionOf([
          ["bench-press", 4, true],
          ["lat-pulldown", 3],
          ["leg-extension", 2],
        ]),
        [],
      ],
    ];
    for (const [key, cur, session, h] of cases)
      for (const r of reasons) {
        const k = `rankSwaps/${key}/${String(r)}`;
        const got = rankSwaps(cur, r, session, F_PROFILE, LIBRARY, h, NOW, TZ);
        expect(JSON.stringify(got), k).toBe(JSON.stringify(BASELINE[k]));
      }
  });
});

// ---- AC8 + AC9: the simulated 14-day histories, including a timed one ----

describe("simulated 14-day histories with a timed exercise (AC8, AC9)", () => {
  it("rule-7 (AC8, AC9) suggest satisfies the rule 7.1 identity and R7-E8's caps over every history, pins [] and [plank]", () => {
    for (const [name, h] of AC9_HISTORIES)
      for (const pins of PINS) {
        const si = input({ pinnedIds: pins });
        const w = run(h, si);
        checkIdentity(w, `${name} ${pins.join()}`);
        checkCaps(w, si, `${name} ${pins.join()}`);
      }
  });

  it("rule-11 (AC9) balance is unchanged by this ticket for every history", () => {
    for (const [name, h] of AC9_HISTORIES) {
      expect(balance(h, F_TARGETS, LIBRARY, NOW, TZ), name).toStrictEqual(
        BASELINE[`balance/${name}`],
      );
    }
  });

  it("rule-9 (AC9) evaluateCheckin (F-checkin via checkinSessions) matches the baseline's last ended period for every history", () => {
    for (const [name, h] of AC9_HISTORIES) {
      const got = evaluateCheckin(
        checkinSessions(sessionRefsOf(h), h, LIBRARY),
        F_CHECKIN,
        NO_CHECKINS,
        NOW,
        TZ,
      );
      // T-0215 (D-0061 §2, D-0094 §1): the baseline was captured under two periods; `periods`
      // now lists only its last entry. Each baseline proposal already followed that last
      // period alone (under → down 2–3, on_plan → null), so `proposal` is compared as captured.
      const base = BASELINE[`checkin/${name}`] as CheckinEvaluation;
      expect(got, name).toStrictEqual({ ...base, periods: base.periods.slice(-1) });
      expect(got.periods, name).toHaveLength(1);
    }
  });

  it("rule-7 rule-14 (AC9) timedCoreHistory, plank pinned at F-input: back-squat × 4, plank × 3 at 120 s, calf-raise × 2", () => {
    const w = run(timedCoreHistory, input({ pinnedIds: ["plank"] }));
    // Hand-derived from rule 7.2 at F-input (30 min, warm-up in: available 1620). Loads: chest
    // 12/20, back 12/20, shoulders 6/16, arms 12/12, core 12/12, glutes…calves 0. Main: the
    // first zero-ratio area is glutes; back-squat (gap fit 2.5) beats hip-thrust (1.5);
    // × 4 = 720 s, 900 s left. Pinned plank: last min 115 → 120 s (add_rep, capped);
    // × 3 = 3 × 180 + 60 = 600 s, 300 s left. Greedy: calves (ratio 0): calf-raise × 3 =
    // 375 > 300, × 2 = 270, 30 s left. Nothing else fits in 30 s.
    expect(itemsOf(w)).toEqual([
      ["back-squat", 4],
      ["plank", 3],
      ["calf-raise", 2],
    ]);
    const plank = item(w, "plank");
    expect(plank.prefill).toStrictEqual({
      weightKg: null,
      reps: null,
      durationS: 120,
      kind: "add_rep",
    });
    expect(plank.durationS).toBe(120);
    expect(w.plan.items.map((i) => i.costS)).toEqual([720, 600, 270]);
    expect([w.itemsTotalS, w.unusedS, w.totalS]).toEqual([1590, 30, 1770]);
  });
});

// ---- AC10: R7-E8 extended ----

describe("R7-E8 extended: never over budget with timed sets (AC10)", () => {
  it(
    "R7-E8 rule-7 (AC10) budgetMin 15…120 × warm-up × AC9 histories × pins × energy: caps and identity hold",
    () => {
      let n = 0;
      for (let budgetMin = 15; budgetMin <= 120; budgetMin += 5)
        for (const wu of [true, false])
          for (const [name, h] of AC9_HISTORIES)
            for (const pins of PINS)
              for (const energy of ["normal", "low", "high"] as const) {
                const si = input({ budgetMin, warmupInBudget: wu, pinnedIds: pins, energy });
                const label = `${name} ${budgetMin} ${wu} ${pins.join()} ${energy}`;
                const w = run(h, si);
                checkCaps(w, si, label);
                checkIdentity(w, label);
                n++;
              }
      expect(n).toBe(22 * 2 * 6 * 2 * 3);
    },
    SWEEP_TIMEOUT_MS,
  );
});

// ---- AC11: offline-merged ----

describe("offline-merged history drives the planned duration (rule 0, AC11)", () => {
  const server = P("2026-09-24", [60, 60]);
  const target = server[1] as HistorySet;

  it("rule-0 rule-7 (AC11) a queued replacement at 110 s: planned min(60, 110) + 5 = 65 s, costS at 65", () => {
    const queued: HistorySet = {
      ...target,
      durationS: 110,
      editedAt: "2026-09-25T08:00:00+02:00",
      pending: true,
    };
    const h = deepFreeze([...server, queued]);
    const snapshot = JSON.stringify(server);
    expect(plannedDurationS(PLANK, h, LIBRARY, NOW, TZ)).toBe(65);
    const w = run(h);
    const plank = item(w, "plank");
    expect([plank.durationS, plank.prefill.durationS]).toEqual([65, 65]);
    // bench-press × 4 leaves 480 s; plank × 3 at 65 s = 3 × 125 + 60 = 435 s fits.
    expect([plank.sets, plank.costS]).toEqual([3, 435]);
    expect(JSON.stringify(server)).toBe(snapshot);
  });

  it("rule-0 rule-7 (AC11) a queued tombstone of the 09-24 sets: planned 45 s (first time), costS at 45", () => {
    const tomb = server.map((r): HistorySet => ({
      ...r,
      editedAt: "2026-09-25T08:00:00+02:00",
      deletedAt: "2026-09-25T08:00:00+02:00",
      pending: true,
    }));
    const h = [...server, ...tomb];
    expect(plannedDurationS(PLANK, h, LIBRARY, NOW, TZ)).toBe(45);
    const plank = item(run(h), "plank");
    expect(plank.prefill.kind).toBe("first_time");
    expect([plank.sets, plank.durationS, plank.costS]).toEqual([3, 45, 375]);
  });
});

// ---- AC12: rule 8 reads the new cost ----

describe("rule 8 reads the planned-duration costS (AC12)", () => {
  it("rule-8 (AC12) AC1's plan at 900 s elapsed before plank: 120 s behind, trim then removes plank", () => {
    const w = run(AC1_HISTORY);
    const r = timeCheck(w, { elapsedS: 900, nextItemIndex: 1 });
    expect(r.behindS).toBe(900 + 420 - 1200);
    expect([r.behindS, r.show, r.minutesBehind]).toEqual([120, true, 2]);
    // plank is the only accessory and already at 2 sets, so trim can't shorten it and drops it.
    expect(r.trim.items.map((i) => i.exerciseId)).toEqual(["bench-press"]);
    expect(r.trim.projectedS).toBe(900);
  });
});

// ---- AC15: determinism and purity ----

describe("determinism and purity (R0-E1, AC15)", () => {
  const cases: Array<[string, HistorySet[], SessionInput]> = [
    ["AC1", AC1_HISTORY, AC1_INPUT],
    ...AC9_HISTORIES.flatMap(([name, h]) =>
      PINS.flatMap((pins) =>
        [15, 20, 45, 90, 120].flatMap((budgetMin) =>
          [true, false].map((wu): [string, HistorySet[], SessionInput] => [
            `${name} ${budgetMin} ${wu} ${pins.join()}`,
            h,
            input({ budgetMin, warmupInBudget: wu, pinnedIds: pins }),
          ]),
        ),
      ),
    ),
  ];

  it(
    "R0-E1 rule-0 (AC15) two runs deep-equal; frozen inputs neither throw nor change; history/library order is irrelevant",
    () => {
      for (const [label, h, si] of cases) {
        const first = run(h, si);
        expect(run(h, si), label).toStrictEqual(first);
        const fh = deepFreeze(structuredClone(h));
        const fsi = deepFreeze(structuredClone(si));
        const flib = deepFreeze(structuredClone(LIBRARY));
        const before = JSON.stringify([fh, fsi, flib]);
        expect(suggest(fh, F_TARGETS, F_PROFILE, flib, fsi, NOW, TZ), label).toStrictEqual(first);
        expect(JSON.stringify([fh, fsi, flib]), label).toBe(before);
        expect(run([...h].reverse(), si, [...LIBRARY].reverse()), label).toStrictEqual(first);
        expect(plannedDurationS(PLANK, [...h].reverse(), [...LIBRARY].reverse(), NOW, TZ)).toBe(
          plannedDurationS(PLANK, fh, flib, NOW, TZ),
        );
      }
    },
    SWEEP_TIMEOUT_MS,
  );

  it("R0-E1 rule-0 rule-12 (AC15) rankSwaps with timed history is deterministic and order-independent", () => {
    const session = sessionOf(
      [
        ["bench-press", 4, true],
        ["dead-bug", 2],
      ],
      { budgetMin: 20, warmupInBudget: false },
    );
    const a = rankSwaps(
      "dead-bug",
      "short_on_time",
      session,
      F_PROFILE,
      LIBRARY,
      AC1_HISTORY,
      NOW,
      TZ,
    );
    const b = rankSwaps(
      "dead-bug",
      "short_on_time",
      deepFreeze(structuredClone(session)),
      F_PROFILE,
      deepFreeze([...LIBRARY].reverse()),
      deepFreeze([...AC1_HISTORY].reverse()),
      NOW,
      TZ,
    );
    expect(b).toStrictEqual(a);
  });
});
