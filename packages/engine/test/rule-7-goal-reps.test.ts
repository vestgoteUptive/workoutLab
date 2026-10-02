// T-0214 UF-08.2 UF-09.3 UF-09.4: rule 7.2 rep slots by `profile.goal` (D-0061 §1, D-0095),
// in `suggest` and `applySwap` (D-0093 §2). AC1–AC9, AC11–AC13. Every literal below is
// re-derived by hand from rules 7.1, 7.2, 7.4 and 14 in the comment next to it. The slots:
//   get_stronger    main 3–5,  other compounds 5–8,   isolation 10–15
//   build_muscle    main 6–8,  other compounds 8–12,  isolation 10–15 (F-goal, the default)
//   general_fitness main 8–12, other compounds 10–15, isolation 10–15
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  applySwap,
  availableS,
  DEFAULT_GOAL,
  primaryAreas,
  REP_SLOTS,
  suggest,
  type EngineProfile,
  type Goal,
  type HistorySet,
  type LibraryExercise,
  type PrefillKind,
  type PrefillResult,
  type SessionInput,
  type SuggestProfile,
  type SwapReason,
  type Workout,
  type WorkoutItem,
} from "../src/index.js";
import {
  F_INPUT,
  F_PROFILE,
  F_TARGETS,
  LIBRARY,
  NOW,
  TZ,
  deepFreeze,
  fSwap,
  input,
  profile,
  sessionOf,
  setsWithReps,
} from "./fixtures/common.js";
import {
  SIMULATED_HISTORIES,
  allChestNoLegsHistory,
  balancedHistory,
  offlineMergedHistory,
  returningAfter10DaysHistory,
} from "./fixtures/histories.js";
import { timedCoreHistory } from "./fixtures/histories-timed.js";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.resolve(TEST_DIR, "..", "..", "..");

const GS = profile({ goal: "get_stronger" });
const GF = profile({ goal: "general_fitness" });
const BM = F_PROFILE;
/** The Edge Function's profile shape (`supabase/functions/workouts/core.ts`): no `goal` key. */
const NO_GOAL: SuggestProfile = { level: F_PROFILE.level, equipment: F_PROFILE.equipment };
const GOALS: Array<[Goal, EngineProfile]> = [
  ["build_muscle", BM],
  ["get_stronger", GS],
  ["general_fitness", GF],
];

const LIB = new Map(LIBRARY.map((e) => [e.id, e]));
const exOf = (id: string): LibraryExercise => {
  const e = LIB.get(id);
  if (e === undefined) throw new Error(`no ${id}`);
  return e;
};

function run(
  history: readonly HistorySet[],
  p: SuggestProfile,
  si: SessionInput = F_INPUT,
  library: readonly LibraryExercise[] = LIBRARY,
): Workout {
  return suggest(history, F_TARGETS, p, library, si, NOW, TZ);
}

function swap(
  w: Workout,
  cur: string,
  cand: string,
  reason: SwapReason | null,
  p: SuggestProfile,
  history: readonly HistorySet[] = [],
): Workout {
  return applySwap(w, cur, cand, reason, history, p, LIBRARY, NOW, TZ);
}

function item(w: Workout, id: string): WorkoutItem {
  const found = w.plan.items.find((i) => i.exerciseId === id);
  if (found === undefined) throw new Error(`no ${id} in plan`);
  return found;
}

const pr = (weightKg: number | null, reps: number | null, kind: PrefillKind): PrefillResult => ({
  weightKg,
  reps,
  durationS: null,
  kind,
});
const reps = (w: Workout): Array<[number | null, number | null]> =>
  w.plan.items.map((i) => [i.repsMin, i.repsMax]);
const prefills = (w: Workout): Array<[number | null, number | null, PrefillKind]> =>
  w.plan.items.map((i) => [i.prefill.weightKg, i.prefill.reps, i.prefill.kind]);
const shape = (w: Workout): Array<[string, number, number]> =>
  w.plan.items.map((i) => [i.exerciseId, i.sets, i.costS]);

/** `[low, high]` of the slot `item` takes under `goal` (D-0061 §1). */
function slotOf(goal: Goal, i: WorkoutItem): readonly [number, number] {
  const s = REP_SLOTS[goal];
  if (i.isMain) return s.main;
  return exOf(i.exerciseId).type === "compound" ? s.compound : s.isolation;
}

/** Three sets of `w × r` on `date` (`S(date, id, [w × r, w × r, w × r])`). */
const S3 = (date: string, id: string, w: number, r: number): HistorySet[] =>
  setsWithReps(date, id, [
    [w, r],
    [w, r],
    [w, r],
  ]);

// ---- Fixtures shared by AC2–AC8 ----

