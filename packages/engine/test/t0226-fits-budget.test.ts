// T-0226 UF-05.1 UF-08.3 UF-09.9 UF-09.6: rule 12 `fitsBudget` on a back-off slot counts the
// back-off set rule 12.1 `applySwap` re-adds (D-0105 §1–§2, supersedes D-0056 §3 in part), so
// `fitsBudget` is exactly `applySwap(…).itemsTotalS ≤ available` on every plan, over budget or
// not. AC1–AC8. Every literal is re-derived from rules 7.1, 7.4, 12 and 12.1 next to it.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  applySwap,
  availableS,
  getsBackoff,
  rankSwaps,
  setCostS,
  suggest,
  type HistorySet,
  type LibraryExercise,
  type SessionInput,
  type SwapCandidate,
  type SwapReason,
  type Workout,
} from "@workoutlab/engine";
import {
  F_INPUT,
  F_PROFILE,
  F_TARGETS,
  LIBRARY,
  NOW,
  TZ,
  deepFreeze,
  input,
  setsWithReps,
} from "./fixtures/common.js";
import {
  allChestNoLegsHistory,
  balancedHistory,
  offlineMergedHistory,
  returningAfter10DaysHistory,
} from "./fixtures/histories.js";
import { timedCoreHistory } from "./fixtures/histories-timed.js";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.resolve(TEST_DIR, "..", "..", "..");

const avail = (w: Workout): number => availableS(w.budgetMin, w.warmupInBudget);

function rank(
  p: Workout,
  cur: string,
  reason: SwapReason | null,
  history: readonly HistorySet[],
  library: readonly LibraryExercise[] = LIBRARY,
): SwapCandidate[] {
  return rankSwaps(cur, reason, p, F_PROFILE, library, history, NOW, TZ);
}

function swap(
  p: Workout,
  cur: string,
  cand: string,
  reason: SwapReason | null,
  history: readonly HistorySet[],
  library: readonly LibraryExercise[] = LIBRARY,
): Workout {
  return applySwap(p, cur, cand, reason, history, F_PROFILE, library, NOW, TZ);
}

/** The D-0056 §3 formula this ticket supersedes on a back-off slot (the AC3 / AC4 oracle). */
function preD0105Fits(p: Workout, cur: string, c: SwapCandidate): boolean {
  const slot = p.plan.items.find((i) => i.exerciseId === cur);
  if (slot === undefined) throw new Error(`no ${cur}`);
  return p.itemsTotalS - slot.costS + c.timeCostS <= avail(p);
}

const ids = (cs: readonly SwapCandidate[]): string[] => cs.map((c) => c.exerciseId);
const byId = (cs: readonly SwapCandidate[], id: string): SwapCandidate => {
  const c = cs.find((x) => x.exerciseId === id);
  if (c === undefined) throw new Error(`no candidate ${id}`);
  return c;
};

// ---- Fixtures (T-0224) ----

// W = R7-E4: bench-press × 4 (main, 720, no back-off), inverted-row × 3 (555),
// leg-extension × 2 (270); 1545 s at budget 30 with the warm-up in (available 1620).
const W = suggest([], F_TARGETS, F_PROFILE, LIBRARY, F_INPUT, NOW, TZ);

// H_b: bench-press 80 × 8, 7, 6 on 09-24 (gap 3).
const H_b = setsWithReps("2026-09-24", "bench-press", [
  [80, 8],
  [80, 7],
  [80, 6],
]);

const IN_H = input({
  budgetMin: 15,
  warmupInBudget: false,
  energy: "high",
  mainLiftId: "bench-press",
});
// W_h = R14-E9: available 900; bench-press × 4 = 4 × (45 + 120) + 60 = 720 leaves 180, no
// accessory fits (≥ 270), High adds one back-off set (165 ≤ 180): 885 s, unusedS 15.
const W_h = suggest(H_b, F_TARGETS, F_PROFILE, LIBRARY, IN_H, NOW, TZ);

// W_o (AC2): W_h at budget 14, so available 840 < 885 (over budget).
const W_o: Workout = { ...W_h, budgetMin: 14, unusedS: 0 };

