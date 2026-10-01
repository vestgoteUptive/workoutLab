// T-0224 UF-05.1 UF-08.3: applySwap over the simulated 14-day histories (engine-rules §Required
// tests, D-0093). AC12: for every item of every suggested workout and every rankSwaps
// candidate, applySwap agrees with suggest's item builder, rankSwaps' timeCostS and fitsBudget,
// and rule 14's prefill with carry; swapping back restores the original item.
import { describe, expect, it } from "vitest";
import {
  applySwap,
  availableS,
  plannedDurationS,
  prefill,
  rankSwaps,
  setCostS,
  suggest,
  type HistorySet,
  type LibraryExercise,
  type PrefillSlot,
  type SessionInput,
  type Workout,
  type WorkoutItem,
} from "@workoutlab/engine";
import { F_INPUT, F_PROFILE, F_TARGETS, LIBRARY, NOW, TZ, input } from "./fixtures/common.js";
import { SIMULATED_HISTORIES } from "./fixtures/histories.js";
import { timedCoreHistory } from "./fixtures/histories-timed.js";

const HISTORIES: Array<[string, HistorySet[]]> = [
  ...Object.entries(SIMULATED_HISTORIES),
  ["timedCore", timedCoreHistory],
  ["zero", []],
];

const INPUTS: Array<[string, SessionInput]> = [
  ["F-input", F_INPUT],
  ["15-high", input({ budgetMin: 15, warmupInBudget: false, energy: "high" })],
  // Beyond AC12's two inputs: neither plans a core slot, so this one reaches timed swaps
  // (plank ↔ dead-bug / hanging-knee-raise, D-0092) over every history, timedCore included.
  ["45-plank", input({ budgetMin: 45, pinnedIds: ["plank"] })],
];

const LIB = new Map(LIBRARY.map((e) => [e.id, e]));
const exOf = (id: string): LibraryExercise => {
  const e = LIB.get(id);
  if (e === undefined) throw new Error(`no ${id}`);
  return e;
};

/** Rule 7.2's rep slot, re-derived here rather than taken from the engine. */
function slotOf(ex: LibraryExercise, isMain: boolean): PrefillSlot {
  if (ex.timed) return { repsMin: null, repsMax: null };
  if (isMain) return { repsMin: 6, repsMax: 8 };
  return ex.type === "compound" ? { repsMin: 8, repsMax: 12 } : { repsMin: 10, repsMax: 15 };
}

/** `item` as `suggest` built it, with the `swap {null}` reason applySwap adds after days_since. */
function withSwapReason(item: WorkoutItem): WorkoutItem {
  const at = item.reasons.findIndex((r) => r.code === "days_since") + 1;
  const reasons = [...item.reasons];
  reasons.splice(at, 0, { code: "swap", reason: null });
  return { ...item, reasons };
}

/**
 * The swap-backs whose pre-fill is now `carry` (AC12): the original exercise has no usable
 * history of its own, and the candidate's pre-fill weight (> 0, carried or its own) shares a
 * weight-1.0 area and an equipment item with it (rule 14 step 1). Listed literally, as
 * `history/input/original<-candidate`, so this is not a blanket exclusion.
 */
const CARRY_ON_RESTORE: string[] = [
  // balanced: the main lift is db-bench-press (bench-press was in the last session, D-0040 §9)
  // with no history, so suggest pre-fills it `first_time`. bench-press has its own 50 × 8
  // history, and swapping back carries bench-press's pre-fill weight (chest 1.0, bench).
  "balanced/F-input/db-bench-press<-bench-press",
  "balanced/15-high/db-bench-press<-bench-press",
  "balanced/45-plank/db-bench-press<-bench-press",
];

interface Case {
  name: string;
  history: HistorySet[];
  w: Workout;
  k: number;
}

function cases(): Case[] {
  const out: Case[] = [];
  for (const [hName, history] of HISTORIES) {
    for (const [iName, si] of INPUTS) {
      const w = suggest(history, F_TARGETS, F_PROFILE, LIBRARY, si, NOW, TZ);
      for (let k = 0; k < w.plan.items.length; k++) {
        out.push({ name: `${hName}/${iName}`, history, w, k });
      }
    }
  }
  return out;
}