// AC2 / R7-E15 / R14-E1.
const H_SQ8 = S3("2026-09-24", "back-squat", 100, 8);
// AC4 / R14-E9.
const H_B = setsWithReps("2026-09-24", "bench-press", [
  [80, 8],
  [80, 7],
  [80, 6],
]);
// AC5.
const H_SQ6 = S3("2026-09-24", "back-squat", 100, 6);
const H_SQ6x2 = [...S3("2026-09-20", "back-squat", 100, 6), ...H_SQ6];
// AC6: 09-15 is gap 12 (rule 14 step 3, `gap ≥ 10`).
const H_SQ_BREAK = S3("2026-09-15", "back-squat", 100, 8);
// AC3: push-up 0 × 8, 8, 8 on 09-24.
const H_PU = S3("2026-09-24", "push-up", 0, 8);
// AC7: T-0205 AC18's cable-only case.
const CABLE = ["cable"];
const H_CABLE = [
  ...S3("2026-09-20", "lat-pulldown", 50, 12),
  ...setsWithReps("2026-09-24", "dead-bug", [
    [0, 10],
    [0, 10],
  ]),
];

const SI_SQ = input({ mainLiftId: "back-squat" });
const SI_BW = input({ budgetMin: 15 });
const SI_HIGH = input({ budgetMin: 15, warmupInBudget: false, energy: "high" });
const SI_HIGH_B = input({
  budgetMin: 15,
  warmupInBudget: false,
  energy: "high",
  mainLiftId: "bench-press",
});
// Pinned push-up with full equipment: chest has push-up's 3 sets so the main lift goes to a
// zero-load area (back), and push-up is a compound accessory.
const SI_PU = input({ pinnedIds: ["push-up"] });

/** Every `[history, profile, sessionInput]` the AC1–AC8 suggest calls use (AC9, AC13). */
const SUGGEST_CASES: Array<[string, HistorySet[], EngineProfile, SessionInput]> = [];
for (const [g, p] of GOALS) {
  SUGGEST_CASES.push(
    [`AC1 ${g}`, [], p, F_INPUT],
    [`AC2 ${g}`, H_SQ8, p, SI_SQ],
    [`AC3 ${g}`, [], { ...p, equipment: [] }, SI_BW],
    [`AC3 pinned ${g}`, H_PU, p, SI_PU],
    [`AC4 zero ${g}`, [], p, SI_HIGH],
    [`AC4 R14-E9 ${g}`, H_B, p, SI_HIGH_B],
    [`AC5 ${g}`, H_SQ6, p, SI_SQ],
    [`AC5 two ${g}`, H_SQ6x2, p, SI_SQ],
    [`AC6 ${g}`, H_SQ_BREAK, p, SI_SQ],
    [`AC7 ${g}`, H_CABLE, { ...p, equipment: CABLE }, input({ shuffle: 1 })],
  );
}

// ---- AC1 / R7-E14: the slots at zero history ----

describe("rule 7.2 rep slots by goal at zero history (R7-E14, D-0095)", () => {
  it("R7-E14 rule-7 (AC1) get_stronger keeps R7-E4's selection with reps 3–5, 5–8, 10–15", () => {
    const w = run([], GS);
    // Selection and cost never read the goal: R7-E4's 720 + 555 + 270 = 1545, 1620 − 1545 = 75.
    expect(shape(w)).toEqual([
      ["bench-press", 4, 720],
      ["inverted-row", 3, 555],
      ["leg-extension", 2, 270],
    ]);
    expect([w.itemsTotalS, w.unusedS]).toEqual([1545, 75]);
    // bench-press main 3–5, inverted-row compound 5–8, leg-extension isolation 10–15.
    expect(reps(w)).toEqual([
      [3, 5],
      [5, 8],
      [10, 15],
    ]);
    // Rule 14 step 1 at low reps: weighted → null, bodyweight inverted-row → 0.
    expect(prefills(w)).toEqual([
      [null, 3, "first_time"],
      [0, 5, "first_time"],
      [null, 10, "first_time"],
    ]);
  });

  it("R7-E14 rule-7 (AC1) general_fitness keeps R7-E4's selection with reps 8–12, 10–15, 10–15", () => {
    const w = run([], GF);
    expect(shape(w)).toEqual([
      ["bench-press", 4, 720],
      ["inverted-row", 3, 555],
      ["leg-extension", 2, 270],
    ]);
    expect([w.itemsTotalS, w.unusedS]).toEqual([1545, 75]);
    expect(reps(w)).toEqual([
      [8, 12],
      [10, 15],
      [10, 15],
    ]);
    expect(prefills(w)).toEqual([
      [null, 8, "first_time"],
      [0, 10, "first_time"],
      [null, 10, "first_time"],
    ]);
  });

  it("R7-E14 rule-7 (AC1) F-profile and a profile with no goal key both give today's R7-E4 result", () => {
    // The frozen comparison against the pre-T-0219 suggest output was a one-time proof,
    // recorded in the T-0219 build and accept log (docs/tickets/T-0219-…). Retired by T-0237:
    // F-profile and no goal key must be byte-identical, and the R7-E4 values below are inline.
    expect(JSON.stringify(run([], BM))).toBe(JSON.stringify(run([], NO_GOAL)));
    expect(reps(run([], NO_GOAL))).toEqual([
      [6, 8],
      [8, 12],
      [10, 15],
    ]);
  });
});