// AC1: the QA repro. balancedHistory at budget 31, warm-up off, High (available 1860).
const IN_31 = input({ budgetMin: 31, warmupInBudget: false, energy: "high" });
const W_31 = suggest(balancedHistory, F_TARGETS, F_PROFILE, LIBRARY, IN_31, NOW, TZ);
const O_31 = swap(W_31, "leg-extension", "back-squat", null, balancedHistory);

describe("T-0226 fixtures (preconditions)", () => {
  it("rule-12 W has no back-off; W_h is R14-E9 (885 s, back-off 70 × 6, available 900)", () => {
    expect(W.plan.items.map((i) => [i.exerciseId, i.costS, i.backoff])).toEqual([
      ["bench-press", 720, null],
      ["inverted-row", 555, null],
      ["leg-extension", 270, null],
    ]);
    expect([W.itemsTotalS, avail(W)]).toEqual([1545, 1620]);
    expect(W_h.plan.items.map((i) => [i.exerciseId, i.sets, i.costS, i.backoff])).toEqual([
      ["bench-press", 4, 885, { weightKg: 70, reps: 6 }],
    ]);
    expect([W_h.itemsTotalS, avail(W_h), W_h.unusedS]).toEqual([885, 900, 15]);
    expect([W_o.itemsTotalS, avail(W_o)]).toEqual([885, 840]);
  });
});

// ---- AC1 ----

describe("rule 12 fitsBudget on an over-budget back-off slot: the QA repro (AC1)", () => {
  it("rule-12 (AC1) after leg-extension → back-squat, bench-press and push-up no longer 'fit' the main slot", () => {
    // Preconditions (the T-0224 review literals).
    expect([O_31.itemsTotalS, avail(O_31)]).toEqual([1995, 1860]);
    const main = O_31.plan.mainLiftId;
    expect(main).not.toBeNull();
    const mainItem = O_31.plan.items.find((i) => i.isMain);
    expect(mainItem?.exerciseId).toBe(main);
    expect(mainItem?.backoff).not.toBeNull();
    const list = rank(O_31, main as string, null, balancedHistory);
    expect(ids(list)).toEqual(expect.arrayContaining(["bench-press", "push-up"]));

    // Before D-0105 both were `fitsBudget: true` (the D-0056 §3 formula leaves out the
    // back-off set applySwap re-adds); applySwap gives 1995 > 1860 for each.
    for (const id of ["bench-press", "push-up"]) {
      const c = byId(list, id);
      expect(preD0105Fits(O_31, main as string, c), id).toBe(true);
      expect(c.fitsBudget, id).toBe(false);
      expect(swap(O_31, main as string, id, null, balancedHistory).itemsTotalS, id).toBe(1995);
    }
  });
});

// ---- AC2 ----

describe("rule 12 fitsBudget, R12-E12 (AC2)", () => {
  it("R12-E12 rule-12 (AC2) over budget, every non-timed candidate costs 720 and does not fit: 885 − 885 + 720 + 165 = 885 > 840", () => {
    const list = rank(W_o, "bench-press", null, H_b);
    expect(ids(list)).toEqual(expect.arrayContaining(["db-bench-press", "push-up"]));
    const lib = new Map(LIBRARY.map((e) => [e.id, e]));
    for (const c of list) {
      if (lib.get(c.exerciseId)?.timed === true) continue;
      // timeCostS unchanged: 4 × (45 + 120) + 60 = 720 (D-0105 §3).
      expect(c.timeCostS, c.exerciseId).toBe(720);
      // Before the fix: 885 − 885 + 720 = 720 ≤ 840 gave true.
      expect(preD0105Fits(W_o, "bench-press", c), c.exerciseId).toBe(true);
      expect(c.fitsBudget, c.exerciseId).toBe(false);
    }
    // R12-E10's rebuild: 720 + one back-off set 165 = 885.
    expect(swap(W_o, "bench-press", "db-bench-press", null, H_b).itemsTotalS).toBe(885);
  });

  it("R12-E12 rule-12 (AC2) contrast: on W_h (available 900) every non-timed candidate fits, 885 ≤ 900", () => {
    const list = rank(W_h, "bench-press", null, H_b);
    expect(list.length).toBeGreaterThan(0);
    for (const c of list) {
      expect(c.timeCostS, c.exerciseId).toBe(720);
      expect(c.fitsBudget, c.exerciseId).toBe(true);
      expect(swap(W_h, "bench-press", c.exerciseId, null, H_b).itemsTotalS).toBe(885);
    }
  });
});

