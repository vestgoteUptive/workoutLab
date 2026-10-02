// T-0224 UF-05.1 UF-08.3: rule 12.1 applySwap (D-0071 §7, D-0093, D-0096 §1). AC1–AC11,
// AC14 and AC15. Every literal below is re-derived from rules 5, 7.1, 7.2, 7.4, 10 and 14 in
// the comments next to it. AC12 (the simulated 14-day histories) is apply-swap-histories.test.ts.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  applySwap,
  rankSwaps,
  suggest,
  type HistorySet,
  type LibraryExercise,
  type SwapReason,
  type Workout,
  type WorkoutItem,
} from "@workoutlab/engine";
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
  sessionOf,
  setsWithReps,
} from "./fixtures/common.js";
import { rulesOnMain, t0224GuardOk } from "./rule12-guards.js";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const ENGINE_DIR = path.resolve(TEST_DIR, "..");
const REPO_DIR = path.resolve(ENGINE_DIR, "..", "..");

function swap(
  w: Workout,
  cur: string,
  cand: string,
  reason: SwapReason | null,
  history: readonly HistorySet[] = [],
  now: string = NOW,
  library: readonly LibraryExercise[] = LIBRARY,
): Workout {
  return applySwap(w, cur, cand, reason, history, F_PROFILE, library, now, TZ);
}

/** `w` with `items[k].prefill.weightKg` (and optionally the whole pre-fill) replaced. */
function withPrefill(w: Workout, k: number, prefill: Partial<WorkoutItem["prefill"]>): Workout {
  return {
    ...w,
    plan: {
      ...w.plan,
      items: w.plan.items.map((it, i) =>
        i === k ? { ...it, prefill: { ...it.prefill, ...prefill } } : it,
      ),
    },
  };
}

/** "Unchanged" (ticket AC preamble): every other item and the listed fields deep-equal `w`. */
function expectUnchanged(r: Workout, w: Workout, k: number): void {
  expect(r.plan.items).toHaveLength(w.plan.items.length);
  r.plan.items.forEach((it, i) => {
    if (i !== k) expect(it, `item ${i}`).toStrictEqual(w.plan.items[i]);
  });
  expect(r.plan.version).toBe(w.plan.version);
  expect(r.plan.warmup).toStrictEqual(w.plan.warmup);
  expect(r.plan.startDeficits).toStrictEqual(w.plan.startDeficits);
  expect(r.budgetMin).toBe(w.budgetMin);
  expect(r.warmupInBudget).toBe(w.warmupInBudget);
  expect(r.energy).toBe(w.energy);
  expect(r.sessionReasons).toStrictEqual(w.sessionReasons);
}

// W = R7-E4: bench-press × 4 (main, 4 × 165 + 60 = 720), inverted-row × 3 (3 × 165 + 60 = 555),
// leg-extension × 2 (2 × 105 + 60 = 270). 1545 items, 1725 with the warm-up, 1620 − 1545 = 75.
const W = suggest([], F_TARGETS, F_PROFILE, LIBRARY, F_INPUT, NOW, TZ);

// W_lat: lat-pulldown's pre-fill weight is 50 (R14-E7's carry source).
const W_lat = withPrefill(
  sessionOf([
    ["bench-press", 4, true],
    ["lat-pulldown", 3],
    ["leg-extension", 2],
  ]),
  1,
  { weightKg: 50, reps: 8, durationS: null, kind: "increase" },
);

// W_row: F-swap with barbell-row's pre-fill weight 60 (R14-E7's no-carry contrast).
const W_row = withPrefill(fSwap(), 1, { weightKg: 60 });

// W_t: budget 20, warm-up off (available 1200). 720 + dead-bug 2 × 105 + 60 = 270 → 990,
// 990 + 180 = 1170, 1200 − 990 = 210.
const W_t = sessionOf(
  [
    ["bench-press", 4, true],
    ["dead-bug", 2],
  ],
  { budgetMin: 20, warmupInBudget: false },
);

// H_p: plank 3 × 115 s on 09-24 (gap 3): rule 14 timed → min(115 + 5, 120) = 120 (`add_rep`).
const H_p = setsWithReps("2026-09-24", "plank", [
  { durationS: 115 },
  { durationS: 115 },
  { durationS: 115 },
]);