// ---- AC2 / R7-E15: one history, three goals ----

describe("rule 14 reads the goal's slot (R7-E15, D-0095 §3)", () => {
  it("R7-E15 rule-7 rule-14 (AC2) back-squat 100 × 8, 8, 8 progresses by goal", () => {
    const at = (p: EngineProfile): WorkoutItem => {
      const i = run(H_SQ8, p, SI_SQ).plan.items[0] as WorkoutItem;
      expect(i.exerciseId).toBe("back-squat");
      expect(i.isMain).toBe(true);
      return i;
    };
    // 6–8: all 8 ≥ 8 → 100 + 2.5, low 6 (R14-E1).
    expect(at(BM).prefill).toEqual(pr(102.5, 6, "increase"));
    // 3–5: all 8 ≥ 5 → 102.5, low 3.
    expect(at(GS).prefill).toEqual(pr(102.5, 3, "increase"));
    // 8–12: not all ≥ 12; one session, minReps 8 is not < 8 → add_rep min(12, 9) = 9.
    expect(at(GF).prefill).toEqual(pr(100, 9, "add_rep"));
    expect([at(BM).repsMin, at(BM).repsMax]).toEqual([6, 8]);
    expect([at(GS).repsMin, at(GS).repsMax]).toEqual([3, 5]);
    expect([at(GF).repsMin, at(GF).repsMax]).toEqual([8, 12]);
  });
});

// ---- AC3: bodyweight ----

describe("rule 7.2 bodyweight slots by goal (R7-E6, D-0057 §2)", () => {
  it("R7-E6 rule-7 (AC3) equipment [] at 15 min: push-up × 4 at 0 kg, 6 / 3 / 8 reps", () => {
    const at = (p: EngineProfile): Workout => run([], { ...p, equipment: [] }, SI_BW);
    for (const [p, low] of [
      [BM, 6],
      [GS, 3],
      [GF, 8],
    ] as const) {
      const w = at(p);
      expect(w.plan.items.map((i) => [i.exerciseId, i.sets, i.isMain])).toEqual([
        ["push-up", 4, true],
      ]);
      expect(w.plan.items[0]?.prefill).toEqual(pr(0, low, "first_time"));
    }
  });

  it("rule-14 (AC3) push-up 0 × 8, 8, 8 as a get_stronger compound accessory (5–8): 0 × 8 increase, high reps", () => {
    const w = run(H_PU, GS, SI_PU);
    const pu = item(w, "push-up");
    expect(pu.isMain).toBe(false);
    expect([pu.repsMin, pu.repsMax]).toEqual([5, 8]);
    // All 8 ≥ high 8 → step 4. Bodyweight stays at 0 kg and is pre-filled at the high reps.
    expect(pu.prefill).toEqual(pr(0, 8, "increase"));
  });
});

// ---- AC4: the back-off follows the goal ----

describe("rule 7.4 back-off at the goal's main low (D-0095 §2)", () => {
  it("R7-E12 rule-7 (AC4) zero history, High, 15 min, warm-up off: back-off reps 3 / 8, 885 s", () => {
    for (const [p, low] of [
      [BM, 6],
      [GS, 3],
      [GF, 8],
    ] as const) {
      const w = run([], p, SI_HIGH);
      const bench = item(w, "bench-press");
      expect(bench.backoff).toEqual({ weightKg: null, reps: low });
      // 720 + one compound set 165 = 885.
      expect(bench.costS).toBe(885);
      expect(w.itemsTotalS).toBe(885);
    }
  });

  it("R14-E9 rule-14 (AC4) bench-press 80 × 8, 7, 6 under get_stronger: 82.5 × 3 increase, back-off 72.5 × 3", () => {
    const bench = item(run(H_B, GS, SI_HIGH_B), "bench-press");
    // 3–5: every set ≥ 5 → 80 + 2.5. Back-off floorInc(0.9 × 82.5 = 74.25, 2.5) = 72.5.
    expect(bench.prefill).toEqual(pr(82.5, 3, "increase"));
    expect(bench.backoff).toEqual({ weightKg: 72.5, reps: 3 });
    expect(bench.costS).toBe(885);
  });

  it("R14-E9 rule-14 (AC4) bench-press 80 × 8, 7, 6 under general_fitness: 80 × 8 hold, back-off 70 × 8", () => {
    const bench = item(run(H_B, GF, SI_HIGH_B), "bench-press");
    // 8–12: minReps 6 < 8 with one session → hold. Back-off floorInc(72, 2.5) = 70.
    expect(bench.prefill).toEqual(pr(80, 8, "hold"));
    expect(bench.backoff).toEqual({ weightKg: 70, reps: 8 });
    expect(bench.costS).toBe(885);
  });
});