// ---- AC3 ----

describe("rule 12 fitsBudget without a back-off is the D-0056 §3 value (AC3)", () => {
  it("rule-12 (AC3) on W at budget 25, 27 and 30, every candidate of every slot keeps its D-0056 §3 fitsBudget", () => {
    let checked = 0;
    const seen = new Set<boolean>();
    for (const b of [25, 27, 30]) {
      const p: Workout = { ...W, budgetMin: b };
      for (const item of p.plan.items) {
        expect(item.backoff).toBeNull();
        for (const r of [null, "short_on_time"] as const) {
          for (const c of rank(p, item.exerciseId, r, [])) {
            const want = p.itemsTotalS - item.costS + c.timeCostS <= avail(p);
            expect(c.fitsBudget, `${b} ${item.exerciseId}→${c.exerciseId}`).toBe(want);
            seen.add(want);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect([...seen].sort()).toEqual([false, true]);
  });
});

// ---- AC4 ----

const HISTORIES: Array<[string, readonly HistorySet[]]> = [
  ["balanced", balancedHistory],
  ["allChestNoLegs", allChestNoLegsHistory],
  ["returningAfter10Days", returningAfter10DaysHistory],
  ["offlineMerged", offlineMergedHistory],
  ["timedCore", timedCoreHistory],
  ["zero", []],
];
const INPUTS: Array<[string, SessionInput]> = [
  ["F-input", F_INPUT],
  ["15-high", input({ budgetMin: 15, warmupInBudget: false, energy: "high" })],
  ["31-high", IN_31],
];

describe("rule 12 fitsBudget is exactly applySwap's budget check (AC4, AC8)", () => {
  it("rule-12 (AC4) over fresh and over-budget plans of every history, fitsBudget === applySwap(…).itemsTotalS ≤ available", () => {
    // AC8: frozen inputs (a throw would fail the test) and reversed history / library.
    const library = deepFreeze(structuredClone(LIBRARY));
    const libraryRev = deepFreeze([...structuredClone(LIBRARY)].reverse());
    let checked = 0;
    let nonVacuous = 0;
    let overBudgetPlans = 0;
    let backoffSlots = 0;
    for (const [hn, h0] of HISTORIES) {
      const history = deepFreeze(structuredClone(h0) as HistorySet[]);
      const historyRev = deepFreeze([...structuredClone(h0)].reverse() as HistorySet[]);
      for (const [inName, inp] of INPUTS) {
        const w = deepFreeze(suggest(history, F_TARGETS, F_PROFILE, library, inp, NOW, TZ));
        const plans: Array<[string, Workout]> = [[`${hn}/${inName}`, w]];
        for (const k of w.plan.items.filter((i) => !i.isMain)) {
          const over = rank(w, k.exerciseId, null, history, library).filter((c) => !c.fitsBudget);
          for (const c of over.slice(0, 2)) {
            const o = deepFreeze(swap(w, k.exerciseId, c.exerciseId, null, history, library));
            plans.push([`${hn}/${inName}/${k.exerciseId}→${c.exerciseId}`, o]);
          }
        }
        if (hn === "balanced" && inName === "31-high") {
          plans.push(["AC1 O_31", deepFreeze(structuredClone(O_31))]);
        }
        for (const [label, p] of plans) {
          const before = structuredClone(p);
          if (p.itemsTotalS > avail(p)) overBudgetPlans++;
          for (const item of p.plan.items) {
            for (const r of [null, "short_on_time"] as const) {
              const list = rank(p, item.exerciseId, r, history, library);
              // AC8: reruns and reversed history / library are deep-equal.
              expect(rank(p, item.exerciseId, r, history, library)).toStrictEqual(list);
              expect(rank(p, item.exerciseId, r, historyRev, libraryRev)).toStrictEqual(list);
              for (const c of list) {
                const after = swap(p, item.exerciseId, c.exerciseId, r, history, library);
                const tag = `${label} ${item.exerciseId}→${c.exerciseId} ${String(r)}`;
                expect(c.fitsBudget, tag).toBe(after.itemsTotalS <= avail(p));
                checked++;
                if (item.backoff !== null) backoffSlots++;
                if (
                  item.backoff !== null &&
                  p.itemsTotalS > avail(p) &&
                  !c.fitsBudget &&
                  preD0105Fits(p, item.exerciseId, c)
                ) {
                  nonVacuous++;
                }
              }
            }
          }
          expect(p, label).toStrictEqual(before);
        }
      }
    }
    // Non-vacuity: over-budget plans, back-off slots, and candidates where D-0105 flips
    // the D-0056 §3 answer from true to false.
    expect(checked).toBeGreaterThan(0);
    expect(overBudgetPlans).toBeGreaterThan(0);
    expect(backoffSlots).toBeGreaterThan(0);
    expect(nonVacuous).toBeGreaterThan(0);
  }, 30_000); // runtime budget only (sweep)
});

// ---- AC5 (retired) ----
// "suggest is byte-identical to the pre-T-0226 snapshot (AC5)" compared every AC4 fresh plan
// against output captured on main before D-0105. That was a one-time proof, recorded in the
// T-0226 build and accept log (docs/tickets/T-0226-…). Retired by T-0237.

// ---- AC6 ----

// A timed compound sharing chest at weight 1.0, so a timed candidate can reach the main slot
// (LIBRARY has none). Work 30 s + compound rest 120 s = 150 s per set, 4 × 150 + 60 = 660 s.
const TIMED_COMPOUND: LibraryExercise = {
  id: "zz-chest-hold",
  name: "Chest hold",
  kind: "exercise",
  type: "compound",
  level: "beginner",
  equipment: [],
  areas: { chest: 1 },
  timed: true,
  defaultDurationS: 30,
  incrementKg: null,
  externalLoad: false,
};
const LIB_T: LibraryExercise[] = [...LIBRARY, TIMED_COMPOUND];

describe("one back-off predicate, shared by applySwap and rankSwaps (AC6)", () => {
  it("rule-12 (AC6) getsBackoff: true for a non-timed exercise on a back-off slot, false for a timed one or no back-off", () => {
    const bench = LIBRARY.find((e) => e.id === "bench-press") as LibraryExercise;
    const plank = LIBRARY.find((e) => e.id === "plank") as LibraryExercise;
    expect(getsBackoff(true, bench)).toBe(true);
    expect(getsBackoff(true, plank)).toBe(false);
    expect(getsBackoff(true, TIMED_COMPOUND)).toBe(false);
    expect(getsBackoff(false, bench)).toBe(false);
    expect(getsBackoff(false, plank)).toBe(false);
  });

  it("rule-12 (AC6) on W_h, applySwap's item has a back-off exactly when costS − timeCostS is the candidate's set cost", () => {
    const list = rank(W_h, "bench-press", null, H_b);
    expect(list.length).toBeGreaterThan(0);
    for (const c of list) {
      const ex = LIBRARY.find((e) => e.id === c.exerciseId) as LibraryExercise;
      const item = swap(W_h, "bench-press", c.exerciseId, null, H_b).plan.items[0];
      expect(item?.backoff, c.exerciseId).not.toBeNull();
      expect((item?.costS ?? 0) - c.timeCostS, c.exerciseId).toBe(setCostS(ex));
    }
  });

  it("rule-12 (AC6) contrast on W (no back-off): no candidate's item gets one and costS === timeCostS", () => {
    for (const slot of W.plan.items) {
      for (const c of rank(W, slot.exerciseId, null, [])) {
        const r = swap(W, slot.exerciseId, c.exerciseId, null, []);
        const item = r.plan.items.find((i) => i.exerciseId === c.exerciseId);
        expect(item?.backoff, c.exerciseId).toBeNull();
        expect(item?.costS, c.exerciseId).toBe(c.timeCostS);
      }
    }
  });

  it("rule-12 (AC6) a timed candidate on a back-off slot adds no back-off set: fitsBudget 660 ≤ 780, applySwap 660", () => {
    // W_h over LIB_T at budget 13 (available 780 < 885). The timed compound: timeCostS 660,
    // extra 0, so 885 − 885 + 660 = 660 ≤ 780 fits (counting a 150 s back-off, 810, would not).
    const w = suggest(H_b, F_TARGETS, F_PROFILE, LIB_T, IN_H, NOW, TZ);
    expect(w.plan.items.map((i) => [i.exerciseId, i.costS])).toEqual([["bench-press", 885]]);
    const p: Workout = { ...w, budgetMin: 13, unusedS: 0 };
    const list = rank(p, "bench-press", null, H_b, LIB_T);
    const t = byId(list, TIMED_COMPOUND.id);
    expect(t.timeCostS).toBe(660);
    expect(t.fitsBudget).toBe(true);
    const r = swap(p, "bench-press", TIMED_COMPOUND.id, null, H_b, LIB_T);
    expect(r.plan.items[0]?.backoff).toBeNull();
    expect(r.itemsTotalS).toBe(660);
    // The non-timed candidates on the same slot: 720 + 165 = 885 > 780.
    for (const c of list.filter((x) => x.exerciseId !== TIMED_COMPOUND.id)) {
      expect(c.fitsBudget, c.exerciseId).toBe(false);
      expect(swap(p, "bench-press", c.exerciseId, null, H_b, LIB_T).itemsTotalS).toBe(885);
    }
  });
});

// ---- AC8 (AC1 and AC2 calls) ----

describe("purity and determinism of the AC1 and AC2 calls (AC8)", () => {
  it("rule-0 (AC8) frozen inputs, reruns and reversed history / library give the same rankSwaps lists", () => {
    const cases: Array<[Workout, string, readonly HistorySet[]]> = [
      [O_31, O_31.plan.mainLiftId as string, balancedHistory],
      [W_o, "bench-press", H_b],
      [W_h, "bench-press", H_b],
    ];
    for (const [p0, cur, h0] of cases) {
      const p = deepFreeze(structuredClone(p0));
      const h = deepFreeze(structuredClone(h0) as HistorySet[]);
      const lib = deepFreeze(structuredClone(LIBRARY));
      const before = structuredClone([p, h, lib]);
      const list = rank(p, cur, null, h, lib);
      expect(rank(p, cur, null, h, lib)).toStrictEqual(list);
      expect(rank(p, cur, null, [...h].reverse(), [...lib].reverse())).toStrictEqual(list);
      expect(rank(p0, cur, null, h0)).toStrictEqual(list);
      for (const c of list) swap(p, cur, c.exerciseId, null, h, lib);
      expect([p, h, lib]).toStrictEqual(before);
    }
  });
});

// ---- AC7 ----

const DOC = readFileSync(path.join(REPO_DIR, "docs", "engine-rules.md"), "utf8");

describe("T-0226 rule 12.1 contract text (D-0105 §5) (AC7)", () => {
  const s = DOC.indexOf("### 12.1 applySwap");
  const e = DOC.indexOf("## 13.", s);
  const RULE_12_1 = DOC.slice(s, e);

  it("rule-12 (AC7) §12.1 has one fitsBudget bullet citing D-0105", () => {
    expect(s).toBeGreaterThan(-1);
    expect(e).toBeGreaterThan(s);
    const lines = RULE_12_1.split("\n").filter((l) => l.startsWith("- **fitsBudget"));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("D-0105");
  });

  it("R12-E12 rule-12 (AC7) §12.1 has the R12-E12 example citing D-0105", () => {
    const lines = RULE_12_1.split("\n").filter((l) => l.startsWith("- **R12-E12"));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("D-0105");
    expect(lines[0]).toContain("840");
  });

  it("rule-12 (AC7) the Traceability table has exactly one T-0226 row", () => {
    const table = DOC.slice(DOC.indexOf("## Traceability"));
    expect(table.split("\n").filter((l) => /^\|.*\|\s*T-0226\s*\|$/.test(l))).toHaveLength(1);
  });
});
