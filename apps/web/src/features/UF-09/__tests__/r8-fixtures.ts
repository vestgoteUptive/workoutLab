// T-0304d fixtures: P1-R8, P1 with the engine's rule 8 fixture items (packages/engine/test/
// rule-8-timecheck.test.ts) and their `area_deficit` reasons, the start deficits chest .8,
// back .6, hamstrings .9, shoulders .5, and lateral-raise added to the test library.
import type { LibraryExercise, SessionPlan } from "@workoutlab/shared";
import { BENCH, CURL, L1, P1, ROW, S1, STARTED_AT_MS } from "./fixtures.js";

type Item = SessionPlan["items"][number];
type Area = keyof SessionPlan["startDeficits"];

const because = (area: Area): Item["reasons"][number] => ({
  code: "area_deficit",
  area,
  deficit: 1,
});

export const LATERAL_RAISE: LibraryExercise = {
  id: "lateral-raise",
  name: "Lateral raise",
  kind: "exercise",
  type: "isolation",
  level: "beginner",
  equipment: ["dumbbell"],
  areas: { shoulders: 1 },
  timed: false,
  defaultDurationS: null,
  incrementKg: 1,
  externalLoad: true,
};

/** L1 plus lateral-raise. */
export const L_R8: LibraryExercise[] = [...L1, LATERAL_RAISE];

export const R8_BENCH: Item = { ...BENCH, reasons: [{ code: "main_lift" }, because("chest")] };
export const R8_ROW: Item = { ...ROW, reasons: [because("back")] };
export const R8_CURL: Item = {
  ...CURL,
  prefill: { ...CURL.prefill, weightKg: 30 },
  reasons: [because("hamstrings")],
};
export const R8_LATERAL: Item = {
  exerciseId: "lateral-raise",
  isMain: false,
  sets: 3,
  repsMin: 10,
  repsMax: 15,
  durationS: null,
  costS: 375,
  backoff: null,
  prefill: { weightKg: 8, reps: 10, durationS: null, kind: "add_rep" },
  reasons: [because("shoulders")],
};

export const R8_PLAN: SessionPlan = {
  ...P1,
  items: [R8_BENCH, R8_ROW, R8_CURL, R8_LATERAL],
  startDeficits: { ...P1.startDeficits, chest: 0.8, back: 0.6, hamstrings: 0.9, shoulders: 0.5 },
};

/** At `STARTED_AT + s` seconds (ms). */
export const at = (s: number) => STARTED_AT_MS + s * 1000;

export const KEY_R8 = `wl-focus:${S1}`;

/** Bench sets 0…n−1 logged. */
export function benchSets(n: number) {
  return Array.from({ length: n }, (_, setIndex) => ({
    clientId: `b${setIndex}`,
    itemIndex: 0,
    setIndex,
    exerciseId: "bench-press",
    reps: 6,
    weightKg: 80,
    durationS: null,
    rir: null,
    backoff: false,
  }));
}