// ---- AC5: a goal change between sessions ----

describe("rule 14 after a goal change (D-0095 §3)", () => {
  it("rule-14 (AC5) back-squat 100 × 6, 6, 6 read against each goal's range", () => {
    const at = (h: HistorySet[], p: EngineProfile): PrefillResult =>
      item(run(h, p, SI_SQ), "back-squat").prefill;
    // 6–8: not all ≥ 8, minReps 6 not < 6 → add_rep 7.
    expect(at(H_SQ6, BM)).toEqual(pr(100, 7, "add_rep"));
    // 3–5: all ≥ 5 → 102.5 × 3.
    expect(at(H_SQ6, GS)).toEqual(pr(102.5, 3, "increase"));
    // 8–12: 6 < 8, one session → hold at low 8.
    expect(at(H_SQ6, GF)).toEqual(pr(100, 8, "hold"));
    // Two sessions at W 100 with minReps 6 < 8 → floorInc(90, 2.5) = 90 × 8 deload.
    expect(at(H_SQ6x2, GF)).toEqual(pr(90, 8, "deload"));
  });
});

// ---- AC6: returning after 10 days off ----

describe("rule 14 returning after 10 days off, by goal (R14-E3)", () => {
  it("R14-E3 rule-14 (AC6) 100 × 8, 8, 8 on 09-15 (gap 12): hold_after_break at 100 × the goal's low", () => {
    for (const [p, low] of [
      [BM, 6],
      [GS, 3],
      [GF, 8],
    ] as const) {
      expect(item(run(H_SQ_BREAK, p, SI_SQ), "back-squat").prefill).toEqual(
        pr(100, low, "hold_after_break"),
      );
    }
  });
});

// ---- AC7: shuffle carry reads the goal ----

describe("rule 13 shuffle carry reads the goal's slot (D-0095 §2, D-0056 §11)", () => {
  it("rule-13 rule-14 (AC7) cable-only, get_stronger: lat-pulldown → seated-cable-row carries 55 × 5", () => {
    const p = { ...GS, equipment: CABLE };
    // lat-pulldown at the get_stronger compound slot 5–8: 50 × 12, 12, 12, all ≥ 8 → 55 × 5.
    const base = run(H_CABLE, p);
    expect(item(base, "lat-pulldown").prefill).toEqual(pr(55, 5, "increase"));
    const w = run(H_CABLE, p, input({ shuffle: 1 }));
    const row = item(w, "seated-cable-row");
    // Carry = lat-pulldown's own rule 14 weight at 5–8 (55); reps the 5–8 low 5.
    expect([row.repsMin, row.repsMax]).toEqual([5, 8]);
    expect(row.prefill).toEqual(pr(55, 5, "carry"));
    expect(row.reasons).toContainEqual({ code: "swap", reason: null });
  });

  it("rule-13 rule-14 (AC7) the carried weight is the original's pre-fill at the goal's slot, not build_muscle's", () => {
    // lat-pulldown 50 × 8, 8, 8: at get_stronger 5–8 all ≥ 8 → 55 (increase); at
    // build_muscle 8–12 it would be 50 × 9 (add_rep). The carry must read 55.
    const h = [...S3("2026-09-20", "lat-pulldown", 50, 8), ...H_CABLE.slice(3)];
    const p = { ...GS, equipment: CABLE };
    expect(item(run(h, p), "lat-pulldown").prefill).toEqual(pr(55, 5, "increase"));
    expect(item(run(h, { ...BM, equipment: CABLE }), "lat-pulldown").prefill).toEqual(
      pr(50, 9, "add_rep"),
    );
    const row = item(run(h, p, input({ shuffle: 1 })), "seated-cable-row");
    expect(row.prefill).toEqual(pr(55, 5, "carry"));
  });
});

// ---- AC8: applySwap reads the goal (D-0093 §2) ----

const W_BM = run([], BM);
const W_lat: Workout = (() => {
  const w = sessionOf([
    ["bench-press", 4, true],
    ["lat-pulldown", 3],
    ["leg-extension", 2],
  ]);
  const items = w.plan.items.map((it, i) =>
    i === 1 ? { ...it, prefill: pr(50, 8, "increase") } : it,
  );
  return { ...w, plan: { ...w.plan, items } };
})();
const W_row: Workout = (() => {
  const w = fSwap();
  const items = w.plan.items.map((it, i) =>
    i === 1 ? { ...it, prefill: { ...it.prefill, weightKg: 60 } } : it,
  );
  return { ...w, plan: { ...w.plan, items } };
})();
const W_t = sessionOf(
  [
    ["bench-press", 4, true],
    ["dead-bug", 2],
  ],
  { budgetMin: 20, warmupInBudget: false },
);
const H_P = setsWithReps("2026-09-24", "plank", [
  { durationS: 115 },
  { durationS: 115 },
  { durationS: 115 },
]);
const W_h = run(H_B, BM, SI_HIGH_B);