// H_b: bench-press 80 × 8, 7, 6 on 09-24 (gap 3).
const H_b = setsWithReps("2026-09-24", "bench-press", [
  [80, 8],
  [80, 7],
  [80, 6],
]);

// W_h = R14-E9: available 900; bench-press × 4 = 720 leaves 180 (< 270 for any accessory).
// High: 180 ≥ 165 → one back-off set, 885, unusedS 15.
const W_h = suggest(
  H_b,
  F_TARGETS,
  F_PROFILE,
  LIBRARY,
  input({ budgetMin: 15, warmupInBudget: false, energy: "high", mainLiftId: "bench-press" }),
  NOW,
  TZ,
);

describe("rule 12.1 applySwap fixtures (preconditions)", () => {
  it("rule-12 W is R7-E4, W_t, and W_h is R14-E9", () => {
    expect(W.plan.items.map((i) => [i.exerciseId, i.sets, i.costS])).toEqual([
      ["bench-press", 4, 720],
      ["inverted-row", 3, 555],
      ["leg-extension", 2, 270],
    ]);
    expect([W.itemsTotalS, W.totalS, W.unusedS]).toEqual([1545, 1725, 75]);
    expect(W.plan.items[1]?.prefill).toStrictEqual({
      weightKg: 0,
      reps: 8,
      durationS: null,
      kind: "first_time",
    });
    expect(W_t.plan.items.map((i) => i.costS)).toEqual([720, 270]);
    expect([W_t.itemsTotalS, W_t.totalS, W_t.unusedS]).toEqual([990, 1170, 210]);
    expect(W_h.plan.items).toHaveLength(1);
    expect(W_h.plan.items[0]).toMatchObject({
      exerciseId: "bench-press",
      sets: 4,
      costS: 885,
      backoff: { weightKg: 70, reps: 6 },
      prefill: { weightKg: 80, reps: 7, durationS: null, kind: "add_rep" },
    });
    expect(W_h.unusedS).toBe(15);
  });
});