describe("applySwap over the simulated 14-day histories (AC12)", () => {
  it("rule-12 (AC12) every rankSwaps candidate of every item agrees with suggest, rankSwaps and prefill; swap-back restores", () => {
    const carryOnRestore: string[] = [];
    let swaps = 0;
    let backoffs = 0;
    let timed = 0;
    const kinds = new Set<string>();
    for (const { name, history, w, k } of cases()) {
      const old = w.plan.items[k] as WorkoutItem;
      const available = availableS(w.budgetMin, w.warmupInBudget);
      const ranked = rankSwaps(old.exerciseId, null, w, F_PROFILE, LIBRARY, history, NOW, TZ);
      for (const c of ranked) {
        const label = `${name}/${old.exerciseId}->${c.exerciseId}`;
        const r = applySwap(
          w,
          old.exerciseId,
          c.exerciseId,
          null,
          history,
          F_PROFILE,
          LIBRARY,
          NOW,
          TZ,
        );
        const item = r.plan.items[k] as WorkoutItem;
        const next = exOf(c.exerciseId);
        swaps += 1;
        if (item.backoff !== null) backoffs += 1;
        if (next.timed || exOf(old.exerciseId).timed) timed += 1;
        kinds.add(item.prefill.kind);

        expect(r.plan.items, label).toHaveLength(w.plan.items.length);
        expect(item.exerciseId, label).toBe(c.exerciseId);
        expect([item.isMain, item.sets], label).toEqual([old.isMain, old.sets]);
        const backoffSetS =
          item.backoff === null
            ? 0
            : setCostS(next, plannedDurationS(next, history, LIBRARY, NOW, TZ));
        expect(item.costS, label).toBe(c.timeCostS + backoffSetS);
        expect(c.fitsBudget, label).toBe(r.itemsTotalS <= available);
        expect(item.prefill, label).toStrictEqual(
          prefill(next, slotOf(next, old.isMain), history, LIBRARY, NOW, TZ, {
            exerciseId: old.exerciseId,
            weightKg: old.prefill.weightKg,
          }),
        );
        r.plan.items.forEach((it, i) => {
          if (i !== k) expect(it, `${label} item ${i}`).toStrictEqual(w.plan.items[i]);
        });

        // Swapping back restores the original item, apart from `swap {null}` and a pre-fill
        // that may now carry the candidate's weight (listed in CARRY_ON_RESTORE).
        const back = applySwap(
          r,
          c.exerciseId,
          old.exerciseId,
          null,
          history,
          F_PROFILE,
          LIBRARY,
          NOW,
          TZ,
        );
        const restored = back.plan.items[k] as WorkoutItem;
        const expected = withSwapReason(old);
        if (restored.prefill.kind === "carry" && old.prefill.kind !== "carry") {
          carryOnRestore.push(`${name}/${old.exerciseId}<-${c.exerciseId}`);
          expect(restored.prefill.weightKg, label).toBe(item.prefill.weightKg);
          const reasons = expected.reasons.map((x) =>
            x.code === "prefill" ? { code: "prefill" as const, kind: "carry" as const } : x,
          );
          expect(
            { ...restored, prefill: old.prefill, backoff: old.backoff, reasons },
            label,
          ).toStrictEqual({ ...expected, reasons });
        } else {
          expect(restored, label).toStrictEqual(expected);
        }
        expect(back.plan.items.filter((_, i) => i !== k)).toStrictEqual(
          w.plan.items.filter((_, i) => i !== k),
        );
        expect([back.itemsTotalS, back.unusedS], label).toEqual([w.itemsTotalS, w.unusedS]);
      }
    }
    expect(carryOnRestore.sort()).toEqual([...CARRY_ON_RESTORE].sort());
    // The sweep is not vacuous: it reaches back-off slots, timed candidates and carry.
    expect({ swaps, backoffs, timed, kinds: [...kinds].sort() }).toStrictEqual({
      swaps: 103,
      backoffs: 15,
      timed: 12,
      kinds: ["add_rep", "carry", "deload", "first_time", "hold_after_break", "increase"],
    });
  }, 30_000); // runtime budget only (sweep)
});