/** R12-E6…R12-E11 as `[name, workout, current, candidate, reason, history]`. */
const R12_CASES: Array<[string, Workout, string, string, SwapReason | null, HistorySet[]]> = [
  ["R12-E6", W_BM, "inverted-row", "barbell-row", "variety", []],
  ["R12-E7 carry", W_lat, "lat-pulldown", "seated-cable-row", null, []],
  ["R12-E7 no carry", W_row, "barbell-row", "db-row", null, []],
  ["R12-E8", W_BM, "bench-press", "push-up", "equipment_taken", []],
  ["R12-E9", W_t, "dead-bug", "plank", "short_on_time", H_P],
  ["R12-E10", W_h, "bench-press", "db-bench-press", null, H_B],
  ["R12-E11", W_BM, "leg-extension", "back-squat", null, []],
];

describe("rule 12.1 applySwap rebuilds the goal's slot (D-0093 §2, D-0095 §2)", () => {
  it("R12-E8 rule-12 (AC8) get_stronger: push-up in the main slot at 3–5, pre-fill 0 × 3", () => {
    const W_GS = run([], GS);
    for (const w of [W_GS, W_BM]) {
      // The slot comes from the profile passed to applySwap, not from the workout's items.
      const r = swap(w, "bench-press", "push-up", "equipment_taken", GS);
      const pu = r.plan.items[0] as WorkoutItem;
      expect([pu.exerciseId, pu.isMain, pu.sets, pu.costS]).toEqual(["push-up", true, 4, 720]);
      expect([pu.repsMin, pu.repsMax]).toEqual([3, 5]);
      expect(pu.prefill).toEqual(pr(0, 3, "first_time"));
      expect(r.plan.mainLiftId).toBe("push-up");
    }
  });

  it("R12-E6 rule-12 (AC8) general_fitness: barbell-row at 10–15, pre-fill null × 10", () => {
    const r = swap(run([], GF), "inverted-row", "barbell-row", "variety", GF);
    const row = r.plan.items[1] as WorkoutItem;
    expect([row.exerciseId, row.sets, row.costS]).toEqual(["barbell-row", 3, 555]);
    expect([row.repsMin, row.repsMax]).toEqual([10, 15]);
    expect(row.prefill).toEqual(pr(null, 10, "first_time"));
    expect([r.itemsTotalS, r.totalS, r.unusedS]).toEqual([1545, 1725, 75]);
  });

  it("rule-12 (AC8) R12-E10 under get_stronger: the rebuilt back-off is at the main low 3", () => {
    const r = swap(run(H_B, GS, SI_HIGH_B), "bench-press", "db-bench-press", null, GS, H_B);
    const db = r.plan.items[0] as WorkoutItem;
    // Carry 82.5 (bench-press's get_stronger pre-fill) × 3; back-off floorInc(74.25, 2) = 74.
    expect([db.repsMin, db.repsMax]).toEqual([3, 5]);
    expect(db.prefill).toEqual(pr(82.5, 3, "carry"));
    expect(db.backoff).toEqual({ weightKg: 74, reps: 3 });
  });

  it.each(R12_CASES)(
    "rule-12 (AC8) %s under F-profile equals the result with no goal key and keeps the build_muscle slot",
    (_name, w, cur, cand, reason, h) => {
      const bm = swap(w, cur, cand, reason, BM, h);
      expect(JSON.stringify(swap(w, cur, cand, reason, NO_GOAL, h))).toBe(JSON.stringify(bm));
      const k = w.plan.items.findIndex((i) => i.exerciseId === cur);
      const it = bm.plan.items[k] as WorkoutItem;
      const ex = exOf(cand);
      const want = ex.timed ? [null, null] : slotOf("build_muscle", it);
      expect([it.repsMin, it.repsMax]).toEqual([...want]);
    },
  );
});

// ---- AC9: validation and the default ----

