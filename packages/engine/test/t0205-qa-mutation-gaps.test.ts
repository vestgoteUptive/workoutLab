// T-0205 QA (rule 14, UF-08.2, UF-09.3): tests that close the gaps QA's mutation testing found in
// the suggest → prefill wiring. Each expectation is derived by hand from docs/engine-rules.md
// rule 14, D-0057 and D-0062; the derivation is in the comment above each assertion.
import { describe, expect, it } from "vitest";
import {
  prefill,
  suggest,
  type LibraryExercise,
  type SessionInput,
  type Workout,
  type WorkoutItem,
} from "@workoutlab/engine";
import { F_PROFILE, F_TARGETS, LIBRARY, NOW, TZ, input, setsWithReps } from "./fixtures/common.js";

const run = (h: Parameters<typeof suggest>[0], si: SessionInput, now = NOW): Workout =>
  suggest(h, F_TARGETS, F_PROFILE, LIBRARY, si, now, TZ);

function item(w: Workout, id: string): WorkoutItem {
  const found = w.plan.items.find((i) => i.exerciseId === id);
  if (found === undefined) throw new Error(`no ${id} in plan`);
  return found;
}

describe("T-0205 QA: carry across two shuffled slots (D-0056 §11, D-0062 §6)", () => {
  // back-squat 80 × 12, 12 on 09-19 → at 8–12 every set ≥ 12 → increase 82.5 × 8.
  // db-bench-press 20 × 12, 12 on 09-19 → increase 20 + 2 = 22 × 8.
  // leg-extension 80 × 12, 12 on 09-20 (keeps the plan shape; not a carry source here).
  const h = [
    ...setsWithReps("2026-09-19", "back-squat", [
      [80, 12],
      [80, 12],
    ]),
    ...setsWithReps("2026-09-20", "leg-extension", [
      [80, 12],
      [80, 12],
    ]),
    ...setsWithReps("2026-09-19", "db-bench-press", [
      [20, 12],
      [20, 12],
    ]),
  ];
  const si = input({ budgetMin: 90 });

  it("rule-14 (AC18) each shuffled slot carries from its OWN original: back-squat → hip-thrust 82.5, db-bench-press → bench-press 22", () => {
    const base = run(h, si);
    expect(item(base, "back-squat").prefill).toEqual({
      weightKg: 82.5,
      reps: 8,
      durationS: null,
      kind: "increase",
    });
    expect(item(base, "db-bench-press").prefill).toEqual({
      weightKg: 22,
      reps: 8,
      durationS: null,
      kind: "increase",
    });

    const w = run(h, { ...si, shuffle: 1 });
    const hip = item(w, "hip-thrust");
    const bench = item(w, "bench-press");
    // Both slots were shuffled (rule 13).
    expect(hip.reasons).toContainEqual({ code: "swap", reason: null });
    expect(bench.reasons).toContainEqual({ code: "swap", reason: null });
    // hip-thrust shares glutes (1.0) and barbell with back-squat → carry 82.5 at 8–12 low.
    expect(hip.prefill).toEqual({ weightKg: 82.5, reps: 8, durationS: null, kind: "carry" });
    // bench-press shares chest (1.0) and bench with db-bench-press → carry 22. With back-squat's
    // previous instead (barbell shared, no weight-1.0 area) it would be first_time: a slot mix-up
    // is visible.
    expect(bench.prefill).toEqual({ weightKg: 22, reps: 8, durationS: null, kind: "carry" });
    // The originals left the plan: nothing else carries.
    expect(
      w.plan.items
        .filter((i) => i.prefill.kind === "carry")
        .map((i) => i.exerciseId)
        .sort(),
    ).toEqual(["bench-press", "hip-thrust"]);
  });
});

describe("T-0205 QA: suggest dates D in tz, not UTC (D-0057 §9)", () => {
  // now = 2026-09-27T00:30+02:00 = 2026-09-26T22:30Z. Local D = 09-27; the UTC date is 09-26.
  // back-squat 100 × 8, 8, 8 on 09-17 10:00 local, as the chosen main (6–8):
  //   local gap = 09-27 − 09-17 = 10 → step 3, 100 × 6 hold_after_break.
  //   (a UTC D would give gap 9 → step 4, 102.5 × 6 increase.)
  const NOW_EARLY = "2026-09-27T00:30:00+02:00";
  const h = setsWithReps("2026-09-17", "back-squat", [
    [100, 8],
    [100, 8],
    [100, 8],
  ]);

  it("rule-14 (AC13) suggest just after local midnight: gap 10 → hold_after_break, the same as prefill()", () => {
    const w = run(h, input({ mainLiftId: "back-squat" }), NOW_EARLY);
    const squat = item(w, "back-squat");
    expect(squat.isMain).toBe(true);
    expect(squat.prefill).toEqual({
      weightKg: 100,
      reps: 6,
      durationS: null,
      kind: "hold_after_break",
    });
    expect(squat.reasons).toContainEqual({ code: "prefill", kind: "hold_after_break" });
    const ex = LIBRARY.find((e) => e.id === "back-squat") as LibraryExercise;
    expect(prefill(ex, { repsMin: 6, repsMax: 8 }, h, LIBRARY, NOW_EARLY, TZ, null)).toEqual(
      squat.prefill,
    );
  });

  it("rule-14 (AC13) suggest one day earlier at 23:30 local: gap 9 → increase", () => {
    // now = 2026-09-26T23:30+02:00 → D = 09-26, gap 9 → step 4, 102.5 × 6.
    const w = run(h, input({ mainLiftId: "back-squat" }), "2026-09-26T23:30:00+02:00");
    expect(item(w, "back-squat").prefill).toEqual({
      weightKg: 102.5,
      reps: 6,
      durationS: null,
      kind: "increase",
    });
  });
});