describe("rule 12.1 applySwap worked examples", () => {
  it("R12-E6 rule-12 (AC1) an accessory swap at zero history rebuilds the slot; nothing carries", () => {
    const r = swap(W, "inverted-row", "barbell-row", "variety");
    // Compound accessory: 8–12; 3 × (45 + 120) + 60 = 555. barbell-row has no history, and
    // inverted-row's pre-fill weight 0 is not > 0 (D-0062 §1), so `first_time` at null × 8.
    // startDeficits.back at zero history = 1; back was never trained → days null.
    expect(r.plan.items[1]).toStrictEqual({
      exerciseId: "barbell-row",
      isMain: false,
      sets: 3,
      repsMin: 8,
      repsMax: 12,
      durationS: null,
      costS: 555,
      backoff: null,
      prefill: { weightKg: null, reps: 8, durationS: null, kind: "first_time" },
      reasons: [
        { code: "area_deficit", area: "back", deficit: 1 },
        { code: "days_since", area: "back", days: null },
        { code: "swap", reason: "variety" },
        { code: "prefill", kind: "first_time" },
      ],
    });
    expect([r.itemsTotalS, r.totalS, r.unusedS]).toEqual([1545, 1725, 75]);
    expect(r.plan.mainLiftId).toBe("bench-press");
    expectUnchanged(r, W, 1);
  });

  it("R12-E7 rule-12 (AC2) lat-pulldown 50 → seated-cable-row carries 50 (shares back and cable)", () => {
    const r = swap(W_lat, "lat-pulldown", "seated-cable-row", null);
    expect(r.plan.items[1]).toStrictEqual({
      exerciseId: "seated-cable-row",
      isMain: false,
      sets: 3,
      repsMin: 8,
      repsMax: 12,
      durationS: null,
      costS: 555,
      backoff: null,
      prefill: { weightKg: 50, reps: 8, durationS: null, kind: "carry" },
      reasons: [
        // sessionOf's startDeficits are all 0.
        { code: "area_deficit", area: "back", deficit: 0 },
        { code: "days_since", area: "back", days: null },
        { code: "swap", reason: null },
        { code: "prefill", kind: "carry" },
      ],
    });
    expect(r.plan.mainLiftId).toBe("bench-press");
    expectUnchanged(r, W_lat, 1);
  });

  it("R12-E7 rule-12 (AC2) contrast: barbell-row 60 → db-row is first_time (no shared equipment)", () => {
    const r = swap(W_row, "barbell-row", "db-row", "variety");
    expect(r.plan.items[1]?.exerciseId).toBe("db-row");
    expect(r.plan.items[1]?.prefill).toStrictEqual({
      weightKg: null,
      reps: 8,
      durationS: null,
      kind: "first_time",
    });
    expectUnchanged(r, W_row, 1);
  });

  it("R12-E8 rule-12 (AC3) the main slot: push-up × 4 at 6–8, 0 kg, mainLiftId follows", () => {
    const r = swap(W, "bench-press", "push-up", "equipment_taken");
    // Main: 6–8; compound 4 × 165 + 60 = 720; bodyweight first time → 0 × 6.
    expect(r.plan.items[0]).toStrictEqual({
      exerciseId: "push-up",
      isMain: true,
      sets: 4,
      repsMin: 6,
      repsMax: 8,
      durationS: null,
      costS: 720,
      backoff: null,
      prefill: { weightKg: 0, reps: 6, durationS: null, kind: "first_time" },
      reasons: [
        { code: "main_lift" },
        { code: "area_deficit", area: "chest", deficit: 1 },
        { code: "days_since", area: "chest", days: null },
        { code: "swap", reason: "equipment_taken" },
        { code: "prefill", kind: "first_time" },
      ],
    });
    expect(r.plan.mainLiftId).toBe("push-up");
    expect([r.itemsTotalS, r.totalS, r.unusedS]).toEqual([1545, 1725, 75]);
    expectUnchanged(r, W, 0);
  });

  it("R12-E9 rule-12 (AC4) a timed candidate is planned and costed at its pre-fill duration (D-0092, D-0096 §1)", () => {
    const r = swap(W_t, "dead-bug", "plank", "short_on_time", H_p);
    // Planned duration 120 (not defaultDurationS 45): 2 × (120 + 60) + 60 = 420.
    expect(r.plan.items[1]).toStrictEqual({
      exerciseId: "plank",
      isMain: false,
      sets: 2,
      repsMin: null,
      repsMax: null,
      durationS: 120,
      costS: 420,
      backoff: null,
      prefill: { weightKg: null, reps: null, durationS: 120, kind: "add_rep" },
      reasons: [
        // startDeficits.core = 0 (sessionOf); core last trained 09-24 → 3 days.
        { code: "area_deficit", area: "core", deficit: 0 },
        { code: "days_since", area: "core", days: 3 },
        { code: "swap", reason: "short_on_time" },
        { code: "prefill", kind: "add_rep" },
      ],
    });
    // 720 + 420 = 1140; + 180 = 1320; 1200 − 1140 = 60.
    expect([r.itemsTotalS, r.totalS, r.unusedS]).toEqual([1140, 1320, 60]);
    const ranked = rankSwaps("dead-bug", "short_on_time", W_t, F_PROFILE, LIBRARY, H_p, NOW, TZ);
    expect(ranked.find((c) => c.exerciseId === "plank")?.timeCostS).toBe(r.plan.items[1]?.costS);
    expectUnchanged(r, W_t, 1);
  });

  it("R12-E9 rule-12 (AC4) a timed candidate at zero history works defaultDurationS 45", () => {
    const r = swap(W_t, "dead-bug", "plank", "short_on_time", []);
    // 2 × (45 + 60) + 60 = 270; totals as W_t.
    expect(r.plan.items[1]).toMatchObject({
      exerciseId: "plank",
      durationS: 45,
      costS: 270,
      prefill: { weightKg: null, reps: null, durationS: 45, kind: "first_time" },
    });
    expect(r.plan.items[1]?.reasons).toContainEqual({
      code: "days_since",
      area: "core",
      days: null,
    });
    expect([r.itemsTotalS, r.totalS, r.unusedS]).toEqual([990, 1170, 210]);
  });

  it("R12-E10 rule-12 (AC5) the back-off slot carries and is recomputed at the new increment", () => {
    const r = swap(W_h, "bench-press", "db-bench-press", null, H_b);
    // db-bench-press has no history; bench-press's pre-fill 80 carries (chest 1.0, bench).
    // Back-off floorInc(0.9 × 80 = 72, 2) = 72 × 6. 720 + 165 = 885.
    // chest load 3 → deficit (20 − 3) / 20 = 0.85; last trained 09-24 → 3 days.
    expect(r.plan.items[0]).toStrictEqual({
      exerciseId: "db-bench-press",
      isMain: true,
      sets: 4,
      repsMin: 6,
      repsMax: 8,
      durationS: null,
      costS: 885,
      backoff: { weightKg: 72, reps: 6 },
      prefill: { weightKg: 80, reps: 6, durationS: null, kind: "carry" },
      reasons: [
        { code: "main_lift" },
        { code: "area_deficit", area: "chest", deficit: 0.85 },
        { code: "days_since", area: "chest", days: 3 },
        { code: "swap", reason: null },
        { code: "energy_high_backoff" },
        { code: "prefill", kind: "carry" },
      ],
    });
    expect(r.plan.mainLiftId).toBe("db-bench-press");
    expect([r.itemsTotalS, r.unusedS]).toEqual([885, 15]);
    expectUnchanged(r, W_h, 0);
  });

  it("R12-E11 rule-12 (AC6) an over-budget swap is applied; reasons follow the first primary area", () => {
    const r = swap(W, "leg-extension", "back-squat", null);
    // Compound accessory 8–12, 2 × 165 + 60 = 390. Glutes precedes quads in the fixed order.
    expect(r.plan.items[2]).toStrictEqual({
      exerciseId: "back-squat",
      isMain: false,
      sets: 2,
      repsMin: 8,
      repsMax: 12,
      durationS: null,
      costS: 390,
      backoff: null,
      prefill: { weightKg: null, reps: 8, durationS: null, kind: "first_time" },
      reasons: [
        { code: "area_deficit", area: "glutes", deficit: 1 },
        { code: "days_since", area: "glutes", days: null },
        { code: "swap", reason: null },
        { code: "prefill", kind: "first_time" },
      ],
    });
    // 720 + 555 + 390 = 1665 > 1620; + 180 = 1845; unused 0.
    expect([r.itemsTotalS, r.totalS, r.unusedS]).toEqual([1665, 1845, 0]);
    expectUnchanged(r, W, 2);
  });

  it("R12-E11 rule-12 (AC6) contrast: rankSwaps marks back-squat fitsBudget false", () => {
    const ranked = rankSwaps("leg-extension", null, W, F_PROFILE, LIBRARY, [], NOW, TZ);
    expect(ranked.find((c) => c.exerciseId === "back-squat")?.fitsBudget).toBe(false);
  });
});