describe("profile.goal validation and default (D-0095 §1)", () => {
  it("rule-7 (AC9) suggest and applySwap throw RangeError on an unknown goal", () => {
    const bad = { ...F_PROFILE, goal: "bulk" } as unknown as EngineProfile;
    expect(() => run([], bad)).toThrow(RangeError);
    expect(() => swap(W_BM, "inverted-row", "barbell-row", "variety", bad)).toThrow(RangeError);
    const nul = { ...F_PROFILE, goal: null } as unknown as EngineProfile;
    expect(() => run([], nul)).toThrow(RangeError);
  });

  it("rule-7 (AC9) the default goal is build_muscle", () => {
    expect(DEFAULT_GOAL).toBe("build_muscle");
    expect(REP_SLOTS).toEqual({
      get_stronger: { main: [3, 5], compound: [5, 8], isolation: [10, 15] },
      build_muscle: { main: [6, 8], compound: [8, 12], isolation: [10, 15] },
      general_fitness: { main: [8, 12], compound: [10, 15], isolation: [10, 15] },
    });
  });

  it("rule-7 (AC9) a profile without goal deep-equals build_muscle for every AC1–AC4 input", () => {
    const cases = SUGGEST_CASES.filter(
      ([name, , p]) => /^AC[1-4] /.test(name) && p.goal === "build_muscle",
    );
    expect(cases.length).toBe(6);
    for (const [name, h, p, si] of cases) {
      const noGoal: SuggestProfile = { level: p.level, equipment: p.equipment };
      expect(JSON.stringify(run(h, noGoal, si)), name).toBe(JSON.stringify(run(h, p, si)));
    }
  });

  it("rule-7 (AC9) suggest's and applySwap's profile type accepts {level, equipment} with no goal", () => {
    type SuggestP = Parameters<typeof suggest>[2];
    type SwapP = Parameters<typeof applySwap>[5];
    expectTypeOf<{
      level: EngineProfile["level"];
      equipment: string[];
    }>().toMatchTypeOf<SuggestP>();
    expectTypeOf<{ level: EngineProfile["level"]; equipment: string[] }>().toMatchTypeOf<SwapP>();
    expectTypeOf<EngineProfile>().toMatchTypeOf<SuggestP>();
    expectTypeOf<SuggestP["goal"]>().toEqualTypeOf<Goal | undefined>();
  });

  // The frozen comparison against the pre-T-0219 suggest output was a one-time proof, recorded
  // in the T-0219 build and accept log (docs/tickets/T-0219-…). Retired by T-0237: the same
  // grid is built inline, and F-profile and no goal key must be byte-identical on every case.
  it("rule-7 (AC10) suggest is byte-identical under F-profile and with no goal key (history × energy × budget × warm-up × pins)", () => {
    const histories: Array<[string, readonly HistorySet[]]> = [
      ["zero", []],
      ...Object.entries(SIMULATED_HISTORIES),
    ];
    let n = 0;
    for (const [name, h] of histories) {
      for (const energy of ["normal", "low", "high"] as const) {
        for (const budgetMin of [15, 20, 30, 90]) {
          for (const warmupInBudget of [true, false]) {
            for (const pinnedIds of [[], ["plank"]]) {
              const key = `${name}/${energy}/${budgetMin}/${warmupInBudget ? "wu" : "nowu"}/${pinnedIds.join(",") || "none"}`;
              const si = input({ energy, budgetMin, warmupInBudget, pinnedIds });
              expect(JSON.stringify(run(h, NO_GOAL, si)), key).toBe(JSON.stringify(run(h, BM, si)));
              n++;
            }
          }
        }
      }
    }
    expect(n).toBe(240);
  }, 60_000);
});

// ---- AC11: simulated 14-day histories under every goal ----

const SIM: Array<[string, readonly HistorySet[]]> = [
  ["balancedHistory", balancedHistory],
  ["allChestNoLegsHistory", allChestNoLegsHistory],
  ["returningAfter10DaysHistory", returningAfter10DaysHistory],
  ["offlineMergedHistory", offlineMergedHistory],
  ["timedCoreHistory", timedCoreHistory],
  ["[]", []],
];

function expectSlots(goal: Goal, w: Workout, label: string): void {
  for (const i of w.plan.items) {
    const ex = exOf(i.exerciseId);
    if (ex.timed) {
      expect([i.repsMin, i.repsMax, i.prefill.reps], `${label} ${i.exerciseId}`).toEqual([
        null,
        null,
        null,
      ]);
      continue;
    }
    const [lo, hi] = slotOf(goal, i);
    expect([i.repsMin, i.repsMax], `${label} ${i.exerciseId}`).toEqual([lo, hi]);
    const r = i.prefill.reps as number;
    expect(r, `${label} ${i.exerciseId}`).toBeGreaterThanOrEqual(lo);
    expect(r, `${label} ${i.exerciseId}`).toBeLessThanOrEqual(hi);
    if (i.backoff !== null) expect(i.backoff.reps).toBe(lo);
  }
}

