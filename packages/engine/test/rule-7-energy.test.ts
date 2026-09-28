// T-0201b UF-08.1: rule 7.4 energy Low / High and floorInc (D-0024, D-0026, D-0040 §4–§6).
// AC25–AC27.
import { describe, expect, it } from "vitest";
import { floorInc, suggest, type SessionInput, type Workout } from "@workoutlab/engine";
import { F_PROFILE, F_TARGETS, LIBRARY, NOW, TZ, input, itemsOf } from "./fixtures/common.js";

function run(overrides: Partial<SessionInput> = {}): Workout {
  return suggest([], F_TARGETS, F_PROFILE, LIBRARY, input(overrides), NOW, TZ);
}

function item(w: Workout, id: string) {
  const found = w.plan.items.find((i) => i.exerciseId === id);
  if (!found) throw new Error(`item ${id} missing`);
  return found;
}

const codes = (w: Workout, id: string): string[] => item(w, id).reasons.map((r) => r.code);

describe("rule 7.4 energy", () => {
  it("R7-E11 rule-7 (AC25) Low trims 3-set accessories to 2, keeps the main lift, leaves the time unused", () => {
    const normal = run();
    const low = run({ energy: "low" });
    expect(itemsOf(low)).toEqual([
      ["bench-press", 4],
      ["inverted-row", 2],
      ["leg-extension", 2],
    ]);
    expect(low.itemsTotalS).toBe(1380);
    expect(low.totalS).toBe(1560);
    expect(low.unusedS).toBe(240);
    expect(item(low, "inverted-row").costS).toBe(390);
    expect(item(low, "inverted-row").reasons).toEqual([
      { code: "area_deficit", area: "back", deficit: 1 },
      { code: "days_since", area: "back", days: null },
      { code: "energy_low_trim" },
      { code: "prefill", kind: "first_time" },
    ]);
    // leg-extension was already at 2 sets, so it isn't trimmed and gets no reason.
    expect(codes(low, "leg-extension")).not.toContain("energy_low_trim");
    expect(codes(low, "bench-press")).not.toContain("energy_low_trim");
    expect(codes(low, "bench-press")).not.toContain("energy_high_backoff");
    expect(item(low, "bench-press")).toEqual(item(normal, "bench-press"));
    expect(low.energy).toBe("low");
    expect(low.plan.warmup).toEqual(normal.plan.warmup);
  });

  it("R7-E12 rule-7 (AC26) High adds no back-off when unusedS 75 < 165", () => {
    const normal = run();
    const high = run({ energy: "high" });
    expect(high.plan).toEqual(normal.plan);
    expect(high.itemsTotalS).toBe(1545);
    expect(high.unusedS).toBe(75);
    for (const i of high.plan.items) {
      expect(i.backoff).toBeNull();
      expect(i.reasons.map((r) => r.code)).not.toContain("energy_high_backoff");
    }
  });

  it("R7-E12 rule-7 (AC26) High at 15 min, warm-up off adds one back-off set to bench-press (885 s)", () => {
    const high = run({ budgetMin: 15, warmupInBudget: false, energy: "high" });
    expect(itemsOf(high)).toEqual([["bench-press", 4]]);
    const main = item(high, "bench-press");
    expect(main.isMain).toBe(true);
    expect(main.sets).toBe(4);
    expect(main.backoff).toEqual({ weightKg: null, reps: 6 });
    expect(main.costS).toBe(885);
    expect(main.reasons).toEqual([
      { code: "main_lift" },
      { code: "area_deficit", area: "chest", deficit: 1 },
      { code: "days_since", area: "chest", days: null },
      { code: "energy_high_backoff" },
      { code: "prefill", kind: "first_time" },
    ]);
    expect(high.itemsTotalS).toBe(885);
    expect(high.totalS).toBe(1065);
    expect(high.unusedS).toBe(15);
    // The same inputs at normal energy leave 180 s unused and no back-off.
    const normal = run({ budgetMin: 15, warmupInBudget: false });
    expect(normal.unusedS).toBe(180);
    expect(item(normal, "bench-press").backoff).toBeNull();
  });

  it("rule-7 (AC26) a bodyweight main lift gets a 0 kg back-off (floorInc of 0)", () => {
    const high = run({ budgetMin: 15, warmupInBudget: false, energy: "high" });
    const bw = suggest(
      [],
      F_TARGETS,
      { ...F_PROFILE, equipment: [] },
      LIBRARY,
      input({ budgetMin: 15, warmupInBudget: false, energy: "high" }),
      NOW,
      TZ,
    );
    expect(itemsOf(bw)).toEqual([["push-up", 4]]);
    expect(item(bw, "push-up").backoff).toEqual({ weightKg: 0, reps: 6 });
    expect(item(bw, "push-up").costS).toBe(item(high, "bench-press").costS);
  });

  it("rule-7 (AC27) floorInc rounds to 3 decimals, then floors to the increment", () => {
    expect(floorInc(0.9 * 80, 2.5)).toBe(70);
    expect(floorInc(0.9 * 102.5, 2.5)).toBe(90);
    expect(floorInc(0.9 * 100, 2.5)).toBe(90);
    expect(floorInc(0.9 * 100)).toBe(90);
    expect(floorInc(0, 2.5)).toBe(0);
    expect(floorInc(0.3, 0.1)).toBe(0.3);
    expect(() => floorInc(50, 0)).toThrow(RangeError);
  });
});