describe("rule 12.1 applySwap edge cases", () => {
  it("rule-12 (AC7) a second swap of the same slot keeps exactly one swap reason; previous is the first swap", () => {
    const R = swap(W, "inverted-row", "barbell-row", "variety");
    const r = swap(R, "barbell-row", "db-row", "discomfort");
    const item = r.plan.items[1] as WorkoutItem;
    expect([item.exerciseId, item.sets]).toEqual(["db-row", 3]);
    expect(item.reasons.filter((x) => x.code === "swap")).toEqual([
      { code: "swap", reason: "discomfort" },
    ]);
    expect(item.prefill).toStrictEqual({
      weightKg: null,
      reps: 8,
      durationS: null,
      kind: "first_time",
    });
    expectUnchanged(r, R, 1);
  });

  it("rule-12 (AC8) mid-session: sets logged today count for days_since; sets kept; history not mutated", () => {
    const now = "2026-09-27T12:30:00+02:00";
    const history = [
      ...setsWithReps("2026-09-27", "inverted-row", [[0, 8]], { time: "12:10", sessionId: "s1" }),
      ...setsWithReps("2026-09-27", "inverted-row", [[0, 8]], { time: "12:15", sessionId: "s1" }),
    ];
    const before = structuredClone(history);
    const r = swap(W, "inverted-row", "lat-pulldown", null, history, now);
    const item = r.plan.items[1] as WorkoutItem;
    expect(item.exerciseId).toBe("lat-pulldown");
    expect(item.sets).toBe(3);
    expect(item.reasons).toContainEqual({ code: "days_since", area: "back", days: 0 });
    expect(item.prefill).toStrictEqual({
      weightKg: null,
      reps: 8,
      durationS: null,
      kind: "first_time",
    });
    expect(history).toStrictEqual(before);
  });

  const H_sc = setsWithReps("2026-09-15", "seated-cable-row", [
    [40, 12],
    [40, 12],
    [40, 12],
  ]);

  it("rule-12 rule-14 (AC9) returning after 10 days off: own history (gap 12) wins over carry", () => {
    const r = swap(W_lat, "lat-pulldown", "seated-cable-row", null, H_sc);
    expect(r.plan.items[1]?.prefill).toStrictEqual({
      weightKg: 40,
      reps: 8,
      durationS: null,
      kind: "hold_after_break",
    });
  });

  it("rule-0 rule-12 (AC9) offline: queued rows give the same result; tombstoned rows give AC2's carry", () => {
    const viaServer = swap(W_lat, "lat-pulldown", "seated-cable-row", null, H_sc);
    const queued = H_sc.map((s) => ({ ...s, pending: true }));
    expect(swap(W_lat, "lat-pulldown", "seated-cable-row", null, queued)).toStrictEqual(viaServer);
    const t = "2026-09-27T09:00:00+02:00";
    const tombstoned = [
      ...H_sc,
      ...H_sc.map((s) => ({ ...s, pending: true, editedAt: t, deletedAt: t })),
    ];
    const r = swap(W_lat, "lat-pulldown", "seated-cable-row", null, tombstoned);
    expect(r).toStrictEqual(swap(W_lat, "lat-pulldown", "seated-cable-row", null, []));
    expect(r.plan.items[1]?.prefill).toStrictEqual({
      weightKg: 50,
      reps: 8,
      durationS: null,
      kind: "carry",
    });
  });
});

