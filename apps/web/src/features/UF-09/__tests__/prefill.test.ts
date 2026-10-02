// T-0304b AC-8 (`nextSetPrefill`, D-0066 §6, D-0118 §7) and the AC-6 weight parsing
// (`weight-input.ts`, D-0118 §6). Pure functions, no DOM.
import { describe, expect, it } from "vitest";
import type { SessionPlan } from "@workoutlab/shared";
import type { LoggedSet } from "../machine.js";
import { nextSetPrefill } from "../prefill.js";
import { parseWeight, stepWeight } from "../weight-input.js";
import { BENCH, CURL, P1 } from "./fixtures.js";

function logged(setIndex: number, reps: number | null, weightKg: number | null): LoggedSet {
  return {
    clientId: `c${setIndex}`,
    itemIndex: 0,
    setIndex,
    exerciseId: "bench-press",
    reps,
    weightKg,
    durationS: null,
    rir: null,
    backoff: false,
  };
}

const WITH_BACKOFF: SessionPlan = {
  ...P1,
  items: [{ ...BENCH, backoff: { weightKg: 70, reps: 6 } }],
};
const NULL_REPS: SessionPlan = {
  ...P1,
  items: [{ ...BENCH, prefill: { ...BENCH.prefill, reps: null } }],
};

describe("AC-8 nextSetPrefill", () => {
  it.each([
    ["set 1: item.prefill", P1, 0, 0, [], { weightKg: 80, reps: 6 }],
    ["set 1 of leg-curl: a null weight stays null", P1, 2, 0, [], { weightKg: null, reps: 10 }],
    ["set 1 with prefill.reps null → repsMin", NULL_REPS, 0, 0, [], { weightKg: 80, reps: 6 }],
    ["carry: set 2 from saved set 1", P1, 0, 1, [logged(0, 5, 77.5)], { weightKg: 77.5, reps: 5 }],
    [
      "carry: set 3 from set 2, not set 1",
      P1,
      0,
      2,
      [logged(0, 5, 77.5), logged(1, 4, 75)],
      { weightKg: 75, reps: 4 },
    ],
    [
      "null weight on set 1 → the set 1 weight",
      P1,
      0,
      1,
      [logged(0, 5, null)],
      { weightKg: 80, reps: 5 },
    ],
    [
      "null reps on set 1 → the set 1 reps",
      P1,
      0,
      1,
      [logged(0, null, 77.5)],
      { weightKg: 77.5, reps: 6 },
    ],
    [
      "no saved set k − 1 → the set 1 values",
      P1,
      0,
      2,
      [logged(0, 5, 77.5)],
      { weightKg: 80, reps: 6 },
    ],
    [
      "back-off set → backoff values",
      WITH_BACKOFF,
      0,
      4,
      [logged(3, 5, 77.5)],
      { weightKg: 70, reps: 6 },
    ],
    [
      "the pair: a set under item.sets with a back-off plan carries",
      WITH_BACKOFF,
      0,
      3,
      [logged(2, 5, 77.5)],
      { weightKg: 77.5, reps: 5 },
    ],
  ] as const)("%s", (_, plan, itemIndex, setIndex, sets, expected) => {
    expect(nextSetPrefill(plan, itemIndex, setIndex, sets)).toEqual(expected);
  });

  it("the newest saved entry at set k − 1 wins, and other items are ignored", () => {
    const other = { ...logged(0, 12, 20), itemIndex: 1, exerciseId: "barbell-row" };
    expect(
      nextSetPrefill(P1, 0, 1, [logged(0, 5, 70), other, { ...logged(0, 4, 72.5), clientId: "z" }]),
    ).toEqual({ weightKg: 72.5, reps: 4 });
  });

  it("leg-curl carries a typed weight from set 1", () => {
    const set: LoggedSet = { ...logged(0, 10, 40), itemIndex: 2, exerciseId: CURL.exerciseId };
    expect(nextSetPrefill(P1, 2, 1, [set])).toEqual({ weightKg: 40, reps: 10 });
  });
});

describe("AC-6 parseWeight", () => {
  it.each([
    ["80", 80],
    ["77.5", 77.5],
    ["77,5", 77.5],
    [" 82.25 ", 82.25],
    ["0", 0],
  ])("%j → %d", (text, value) => {
    expect(parseWeight(text)).toEqual({ ok: true, value });
  });

  it.each(["", "   "])("%j → null (no weight)", (text) => {
    expect(parseWeight(text)).toEqual({ ok: true, value: null });
  });

  it.each(["abc", "77.", ".5", "1.234", "77.5.5", "7,5,5", "-5", "1e2", "8 0"])(
    "%j is invalid",
    (text) => {
      expect(parseWeight(text)).toEqual({ ok: false });
    },
  );

  it("stepWeight counts from 0 for an empty or invalid field, and floors at 0", () => {
    expect(stepWeight("80", 2.5)).toBe(82.5);
    expect(stepWeight("80", -2.5)).toBe(77.5);
    expect(stepWeight("", 2.5)).toBe(2.5);
    expect(stepWeight("abc", 5)).toBe(5);
    expect(stepWeight("abc", -2.5)).toBe(0);
    expect(stepWeight("1", -2.5)).toBe(0);
    expect(stepWeight("0.1", 0.2)).toBe(0.3);
  });
});
