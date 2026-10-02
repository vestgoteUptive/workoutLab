// T-0220 (D-0131, rule 7.4, UF-08.2): the light-lift fixtures and the AC6 sweep cases.
import type { HistorySet, SessionInput } from "../../src/index.js";
import { input, setsOn } from "./common.js";
import { SIMULATED_HISTORIES } from "./histories.js";

/** `light(w)`: bench-press `w` × 6, 6, 6 on 2026-09-24 at 10:00. */
export function light(w: number, date = "2026-09-24"): HistorySet[] {
  return setsOn(3, "bench-press", date, { tag: `light${w}:` }).map((r) => ({
    ...r,
    weightKg: w,
    reps: 6,
  }));
}

/** `hi15`: bench-press main, budget 15, warm-up off, High energy. */
export const hi15: SessionInput = input({
  mainLiftId: "bench-press",
  budgetMin: 15,
  warmupInBudget: false,
  energy: "high",
});

/** AC6 light 14-day history: `light(2.5)` on 09-15, 09-19 and 09-24 (distinct session/client ids). */
export const lightHistory: HistorySet[] = ["2026-09-15", "2026-09-19", "2026-09-24"].flatMap((d) =>
  light(2.5, d),
);

export const SWEEP_HISTORIES: ReadonlyArray<readonly [string, HistorySet[]]> = [
  ...Object.entries(SIMULATED_HISTORIES),
  ["empty", []],
  ["light", lightHistory],
];

/** AC6 inputs: High energy, bench-press main, budget 15..120 step 5, warm-up on and off. */
export function sweepInputs(): Array<[string, SessionInput]> {
  const out: Array<[string, SessionInput]> = [];
  for (let b = 15; b <= 120; b += 5) {
    for (const wu of [true, false]) {
      out.push([
        `b${b}|wu${wu ? "on" : "off"}`,
        input({ mainLiftId: "bench-press", budgetMin: b, warmupInBudget: wu, energy: "high" }),
      ]);
    }
  }
  return out;
}