// R7-E11: R7-E4 with Low energy trims inverted-row 3 → 2 (`energy_low_trim`); leg-extension
// was already at 2 and bench-press is the main lift, so neither is trimmed.
const W_low = suggest([], F_TARGETS, F_PROFILE, LIBRARY, input({ energy: "low" }), NOW, TZ);

describe("rule 12.1 applySwap on a Low-energy plan (D-0093 §3.5)", () => {
  it("rule-12 rule-7 (D-0093 §3.5) precondition: W_low is R7-E11, only inverted-row is trimmed", () => {
    expect(W_low.plan.items.map((i) => [i.exerciseId, i.sets])).toEqual([
      ["bench-press", 4],
      ["inverted-row", 2],
      ["leg-extension", 2],
    ]);
    const trimmed = W_low.plan.items.map((i) =>
      i.reasons.some((r) => r.code === "energy_low_trim"),
    );
    expect(trimmed).toEqual([false, true, false]);
  });

  it("rule-12 rule-7 (D-0093 §3.5) a Low-trimmed slot keeps energy_low_trim after swap {reason}", () => {
    const r = swap(W_low, "inverted-row", "barbell-row", "variety");
    // Sets stay 2: 2 × 165 + 60 = 390. Reasons in the D-0040 §6 order.
    expect(r.plan.items[1]).toMatchObject({ exerciseId: "barbell-row", sets: 2, costS: 390 });
    expect(r.plan.items[1]?.reasons).toStrictEqual([
      { code: "area_deficit", area: "back", deficit: 1 },
      { code: "days_since", area: "back", days: null },
      { code: "swap", reason: "variety" },
      { code: "energy_low_trim" },
      { code: "prefill", kind: "first_time" },
    ]);
    expectUnchanged(r, W_low, 1);
  });

  it("rule-12 rule-7 (D-0093 §3.5) contrast: an untrimmed slot of the same plan gets no energy_low_trim", () => {
    const r = swap(W_low, "leg-extension", "back-squat", null);
    expect(r.plan.items[2]?.reasons).toStrictEqual([
      { code: "area_deficit", area: "glutes", deficit: 1 },
      { code: "days_since", area: "glutes", days: null },
      { code: "swap", reason: null },
      { code: "prefill", kind: "first_time" },
    ]);
    const main = swap(W_low, "bench-press", "push-up", null);
    expect(main.plan.items[0]?.reasons.map((x) => x.code)).toEqual([
      "main_lift",
      "area_deficit",
      "days_since",
      "swap",
      "prefill",
    ]);
  });
});