describe("simulated 14-day histories under every goal (AC11)", () => {
  it.each(SIM)(
    "rule-7 (AC11) %s at F-input: selection, sets and cost identical across goals; reps follow the goal table",
    (name, h) => {
      const base = run(h, BM);
      for (const [g, p] of GOALS) {
        const w = run(h, p);
        expect(shape(w), `${name} ${g}`).toEqual(shape(base));
        expect([w.itemsTotalS, w.unusedS], `${name} ${g}`).toEqual([
          base.itemsTotalS,
          base.unusedS,
        ]);
        expectSlots(g, w, `${name} ${g}`);
      }
    },
  );

  it.each(SIM)(
    "R7-E8 rule-7 (AC11) %s: caps hold for every goal over budgetMin 15…120 step 15, warm-up on and off",
    (name, h) => {
      for (let budgetMin = 15; budgetMin <= 120; budgetMin += 15) {
        for (const warmupInBudget of [true, false]) {
          const si = input({ budgetMin, warmupInBudget });
          const base = run(h, BM, si);
          for (const [g, p] of GOALS) {
            const label = `${name} ${g} ${budgetMin} ${warmupInBudget}`;
            const w = run(h, p, si);
            expect(w.itemsTotalS, label).toBeLessThanOrEqual(availableS(budgetMin, warmupInBudget));
            expect(w.plan.items.length, label).toBeLessThanOrEqual(8);
            const count = new Map<string, number>();
            for (const i of w.plan.items) {
              for (const a of primaryAreas(exOf(i.exerciseId))) {
                count.set(a, (count.get(a) ?? 0) + 1);
              }
            }
            for (const [a, c] of count) expect(c, `${label} ${a}`).toBeLessThanOrEqual(2);
            expect(shape(w), label).toEqual(shape(base));
            expectSlots(g, w, label);
          }
        }
      }
    },
    60_000,
  );

  const SI_AC22 = input({
    budgetMin: 90,
    mainLiftId: "bench-press",
    pinnedIds: [
      "back-squat",
      "barbell-row",
      "overhead-press",
      "romanian-deadlift",
      "calf-raise",
      "dead-bug",
      "biceps-curl",
    ],
  });
  const pairs = (w: Workout): Array<[string, PrefillResult]> =>
    w.plan.items.map((i) => [i.exerciseId, i.prefill]);

  it("rule-14 (AC11) balancedHistory, main bench-press + pinned, get_stronger: literals", () => {
    // Every set is 50 × 8 (09-25 and 09-27, gap 0). Main 3–5: all ≥ 5 → 52.5 × 3.
    // Compounds 5–8: all ≥ 8 → 52.5 × 5. Isolations 10–15: 8 < 10 in both sessions → deload
    // (calf-raise floorInc(45, 5) = 45; dead-bug bodyweight 0). db-row has no history.
    expect(pairs(run(balancedHistory, GS, SI_AC22))).toEqual([
      ["bench-press", pr(52.5, 3, "increase")],
      ["back-squat", pr(52.5, 5, "increase")],
      ["barbell-row", pr(52.5, 5, "increase")],
      ["overhead-press", pr(52.5, 5, "increase")],
      ["romanian-deadlift", pr(52.5, 5, "increase")],
      ["calf-raise", pr(45, 10, "deload")],
      ["dead-bug", pr(0, 10, "deload")],
      ["db-row", pr(null, 5, "first_time")],
    ]);
  });

  it("rule-14 (AC11) balancedHistory, main bench-press + pinned, general_fitness: literals", () => {
    // Main 8–12: minReps 8, not < 8 → add_rep 9. Compounds 10–15: both last sessions at W 50
    // with minReps 8 < 10 → floorInc(45, 2.5) = 45 × 10 deload. Isolations as above.
    expect(pairs(run(balancedHistory, GF, SI_AC22))).toEqual([
      ["bench-press", pr(50, 9, "add_rep")],
      ["back-squat", pr(45, 10, "deload")],
      ["barbell-row", pr(45, 10, "deload")],
      ["overhead-press", pr(45, 10, "deload")],
      ["romanian-deadlift", pr(45, 10, "deload")],
      ["calf-raise", pr(45, 10, "deload")],
      ["dead-bug", pr(0, 10, "deload")],
      ["db-row", pr(null, 10, "first_time")],
    ]);
  });

  it("rule-14 (AC11) balancedHistory, main bench-press + pinned: selection identical across goals", () => {
    const base = run(balancedHistory, BM, SI_AC22);
    for (const [g, p] of GOALS) {
      const w = run(balancedHistory, p, SI_AC22);
      expect(shape(w), g).toEqual(shape(base));
      expectSlots(g, w, g);
    }
  });
});

// ---- AC12: the contract text ----

