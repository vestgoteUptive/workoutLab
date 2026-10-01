// T-0205 rule 14 UF-08.2 UF-09.3 UF-09.4: `prefill` wired into `suggest` (D-0057 §7–§8),
// the simulated 14-day histories, invariants, API and traceability. AC9, AC16–AC25.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  floor5,
  HOLD_GAP_DAYS,
  prefill,
  REENTRY_GAP_DAYS,
  TIMED_MAX_S,
  TIMED_MIN_S,
  TIMED_STEP_S,
  type PrefillKind,
  type PrefillResult,
} from "@workoutlab/engine";
import {
  dayDiff,
  localDate,
  normalizeHistory,
  suggest,
  type EngineProfile,
  type HistorySet,
  type LibraryExercise,
  type SessionInput,
  type Workout,
  type WorkoutItem,
} from "../src/index.js";
import {
  F_PROFILE,
  F_TARGETS,
  LIBRARY,
  NOW,
  TZ,
  deepFreeze,
  input,
  profile,
  setsWithReps,
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
const REPO_DIR = path.resolve(TEST_DIR, "..", "..", "..");
const BASELINE = JSON.parse(
  readFileSync(path.join(TEST_DIR, "fixtures", "pre-t0205-suggest.json"), "utf8"),
) as Record<string, Workout>;

const KINDS: PrefillKind[] = [
  "first_time",
  "carry",
  "reentry",
  "hold_after_break",
  "increase",
  "deload",
  "hold",
  "add_rep",
];

const HISTORIES: Array<[string, HistorySet[]]> = [
  ["zero", []],
  ...Object.entries(SIMULATED_HISTORIES).map(([k, h]): [string, HistorySet[]] => [k, h]),
];

function run(
  history: readonly HistorySet[],
  si: SessionInput = input(),
  opts: { now?: string; library?: readonly LibraryExercise[]; profile?: EngineProfile } = {},
): Workout {
  return suggest(
    history,
    F_TARGETS,
    opts.profile ?? F_PROFILE,
    opts.library ?? LIBRARY,
    si,
    opts.now ?? NOW,
    TZ,
  );
}

function item(w: Workout, id: string): WorkoutItem {
  const found = w.plan.items.find((i) => i.exerciseId === id);
  if (found === undefined) throw new Error(`no ${id} in plan`);
  return found;
}

const pairs = (w: Workout): Array<[string, PrefillResult]> =>
  w.plan.items.map((i) => [i.exerciseId, i.prefill]);
const pr = (
  weightKg: number | null,
  reps: number | null,
  kind: PrefillKind,
  durationS: number | null = null,
): PrefillResult => ({ weightKg, reps, durationS, kind });
const prefillReason = (i: WorkoutItem): PrefillKind | undefined => {
  const r = i.reasons.find((x) => x.code === "prefill");
  return r !== undefined && r.code === "prefill" ? r.kind : undefined;
};

/** A workout with every rule 14 output blanked, to compare selection and cost only. */
function withoutPrefill(w: Workout): unknown {
  return {
    ...w,
    plan: {
      ...w.plan,
      items: w.plan.items.map((i) => ({
        ...i,
        prefill: "*",
        backoff: i.backoff === null ? null : { ...i.backoff, weightKg: "*" },
        reasons: i.reasons.map((r) => (r.code === "prefill" ? { code: "prefill" } : r)),
      })),
    },
  };
}

// ---- AC9: R14-E9 ----

describe("rule 14 × rule 7.4: the High back-off reads a real pre-fill", () => {
  it("R14-E9 rule-14 (AC9) bench-press 80 × 8, 7, 6 at High, 15 min, no warm-up: 80 × 7 add_rep, back-off 70 × 6", () => {
    // D-0062 §7: bench-press is in the most recent session, so rule 7.2 rank 1 would pick
    // another main lift; AC9 names bench-press, so it is the chosen main (UF-08.1).
    const h = setsWithReps("2026-09-24", "bench-press", [
      [80, 8],
      [80, 7],
      [80, 6],
    ]);
    const si = input({
      energy: "high",
      budgetMin: 15,
      warmupInBudget: false,
      mainLiftId: "bench-press",
    });
    const w = run(h, si);
    const bench = item(w, "bench-press");
    expect(bench.isMain).toBe(true);
    expect(bench.prefill).toEqual(pr(80, 7, "add_rep"));
    expect(bench.backoff).toEqual({ weightKg: 70, reps: 6 });
    expect(bench.reasons).toContainEqual({ code: "energy_high_backoff" });
    expect(prefillReason(bench)).toBe("add_rep");
    // Normal energy: same pre-fill, no back-off.
    const normal = item(run(h, { ...si, energy: "normal" }), "bench-press");
    expect(normal.prefill).toEqual(pr(80, 7, "add_rep"));
    expect(normal.backoff).toBeNull();
  });

  it("R14-E9 rule-14 (AC9) the back-off floors 0.9 × the pre-fill weight, not the logged W", () => {
    // 100 × 8, 8, 8 → pre-fill 102.5 (increase) → back-off floorInc(92.25) = 90.
    const h = setsWithReps("2026-09-24", "bench-press", [
      [100, 8],
      [100, 8],
      [100, 8],
    ]);
    const si = input({
      energy: "high",
      budgetMin: 15,
      warmupInBudget: false,
      mainLiftId: "bench-press",
    });
    const bench = item(run(h, si), "bench-press");
    expect(bench.prefill).toEqual(pr(102.5, 6, "increase"));
    expect(bench.backoff).toEqual({ weightKg: 90, reps: 6 });
    // 60 × 8 → 62.5 → floorInc(56.25) = 55 (from the logged W it would be floorInc(54) = 52.5).
    const h60 = h.map((s) => ({ ...s, weightKg: 60 }));
    expect(item(run(h60, si), "bench-press").prefill).toEqual(pr(62.5, 6, "increase"));
    expect(item(run(h60, si), "bench-press").backoff).toEqual({ weightKg: 55, reps: 6 });
  });
});

// ---- AC16: the seam is replaced, zero-history results unchanged ----

describe("rule 14 replaces the T-0201 first_time seam (D-0057 §8)", () => {
  it("rule-14 (AC16) zero history: every suggest deep-equals the pre-T-0205 result (energy × budget × warm-up × shuffle)", () => {
    let n = 0;
    for (const energy of ["normal", "low", "high"] as const) {
      for (const budgetMin of [15, 20, 30]) {
        for (const warmupInBudget of [true, false]) {
          for (const shuffle of [0, 1]) {
            const key = `zero/${energy}/${budgetMin}/${warmupInBudget ? "wu" : "nowu"}/${shuffle}`;
            const before = BASELINE[key];
            expect(before, key).toBeDefined();
            const w = run([], input({ energy, budgetMin, warmupInBudget, shuffle }));
            expect(w, key).toEqual(before);
            for (const i of w.plan.items) {
              const ex = LIBRARY.find((e) => e.id === i.exerciseId) as LibraryExercise;
              expect(i.prefill, key).toEqual({
                weightKg: ex.externalLoad ? null : 0,
                reps: i.repsMin,
                durationS: ex.timed ? ex.defaultDurationS : null,
                kind: "first_time",
              });
              expect(prefillReason(i), key).toBe("first_time");
            }
            n++;
          }
        }
      }
    }
    expect(n).toBe(36);
  });

  it("rule-14 (AC16) (AC23) non-empty histories: selection, sets, costs and totals equal the pre-T-0205 result", () => {
    for (const [key, before] of Object.entries(BASELINE)) {
      if (key === "//") continue;
      const [name, energy, budget, wu, shuffle] = key.split("/") as [
        string,
        string,
        string,
        string,
        string,
      ];
      const history = HISTORIES.find(([k]) => k === name)?.[1];
      expect(history, key).toBeDefined();
      const w = run(
        history as HistorySet[],
        input({
          energy: energy as SessionInput["energy"],
          budgetMin: Number(budget),
          warmupInBudget: wu === "wu",
          shuffle: Number(shuffle),
        }),
      );
      expect(withoutPrefill(w), key).toEqual(withoutPrefill(before));
    }
  });
});

// ---- AC17: suggest uses real progression ----

describe("rule 14 in suggest over balancedHistory", () => {
  it("rule-14 (AC17) at F-input the selected items (db-bench-press, db-row, leg-extension) have no history: first_time", () => {
    // D-0062 §8: rule 7.2 rank 1 prefers exercises not in the 09-27 session, so none of the
    // selected exercises appears in balancedHistory.
    const w = run(balancedHistory);
    expect(pairs(w)).toEqual([
      ["db-bench-press", pr(null, 6, "first_time")],
      ["db-row", pr(null, 8, "first_time")],
      ["leg-extension", pr(null, 10, "first_time")],
    ]);
  });

  it("rule-14 (AC17) with its exercises chosen, each item's pre-fill is rule 14 over the 09-27 and 09-25 sessions", () => {
    const si = input({
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
    const w = run(balancedHistory, si);
    // Every set is 50 × 8. Main 6–8: all ≥ 8 → 52.5 × 6. Compounds 8–12: minReps 8 → 9.
    // Isolations 10–15: 8 < 10 in both 09-25 and 09-27 at W 50 → deload (45 at inc 5; 0 bw).
    // biceps-curl is left out: arms is recovering (6 weighted sets in the last 48 h).
    expect(pairs(w)).toEqual([
      ["bench-press", pr(52.5, 6, "increase")],
      ["back-squat", pr(50, 9, "add_rep")],
      ["barbell-row", pr(50, 9, "add_rep")],
      ["overhead-press", pr(50, 9, "add_rep")],
      ["romanian-deadlift", pr(50, 9, "add_rep")],
      ["calf-raise", pr(45, 10, "deload")],
      ["dead-bug", pr(0, 10, "deload")],
      ["db-row", pr(null, 8, "first_time")],
    ]);
    for (const i of w.plan.items) expect(prefillReason(i), i.exerciseId).toBe(i.prefill.kind);
  });
});

// ---- AC18: carry through a shuffle (T-0204 has landed on this base) ----

describe("rule 14 carry through a rule 13 shuffle (D-0056 §11)", () => {
  it("rule-14 (AC18) the ticket's fixture: S(09-24, inverted-row, …) at shuffle 1 swaps back-squat → hip-thrust, first_time", () => {
    const h = setsWithReps("2026-09-24", "inverted-row", [
      [0, 10],
      [0, 10],
      [0, 10],
    ]);
    const w = run(h, input({ shuffle: 1 }));
    const hip = item(w, "hip-thrust");
    expect(hip.reasons).toContainEqual({ code: "swap", reason: null });
    // The original back-squat has no history, so its pre-fill weight is null: nothing to carry.
    expect(hip.prefill).toEqual(pr(null, 8, "first_time"));
    for (const i of w.plan.items) expect(i.prefill.kind).not.toBe("carry");
  });

  const cableOnly = profile({ equipment: ["cable"] });
  const cableHistory = [
    ...setsWithReps("2026-09-20", "lat-pulldown", [
      [50, 12],
      [50, 12],
      [50, 12],
    ]),
    ...setsWithReps("2026-09-24", "dead-bug", [
      [0, 10],
      [0, 10],
    ]),
  ];

  it("rule-14 (AC18) lat-pulldown (pre-fill 55) shuffled to seated-cable-row carries 55 × 8 with swap {reason: null}", () => {
    const base = run(cableHistory, input(), { profile: cableOnly });
    expect(pairs(base)[1]).toEqual(["lat-pulldown", pr(55, 8, "increase")]);
    const w = run(cableHistory, input({ shuffle: 1 }), { profile: cableOnly });
    const row = item(w, "seated-cable-row");
    // The carried weight is the previous exercise's rule 14 pre-fill (55), not its W (50).
    expect(row.prefill).toEqual(pr(55, 8, "carry"));
    expect(row.reasons.map((r) => r.code)).toEqual([
      "area_deficit",
      "days_since",
      "swap",
      "prefill",
    ]);
    expect(row.reasons.slice(1)).toEqual([
      { code: "days_since", area: "back", days: 7 },
      { code: "swap", reason: null },
      { code: "prefill", kind: "carry" },
    ]);
    // Everything but the pre-fill is what rule 13 already gave.
    expect(pairs(w).map(([id]) => id)).toEqual([
      "push-up",
      "seated-cable-row",
      "straight-arm-pulldown",
    ]);
  });

  it("rule-14 (AC18) with seated-cable-row done, the shuffle picks straight-arm-pulldown (carry at its own low reps) and dead-bug keeps its own history", () => {
    const h = [
      ...cableHistory,
      ...setsWithReps("2026-09-19", "seated-cable-row", [
        [30, 9],
        [30, 9],
      ]),
    ];
    const base = run(h, input(), { profile: cableOnly });
    expect(pairs(base)).toEqual([
      ["push-up", pr(0, 6, "first_time")],
      ["lat-pulldown", pr(55, 8, "increase")],
      ["plank", pr(null, null, "first_time", 45)],
    ]);
    const w = run(h, input({ shuffle: 1 }), { profile: cableOnly });
    // lat-pulldown (55) → straight-arm-pulldown: shares back and cable; isolation low is 10.
    // plank (timed, pre-fill weight null) → dead-bug: nothing to carry, and dead-bug's own
    // 09-24 history (0 × 10, 10) gives add_rep 0 × 11.
    expect(pairs(w)).toEqual([
      ["push-up", pr(0, 6, "first_time")],
      ["straight-arm-pulldown", pr(55, 10, "carry")],
      ["dead-bug", pr(0, 11, "add_rep")],
    ]);
    expect(w.plan.items.map((i) => i.reasons.some((r) => r.code === "swap"))).toEqual([
      false,
      true,
      true,
    ]);
  });

  it("rule-14 (AC18) the carry check reads the original exercise: db-row (pre-fill 22) → lat-pulldown shares no equipment, first_time", () => {
    const eq = profile({ equipment: ["cable", "dumbbell", "bench"] });
    const h = [
      ...setsWithReps("2026-09-20", "db-row", [
        [20, 12],
        [20, 12],
      ]),
      ...setsWithReps("2026-09-24", "dead-bug", [
        [0, 10],
        [0, 10],
      ]),
    ];
    const base = run(h, input(), { profile: eq });
    expect(item(base, "db-row").prefill).toEqual(pr(22, 8, "increase"));
    const w = run(h, input({ shuffle: 1 }), { profile: eq });
    const row = item(w, "lat-pulldown");
    expect(row.reasons).toContainEqual({ code: "swap", reason: null });
    // dumbbell + bench vs cable: no shared equipment item, so 22 kg is not carried.
    expect(row.prefill).toEqual(pr(null, 8, "first_time"));
  });

  it("rule-14 (AC18) an unshuffled slot never gets carry, even when a previous would qualify", () => {
    const w = run(cableHistory, input({ shuffle: 0 }), { profile: cableOnly });
    for (const i of w.plan.items) {
      expect(i.prefill.kind).not.toBe("carry");
      expect(i.reasons.some((r) => r.code === "swap")).toBe(false);
    }
  });
});

// ---- AC19: determinism and purity ----

describe("rule 14 determinism and purity (R0-E1)", () => {
  it("R0-E1 rule-14 (AC19) two suggest runs are deep-equal for [] and every simulated history", () => {
    for (const [name, h] of HISTORIES) expect(run(h), name).toEqual(run(h));
  });

  it("rule-14 (AC19) deep-frozen inputs neither throw nor change", () => {
    for (const [name, h] of HISTORIES) {
      const copy = structuredClone(h);
      const frozenH = deepFreeze(structuredClone(h));
      const frozenLib = deepFreeze(structuredClone(LIBRARY));
      const w = run(frozenH, deepFreeze(input({ shuffle: 1, energy: "high" })), {
        library: frozenLib,
      });
      expect(w, name).toEqual(run(h, input({ shuffle: 1, energy: "high" })));
      expect(frozenH).toEqual(copy);
      const ex = frozenLib.find((e) => e.id === "back-squat") as LibraryExercise;
      const slot = deepFreeze({ repsMin: 6, repsMax: 8 });
      const prev = deepFreeze({ exerciseId: "hip-thrust", weightKg: 60 });
      expect(() => prefill(ex, slot, frozenH, frozenLib, NOW, TZ, prev)).not.toThrow();
    }
  });

  it("rule-14 (AC19) reversing history or library gives a deep-equal result", () => {
    for (const [name, h] of HISTORIES) {
      const w = run(h, input({ budgetMin: 90 }));
      expect(run([...h].reverse(), input({ budgetMin: 90 })), name).toEqual(w);
      expect(run(h, input({ budgetMin: 90 }), { library: [...LIBRARY].reverse() }), name).toEqual(
        w,
      );
    }
  });

  it("rule-14 (AC19) calling prefill directly twice with the same arguments is deep-equal", () => {
    for (const [, h] of HISTORIES) {
      for (const ex of LIBRARY.filter((e) => e.kind === "exercise")) {
        const slot = ex.timed ? { repsMin: null, repsMax: null } : { repsMin: 8, repsMax: 12 };
        const a = prefill(ex, slot, h, LIBRARY, NOW, TZ, null);
        expect(prefill(ex, slot, h, LIBRARY, NOW, TZ, null)).toEqual(a);
        expect(prefill(ex, slot, [...h].reverse(), [...LIBRARY].reverse(), NOW, TZ, null)).toEqual(
          a,
        );
      }
    }
  });

  it("rule-14 (AC19) src/prefill.ts reads no clock and no randomness", () => {
    const src = readFileSync(path.join(TEST_DIR, "..", "src", "prefill.ts"), "utf8");
    expect(src).not.toMatch(/Date\.now\s*\(|new Date\(\s*\)|Math\.random|random/i);
  });
});

// ---- AC21: shape ----

function checkShape(ex: LibraryExercise, p: PrefillResult, label: string): void {
  expect(Object.keys(p).sort(), label).toEqual(["durationS", "kind", "reps", "weightKg"]);
  expect(KINDS, label).toContain(p.kind);
  if (p.weightKg !== null) {
    expect(Number.isFinite(p.weightKg), label).toBe(true);
    expect(p.weightKg, label).toBeGreaterThanOrEqual(0);
    expect(Math.round(p.weightKg * 1000) / 1000, label).toBe(p.weightKg);
  }
  if (p.reps !== null) {
    expect(Number.isInteger(p.reps), label).toBe(true);
    expect(p.reps, label).toBeGreaterThanOrEqual(1);
  }
  if (p.durationS !== null) {
    expect(Number.isInteger(p.durationS), label).toBe(true);
    expect(p.durationS, label).toBeGreaterThanOrEqual(TIMED_MIN_S);
    expect(p.durationS, label).toBeLessThanOrEqual(TIMED_MAX_S);
  }
  if (ex.timed) {
    expect([p.weightKg, p.reps], label).toEqual([null, null]);
    expect(p.durationS, label).not.toBeNull();
  } else {
    expect(p.durationS, label).toBeNull();
    expect(p.reps, label).not.toBeNull();
  }
  if (!ex.externalLoad && !ex.timed) expect(p.weightKg, label).toBe(0);
}

describe("rule 14 result shape (openapi PrefillResult)", () => {
  it("rule-14 (AC21) the openapi PrefillResult has exactly these keys and bounds", () => {
    const openapi = readFileSync(path.join(REPO_DIR, "api", "openapi.yaml"), "utf8");
    const block = (name: string): string => {
      const start = openapi.indexOf(`\n    ${name}:`);
      expect(start, name).toBeGreaterThan(-1);
      const rest = openapi.slice(start + 1);
      const end = rest.slice(1).search(/\n {4}\S/);
      return end === -1 ? rest : rest.slice(0, end + 1);
    };
    const result = block("PrefillResult");
    expect(result).toMatch(/additionalProperties: false/);
    expect(result).toMatch(/required: \[weightKg, reps, durationS, kind\]/);
    expect(result).toMatch(/weightKg: \{ type: \[number, "null"\], minimum: 0 \}/);
    expect(result).toMatch(/reps: \{ type: \[integer, "null"\], minimum: 1 \}/);
    expect(result).toMatch(/durationS: \{ type: \[integer, "null"\], minimum: 1 \}/);
    const kinds = /enum: \[([^\]]*)\]/.exec(block("PrefillKind"))?.[1] ?? "";
    expect(kinds.split(",").map((k) => k.trim())).toEqual(KINDS);
  });

  it("rule-14 (AC21) every prefill over every exercise × simulated history × now has the PrefillResult shape", () => {
    const nows = [
      "2026-09-27T12:00:00+02:00",
      "2026-10-11T12:00:00+02:00",
      "2026-11-06T12:00:00+01:00",
    ];
    for (const [name, h] of HISTORIES) {
      for (const now of nows) {
        for (const ex of LIBRARY.filter((e) => e.kind === "exercise")) {
          for (const slot of ex.timed
            ? [{ repsMin: null, repsMax: null }]
            : [
                { repsMin: 6, repsMax: 8 },
                { repsMin: 8, repsMax: 12 },
                { repsMin: 10, repsMax: 15 },
              ]) {
            const p = prefill(ex, slot, h, LIBRARY, now, TZ, null);
            checkShape(ex, p, `${name} ${now} ${ex.id}`);
            if (!ex.timed) {
              expect(p.reps).toBeGreaterThanOrEqual(slot.repsMin as number);
              expect(p.reps).toBeLessThanOrEqual(slot.repsMax as number);
            }
          }
        }
      }
    }
  });
});

// ---- AC22: the simulated 14-day histories ----

describe("rule 14 over the simulated 14-day histories (F-input)", () => {
  it("rule-14 (AC22) balancedHistory: literals at F-input (no selected exercise has history)", () => {
    expect(pairs(run(balancedHistory))).toEqual([
      ["db-bench-press", pr(null, 6, "first_time")],
      ["db-row", pr(null, 8, "first_time")],
      ["leg-extension", pr(null, 10, "first_time")],
    ]);
  });

  it("rule-14 (AC22) balancedHistory: every repeated exercise has gap 0 and lands in step 4, 5, 6 or 7", () => {
    const si = input({
      budgetMin: 120,
      pinnedIds: ["bench-press", "back-squat", "calf-raise", "dead-bug"],
    });
    for (const i of run(balancedHistory, si).plan.items) {
      if (balancedHistory.some((s) => s.exerciseId === i.exerciseId)) {
        expect(["increase", "deload", "hold", "add_rep"], i.exerciseId).toContain(i.prefill.kind);
      } else {
        expect(i.prefill.kind, i.exerciseId).toBe("first_time");
      }
    }
  });

  it("R14-E3 rule-14 (AC22) returningAfter10DaysHistory: literals at F-input (09-12 exercises are hold_after_break)", () => {
    expect(pairs(run(returningAfter10DaysHistory))).toEqual([
      ["bench-press", pr(50, 6, "hold_after_break")],
      ["inverted-row", pr(0, 8, "first_time")],
      ["calf-raise", pr(50, 10, "hold_after_break")],
    ]);
  });

  it("R14-E3 rule-14 (AC22) returningAfter10DaysHistory: back-squat (09-15, gap 12) and romanian-deadlift (09-17, gap 10) hold", () => {
    const si = input({ budgetMin: 60, pinnedIds: ["back-squat", "romanian-deadlift", "dead-bug"] });
    expect(pairs(run(returningAfter10DaysHistory, si))).toEqual([
      ["bench-press", pr(50, 6, "hold_after_break")],
      ["back-squat", pr(50, 8, "hold_after_break")],
      ["romanian-deadlift", pr(50, 8, "hold_after_break")],
      ["dead-bug", pr(0, 10, "hold_after_break")],
      ["inverted-row", pr(0, 8, "first_time")],
      ["calf-raise", pr(50, 10, "hold_after_break")],
      ["lateral-raise", pr(null, 10, "first_time")],
    ]);
    // Nothing reaches gap 21 at F-tz: the oldest session is 09-03 (gap 24) but every
    // exercise was repeated on 09-12 or later.
    for (const ex of LIBRARY) {
      if (ex.kind !== "exercise" || ex.timed) continue;
      const p = prefill(
        ex,
        { repsMin: 8, repsMax: 12 },
        returningAfter10DaysHistory,
        LIBRARY,
        NOW,
        TZ,
        null,
      );
      expect(p.kind, ex.id).not.toBe("reentry");
    }
  });

  it("rule-14 (AC22) allChestNoLegsHistory: inverted-row, back-squat, calf-raise are all first_time", () => {
    const w = run(allChestNoLegsHistory);
    expect(pairs(w)).toEqual([
      ["inverted-row", pr(0, 6, "first_time")],
      ["back-squat", pr(null, 8, "first_time")],
      ["calf-raise", pr(null, 10, "first_time")],
    ]);
    for (const i of w.plan.items) expect(prefillReason(i)).toBe("first_time");
  });

  it("rule-14 (AC22) offlineMergedHistory: literals, and equal to the normalised history with pending removed", () => {
    const w = run(offlineMergedHistory);
    expect(pairs(w)).toEqual([
      ["inverted-row", pr(0, 6, "first_time")],
      ["back-squat", pr(null, 8, "first_time")],
      ["calf-raise", pr(null, 10, "first_time")],
    ]);
    const clean = normalizeHistory(offlineMergedHistory).map(({ pending: _p, ...s }) => s);
    expect(run(clean)).toEqual(w);
    const replay = [...offlineMergedHistory, ...offlineQueue.map((s) => ({ ...s }))];
    expect(run(replay)).toEqual(w);
  });

  it("rule-14 (AC22) offlineMergedHistory: the queued romanian-deadlift sets define its pre-fill (gap 0)", () => {
    const si = input({ budgetMin: 45, pinnedIds: ["romanian-deadlift"] });
    const w = run(offlineMergedHistory, si);
    expect(pairs(w)).toEqual([
      ["inverted-row", pr(0, 6, "first_time")],
      ["romanian-deadlift", pr(50, 9, "add_rep")],
      ["back-squat", pr(null, 8, "first_time")],
      ["calf-raise", pr(null, 10, "first_time")],
      ["leg-extension", pr(null, 10, "first_time")],
    ]);
    const clean = normalizeHistory(offlineMergedHistory).map(({ pending: _p, ...s }) => s);
    expect(run(clean, si)).toEqual(w);
    // Without the queue there is no romanian-deadlift history at all.
    expect(item(run(allChestNoLegsHistory, si), "romanian-deadlift").prefill).toEqual(
      pr(null, 8, "first_time"),
    );
  });

  it("rule-14 (AC22) offlineMergedHistory: the tombstoned 09-26 bench-press set is not read", () => {
    const ex = LIBRARY.find((e) => e.id === "bench-press") as LibraryExercise;
    const slot = { repsMin: 8, repsMax: 12 };
    // Tombstone every 09-26 bench-press set in the queue: the 09-24 session becomes the last.
    const kill = "2026-09-27T08:00:00+02:00";
    const all26 = allChestNoLegsHistory
      .filter((s) => s.exerciseId === "bench-press" && s.completedAt.startsWith("2026-09-26"))
      .map((s) => ({ ...s, pending: true, editedAt: kill, deletedAt: kill, reps: 3 }));
    const h = [...allChestNoLegsHistory, ...all26];
    const p = prefill(ex, slot, h, LIBRARY, NOW, TZ, null);
    expect(p).toEqual(pr(50, 9, "add_rep"));
    // The single tombstone in offlineQueue leaves three 50 × 8 sets on 09-26.
    expect(prefill(ex, slot, offlineMergedHistory, LIBRARY, NOW, TZ, null)).toEqual(
      pr(50, 9, "add_rep"),
    );
  });
});

// ---- AC23: invariants over a long sweep ----

/** Independent gap of `exerciseId`'s last performance, or null when it has no hard set. */
function lastGap(history: readonly HistorySet[], exerciseId: string, now: string): number | null {
  const lib = new Map(LIBRARY.map((e) => [e.id, e]));
  let best: HistorySet | null = null;
  for (const s of normalizeHistory(history)) {
    if (s.exerciseId !== exerciseId || s.isWarmup || lib.get(s.exerciseId)?.kind !== "exercise")
      continue;
    if (best === null || Date.parse(s.completedAt) > Date.parse(best.completedAt)) best = s;
  }
  if (best === null) return null;
  return Math.max(0, dayDiff(localDate(best.completedAt, TZ), localDate(now, TZ)));
}

describe("rule 14 invariants over a long sweep (AC23, R7-E8)", () => {
  const NOWS = [
    "2026-09-27T12:00:00+02:00",
    "2026-10-01T12:00:00+02:00",
    "2026-10-11T12:00:00+02:00",
    "2026-11-06T12:00:00+01:00",
  ];

  it("rule-14 (AC23) R7-E8 every item's prefill is valid and consistent with its gap; caps and budget hold", () => {
    let items = 0;
    const kindsSeen = new Set<PrefillKind>();
    for (const [name, h] of HISTORIES) {
      for (const now of NOWS) {
        for (let budgetMin = 15; budgetMin <= 120; budgetMin += 15) {
          for (const warmupInBudget of [true, false]) {
            for (const shuffle of [0, 1]) {
              const si = input({ budgetMin, warmupInBudget, shuffle });
              const w = run(h, si, { now });
              const label = `${name} ${now} ${budgetMin} ${warmupInBudget} ${shuffle}`;
              const available = budgetMin * 60 - (warmupInBudget ? 180 : 0);
              expect(w.itemsTotalS, label).toBeLessThanOrEqual(available);
              expect(w.plan.items.length, label).toBeLessThanOrEqual(8);
              const perArea = new Map<string, number>();
              for (const i of w.plan.items) {
                const ex = LIBRARY.find((e) => e.id === i.exerciseId) as LibraryExercise;
                for (const [a, wt] of Object.entries(ex.areas)) {
                  if (wt === 1) perArea.set(a, (perArea.get(a) ?? 0) + 1);
                }
                const p = i.prefill;
                const l = `${label} ${i.exerciseId}`;
                checkShape(ex, p, l);
                kindsSeen.add(p.kind);
                expect(prefillReason(i), l).toBe(p.kind);
                const gap = lastGap(h, i.exerciseId, now);
                if (p.kind === "reentry") expect(gap, l).toBeGreaterThanOrEqual(REENTRY_GAP_DAYS);
                if (p.kind === "hold_after_break") {
                  expect(gap, l).toBeGreaterThanOrEqual(HOLD_GAP_DAYS);
                  expect(gap, l).toBeLessThan(REENTRY_GAP_DAYS);
                }
                if (gap !== null && p.kind !== "first_time" && p.kind !== "carry") {
                  const expected = gap >= 21 ? "reentry" : gap >= 10 ? "hold_after_break" : null;
                  if (expected !== null) expect(p.kind, l).toBe(expected);
                  else expect(["increase", "deload", "hold", "add_rep"], l).toContain(p.kind);
                }
                if (gap === null) expect(["first_time", "carry"], l).toContain(p.kind);
                if (p.kind === "first_time" && ex.externalLoad && !ex.timed) {
                  expect(p.weightKg, l).toBeNull();
                }
                const swapped = i.reasons.some((r) => r.code === "swap");
                if (p.kind === "carry") expect(swapped, l).toBe(true);
                if (!ex.timed) {
                  expect(p.reps, l).toBeGreaterThanOrEqual(i.repsMin as number);
                  expect(p.reps, l).toBeLessThanOrEqual(i.repsMax as number);
                }
                items++;
              }
              for (const [a, c] of perArea) expect(c, `${label} ${a}`).toBeLessThanOrEqual(2);
            }
          }
        }
      }
    }
    expect(items).toBeGreaterThan(1000);
    // The sweep reaches the break branches, not only first_time.
    for (const k of ["first_time", "hold_after_break", "reentry"] as const)
      expect(kindsSeen).toContain(k);
  });
});

// ---- AC24: public API ----

describe("rule 14 public API", () => {
  it("rule-14 (AC24) prefill, floor5 and the rule 14 constants are exported with their values", () => {
    expect(typeof prefill).toBe("function");
    expect(REENTRY_GAP_DAYS).toBe(21);
    expect(HOLD_GAP_DAYS).toBe(10);
    expect(TIMED_STEP_S).toBe(5);
    expect(TIMED_MAX_S).toBe(120);
    expect(TIMED_MIN_S).toBe(15);
  });

  it("rule-14 (AC24) floor5 floors to a multiple of 5 after round3", () => {
    expect(floor5(37)).toBe(35);
    expect(floor5(35)).toBe(35);
    expect(floor5(36.0000001)).toBe(35);
    expect(floor5(39.9999)).toBe(40);
    expect(floor5(39.99)).toBe(35);
    expect(floor5(40)).toBe(40);
    expect(floor5(4.9)).toBe(0);
    expect(floor5(0.9 * 50)).toBe(45);
    expect(() => floor5(Number.NaN)).toThrow(RangeError);
  });

  it("rule-14 (AC24) PrefillKind is exactly the 8 codes and PrefillResult is the openapi shape", () => {
    expectTypeOf<PrefillKind>().toEqualTypeOf<
      | "first_time"
      | "carry"
      | "reentry"
      | "hold_after_break"
      | "increase"
      | "deload"
      | "hold"
      | "add_rep"
    >();
    expectTypeOf<PrefillResult>().toEqualTypeOf<{
      weightKg: number | null;
      reps: number | null;
      durationS: number | null;
      kind: PrefillKind;
    }>();
    expectTypeOf(prefill).returns.toEqualTypeOf<PrefillResult>();
  });
});

// ---- AC25: traceability ----

function rulesOnMain(): string | null {
  for (const ref of ["main", "origin/main"]) {
    try {
      return execFileSync("git", ["show", `${ref}:docs/engine-rules.md`], {
        cwd: REPO_DIR,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      // try the next ref
    }
  }
  return null;
}

/** Rule 14's text: from the `## 14.` heading up to `## Required tests` (D-0092 §6). */
function rule14Of(doc: string): string {
  const start = doc.indexOf("\n## 14.");
  const end = doc.indexOf("\n## Required tests", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return doc.slice(start, end);
}

describe("rule 14 traceability", () => {
  it("rule-14 (AC25) every rule 14 example id appears in a test title", () => {
    const titleRe = /\b(?:it|test)(?:\.each\([\s\S]*?\))?\(\s*(["'`])((?:\\.|(?!\1).)*)\1/g;
    const titles: string[] = [];
    for (const f of readdirSync(TEST_DIR).filter((n) => n.endsWith(".test.ts"))) {
      for (const m of readFileSync(path.join(TEST_DIR, f), "utf8").matchAll(titleRe)) {
        titles.push(m[2] ?? "");
      }
    }
    const ids = Array.from({ length: 9 }, (_, k) => `R14-E${k + 1}`);
    const missing = ids.filter(
      (id) => !titles.some((t) => new RegExp(`(^|[^\\w-])${id}(?!\\w)`).test(t)),
    );
    expect(missing).toEqual([]);
  });

  it("rule-14 (AC25) the rule 14 test files hold no placeholder or trivially-true assertion", () => {
    for (const f of ["rule-14-prefill.test.ts", "rule-14-suggest.test.ts"]) {
      const text = readFileSync(path.join(TEST_DIR, f), "utf8");
      const banned = ["@place" + "holder", "it.sk" + "ip(", "it.to" + "do(", "expect(tr" + "ue)"];
      for (const b of banned) expect(text.includes(b), `${f}: ${b}`).toBe(false);
    }
  });

  it("rule-14 (AC25) docs/engine-rules.md rule 14 (## 14. up to ## Required tests) is unchanged against main", () => {
    const main = rulesOnMain();
    // Shallow CI clones have no main; the rule text is then pinned by the tests above.
    if (main === null) return;
    // D-0092 §6: this guard covers the section T-0205 owned, not the whole file, so later
    // tickets may edit other rules under their own decisions.
    const current = readFileSync(path.join(REPO_DIR, "docs", "engine-rules.md"), "utf8");
    expect(rule14Of(current)).toBe(rule14Of(main));
  });
});