describe("rule 12.1 applySwap validation (D-0093 §6)", () => {
  const W_br = sessionOf([["barbell-row", 4, true]]);
  const W_backs = sessionOf([
    ["bench-press", 4, true],
    ["barbell-row", 3],
    ["lat-pulldown", 3],
  ]);
  const cases: Array<[string, () => Workout, RegExp]> = [
    ["current not an item", () => swap(W, "lat-pulldown", "db-row", null), /not an item/],
    ["candidate not in library", () => swap(W, "inverted-row", "nope", null), /not in the library/],
    ["candidate is a warm-up", () => swap(W, "inverted-row", "wu-cat-cow", null), /warm-up/],
    [
      "candidate already in the plan",
      () => swap(W, "inverted-row", "leg-extension", null),
      /already in the plan/,
    ],
    [
      "candidate already in the plan (sharing an area)",
      () => swap(W_backs, "barbell-row", "lat-pulldown", null),
      /already in the plan/,
    ],
    [
      "candidate equals current",
      () => swap(W, "inverted-row", "inverted-row", null),
      /being replaced/,
    ],
    [
      "isolation in the main slot",
      () => swap(W_br, "barbell-row", "straight-arm-pulldown", null),
      /compound/,
    ],
    ["no shared weight-1.0 area", () => swap(W, "inverted-row", "leg-curl", null), /shares no/],
    [
      "unknown reason",
      () => swap(W, "inverted-row", "barbell-row", "bored" as SwapReason),
      /Unknown swap reason/,
    ],
    [
      "now without an offset",
      () => swap(W, "inverted-row", "barbell-row", null, [], "2026-09-27T12:00:00"),
      /offset/,
    ],
  ];
  it.each(cases)("rule-12 (AC10) throws RangeError: %s", (_name, call, message) => {
    expect(call).toThrow(RangeError);
    expect(call).toThrow(message);
  });

  it("rule-12 (AC10) contrast: barbell-row → lat-pulldown in the main slot does not throw", () => {
    const r = swap(W_br, "barbell-row", "lat-pulldown", null);
    expect(r.plan.items[0]).toMatchObject({ exerciseId: "lat-pulldown", isMain: true, sets: 4 });
    expect(r.plan.mainLiftId).toBe("lat-pulldown");
  });
});

// ---- AC11: purity, determinism and shape over AC1–AC9's calls ----

interface Call {
  name: string;
  w: Workout;
  cur: string;
  cand: string;
  reason: SwapReason | null;
  history: HistorySet[];
  now?: string;
}

const H_sc9 = setsWithReps("2026-09-15", "seated-cable-row", [
  [40, 12],
  [40, 12],
  [40, 12],
]);
const AC1_R = swap(W, "inverted-row", "barbell-row", "variety");
const CALLS: Call[] = [
  { name: "AC1", w: W, cur: "inverted-row", cand: "barbell-row", reason: "variety", history: [] },
  {
    name: "AC2",
    w: W_lat,
    cur: "lat-pulldown",
    cand: "seated-cable-row",
    reason: null,
    history: [],
  },
  { name: "AC2b", w: W_row, cur: "barbell-row", cand: "db-row", reason: "variety", history: [] },
  {
    name: "AC3",
    w: W,
    cur: "bench-press",
    cand: "push-up",
    reason: "equipment_taken",
    history: [],
  },
  { name: "AC4", w: W_t, cur: "dead-bug", cand: "plank", reason: "short_on_time", history: H_p },
  { name: "AC4b", w: W_t, cur: "dead-bug", cand: "plank", reason: "short_on_time", history: [] },
  { name: "AC5", w: W_h, cur: "bench-press", cand: "db-bench-press", reason: null, history: H_b },
  { name: "AC6", w: W, cur: "leg-extension", cand: "back-squat", reason: null, history: [] },
  { name: "AC7", w: AC1_R, cur: "barbell-row", cand: "db-row", reason: "discomfort", history: [] },
  {
    name: "AC8",
    w: W,
    cur: "inverted-row",
    cand: "lat-pulldown",
    reason: null,
    history: [
      ...setsWithReps("2026-09-27", "inverted-row", [[0, 8]], { time: "12:10", sessionId: "s1" }),
      ...setsWithReps("2026-09-27", "inverted-row", [[0, 8]], { time: "12:15", sessionId: "s1" }),
    ],
    now: "2026-09-27T12:30:00+02:00",
  },
  {
    name: "AC9",
    w: W_lat,
    cur: "lat-pulldown",
    cand: "seated-cable-row",
    reason: null,
    history: [...H_sc9, ...H_sc9.map((s) => ({ ...s, pending: true }))],
  },
];