describe("T-0214 contract text (D-0095 §4)", () => {
  const DOC = readFileSync(path.join(REPO_DIR, "docs", "engine-rules.md"), "utf8");
  const lines = DOC.split("\n");

  it("rule-7 (AC12) rule 7.2's Reps line names all three goals with the D-0061 §1 ranges", () => {
    const s = lines.findIndex((l) => l.startsWith("### 7.2 "));
    const e = lines.findIndex((l) => l.startsWith("### 7.3 "));
    const reps = lines.slice(s, e).filter((l) => l.startsWith("- **Reps"));
    expect(reps).toHaveLength(1);
    const line = reps[0] as string;
    for (const part of [
      "`get_stronger` main lift 3–5, other compounds 5–8, isolation 10–15",
      "`build_muscle` main lift 6–8, other compounds 8–12, isolation 10–15",
      "`general_fitness` main lift 8–12, other compounds 10–15, isolation 10–15",
      "D-0061",
      "D-0095",
    ]) {
      expect(line).toContain(part);
    }
  });

  it("rule-7 (AC12) an F-goal line follows F-profile, which is byte-identical", () => {
    const i = lines.findIndex((l) => l.startsWith("- **F-profile:**"));
    expect(lines[i]).toBe(
      "- **F-profile:** level `beginner`; equipment `full` = [barbell, rack, bench, dumbbell, cable, machine, pullup-bar]; rhythm 3–4; no priority areas; onboarded and `plan_changed_at` 2026-08-02.",
    );
    expect(lines[i + 1]).toBe(
      "- **F-goal:** `goal` is `build_muscle` unless an example says otherwise (D-0061 §1, D-0095).",
    );
  });

  it.each(["R7-E14", "R7-E15"])(
    "%s rule-7 (AC12) the line exists in §7.2 and cites D-0095",
    (id) => {
      const s = lines.findIndex((l) => l.startsWith("### 7.2 "));
      const e = lines.findIndex((l) => l.startsWith("### 7.3 "));
      const found = lines
        .map((l, k) => [l, k] as const)
        .filter(([l]) => new RegExp(`^- \\*\\*${id}(?!\\d)`).test(l));
      expect(found).toHaveLength(1);
      const [line, k] = found[0] as readonly [string, number];
      expect(k).toBeGreaterThan(s);
      expect(k).toBeLessThan(e);
      expect(line).toContain("D-0095");
    },
  );

  it("rule-7 (AC12) the Traceability table has a T-0214 row", () => {
    const table = DOC.slice(DOC.indexOf("## Traceability"));
    expect(table.split("\n").filter((l) => /^\|.*\|\s*T-0214\s*\|$/.test(l))).toHaveLength(1);
  });
});

// ---- AC13: determinism and purity ----

describe("goal slots are deterministic and pure (AC13)", () => {
  it("rule-0 (AC13) AC1–AC7 suggest inputs: reruns, frozen inputs and reversed history/library", () => {
    for (const [name, h, p, si] of SUGGEST_CASES) {
      const once = run(h, p, si);
      expect(run(h, p, si), name).toStrictEqual(once);
      const fh = deepFreeze(structuredClone(h));
      const fp = deepFreeze(structuredClone(p));
      const fsi = deepFreeze(structuredClone(si));
      const fl = deepFreeze(structuredClone(LIBRARY));
      const before = JSON.stringify([fh, fp, fsi, fl]);
      expect(suggest(fh, F_TARGETS, fp, fl, fsi, NOW, TZ), name).toStrictEqual(once);
      expect(JSON.stringify([fh, fp, fsi, fl]), name).toBe(before);
      expect(run([...h].reverse(), p, si, [...LIBRARY].reverse()), name).toStrictEqual(once);
    }
  });

  it("rule-0 (AC13) AC8 applySwap inputs: reruns, frozen inputs and reversed history/library", () => {
    const cases: Array<[Workout, string, string, SwapReason | null, EngineProfile, HistorySet[]]> =
      [
        [run([], GS), "bench-press", "push-up", "equipment_taken", GS, []],
        [run([], GF), "inverted-row", "barbell-row", "variety", GF, []],
        [run(H_B, GS, SI_HIGH_B), "bench-press", "db-bench-press", null, GS, H_B],
      ];
    for (const [w, cur, cand, reason, p, h] of cases) {
      const once = swap(w, cur, cand, reason, p, h);
      expect(swap(w, cur, cand, reason, p, h)).toStrictEqual(once);
      const fw = deepFreeze(structuredClone(w));
      const fh = deepFreeze(structuredClone(h));
      const fp = deepFreeze(structuredClone(p));
      const fl = deepFreeze(structuredClone(LIBRARY));
      const before = JSON.stringify([fw, fh, fp, fl]);
      expect(applySwap(fw, cur, cand, reason, fh, fp, fl, NOW, TZ)).toStrictEqual(once);
      expect(JSON.stringify([fw, fh, fp, fl])).toBe(before);
      expect(
        applySwap(w, cur, cand, reason, [...h].reverse(), p, [...LIBRARY].reverse(), NOW, TZ),
      ).toStrictEqual(once);
    }
  });
});