const run = (c: Call, w = c.w, history = c.history, library = LIBRARY): Workout =>
  applySwap(w, c.cur, c.cand, c.reason, history, F_PROFILE, library, c.now ?? NOW, TZ);

/** The `required` list of `components.schemas.<name>` in api/openapi.yaml. */
function requiredOf(openapi: string, name: string): string[] {
  const start = openapi.indexOf(`\n    ${name}:\n`);
  expect(start, name).toBeGreaterThan(-1);
  const m = /\n {6}required: \[([^\]]*)\]/.exec(openapi.slice(start + 1));
  expect(m, name).not.toBeNull();
  return (m?.[1] ?? "").split(",").map((s) => s.trim());
}

describe("rule 12.1 applySwap purity, determinism and shape (AC11)", () => {
  it.each(CALLS.map((c) => [c.name, c] as const))(
    "rule-12 (AC11) %s: deep-frozen inputs neither throw nor change, and give the same result",
    (_n, c) => {
      const expected = run(c);
      const w = deepFreeze(structuredClone(c.w));
      const history = deepFreeze(structuredClone(c.history));
      const library = deepFreeze(structuredClone(LIBRARY));
      const snapshot = structuredClone({ w, history, library });
      expect(run(c, w, history, library)).toStrictEqual(expected);
      expect({ w, history, library }).toStrictEqual(snapshot);
    },
  );

  it.each(CALLS.map((c) => [c.name, c] as const))(
    "rule-12 (AC11) %s: two runs are deep-equal, input order doesn't matter, the result is new",
    (_n, c) => {
      const r = run(c);
      expect(run(c)).toStrictEqual(r);
      expect(run(c, c.w, [...c.history].reverse())).toStrictEqual(r);
      expect(run(c, c.w, c.history, [...LIBRARY].reverse())).toStrictEqual(r);
      expect(r).not.toBe(c.w);
      expect(r.plan).not.toBe(c.w.plan);
      expect(r.plan.items).not.toBe(c.w.plan.items);
    },
  );

  it("rule-12 (AC11) every result has exactly the openapi Workout, SessionPlan and WorkoutItem keys", () => {
    const openapi = readFileSync(path.join(REPO_DIR, "api", "openapi.yaml"), "utf8");
    const workoutKeys = requiredOf(openapi, "Workout");
    const planKeys = requiredOf(openapi, "SessionPlan");
    const itemKeys = requiredOf(openapi, "WorkoutItem");
    expect(workoutKeys).toHaveLength(8);
    expect(itemKeys).toHaveLength(10);
    for (const c of CALLS) {
      const r = run(c);
      expect(Object.keys(r).sort(), c.name).toEqual([...workoutKeys].sort());
      expect(Object.keys(r.plan).sort(), c.name).toEqual([...planKeys].sort());
      for (const it of r.plan.items) {
        expect(Object.keys(it).sort(), c.name).toEqual([...itemKeys].sort());
      }
    }
  });

  it("rule-0 (AC11) src/apply-swap.ts passes the engine lint config", async () => {
    const eslint = new ESLint({
      cwd: ENGINE_DIR,
      overrideConfigFile: path.join(ENGINE_DIR, "eslint.config.mjs"),
    });
    const results = await eslint.lintFiles([path.join(ENGINE_DIR, "src", "apply-swap.ts")]);
    expect(results).toHaveLength(1);
    expect(results.flatMap((r) => r.messages.map((m) => m.message))).toEqual([]);
  }, 30_000);
});

// ---- AC14: the contract text (D-0093 §8) ----

const RULES = path.join(REPO_DIR, "docs", "engine-rules.md");

describe("rule 12.1 contract text (D-0093 §8, AC14)", () => {
  const doc = readFileSync(RULES, "utf8");
  const lines = doc.split("\n");

  it("rule-12 (AC14) a ### 12.1 applySwap heading sits after the R12-E5 line and before ## 13.", () => {
    const e5 = lines.findIndex((l) => l.startsWith("- **R12-E5"));
    const h = lines.findIndex((l) => l.startsWith("### 12.1 applySwap"));
    const r13 = lines.findIndex((l) => l.startsWith("## 13."));
    expect(e5).toBeGreaterThan(-1);
    expect(h).toBeGreaterThan(e5);
    expect(r13).toBeGreaterThan(h);
  });

  it.each(["R12-E6", "R12-E7", "R12-E8", "R12-E9", "R12-E10", "R12-E11"])(
    "rule-12 (AC14) the %s line exists in §12.1 and cites D-0093",
    (id) => {
      const h = lines.findIndex((l) => l.startsWith("### 12.1 applySwap"));
      const r13 = lines.findIndex((l) => l.startsWith("## 13."));
      const found = lines
        .map((l, i) => [l, i] as const)
        .filter(([l]) => new RegExp(`^- \\*\\*${id}(?!\\d)`).test(l));
      expect(found).toHaveLength(1);
      const [line, i] = found[0] as readonly [string, number];
      expect(i).toBeGreaterThan(h);
      expect(i).toBeLessThan(r13);
      expect(line).toContain("D-0093");
    },
  );

  it("rule-0 (AC14) rule 0's function list contains applySwap(", () => {
    const r0 = doc.slice(doc.indexOf("## 0. "), doc.indexOf("## 1. "));
    const list = r0.split("\n").find((l) => l.startsWith("- All engine functions are pure"));
    expect(list).toContain("applySwap(");
  });

  it("rule-12 (AC14) the Traceability table has one T-0224 row citing 12.1", () => {
    const table = doc.slice(doc.indexOf("## Traceability"));
    const rows = table.split("\n").filter((l) => /^\|.*\|\s*T-0224\s*\|$/.test(l));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain("12.1");
  });

  it("rule-12 rule-13 (AC14) R12-E1…R12-E5 and rule 13 are unchanged against main", () => {
    // The T-0204 guard (t0204-traceability.test.ts, re-scoped under D-0092 §6) compares rule 12
    // up to the R12-E5 line and rule 13 with main; this pins that §12.1 lies outside that slice.
    const main = rulesOnMain(REPO_DIR);
    if (main === null) return; // shallow CI clone; the T-0204 guard skips the same way
    // D-0130 §2: the rule 12 signature line (fixtures/rule12-signature-d0130.ts) is the one
    // accepted difference; any other character in the slice still fails.
    expect(t0224GuardOk(doc, main)).toBe(true);
  });
});

// ---- AC15: public API and traceability ----

describe("rule 12.1 public API (AC15)", () => {
  it("rule-12 (AC15) applySwap is exported from @workoutlab/engine and returns a Workout", () => {
    expect(typeof applySwap).toBe("function");
    expectTypeOf(applySwap).returns.toEqualTypeOf<Workout>();
    expectTypeOf(applySwap).parameters.toEqualTypeOf<
      [
        Workout,
        string,
        string,
        SwapReason | null,
        readonly HistorySet[],
        Parameters<typeof suggest>[2],
        readonly LibraryExercise[],
        string,
        string,
      ]
    >();
  });

  it("rule-12 (AC15) R12-E6…R12-E11 each start a test title in this file", () => {
    const src = readFileSync(fileURLToPath(import.meta.url), "utf8");
    const titleRe = /\bit\(\s*"(R12-E\d+)\b/g;
    const ids = new Set([...src.matchAll(titleRe)].map((m) => m[1]));
    expect([...ids].sort()).toEqual(["R12-E10", "R12-E11", "R12-E6", "R12-E7", "R12-E8", "R12-E9"]);
  });
});
