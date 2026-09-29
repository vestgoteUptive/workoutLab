// T-0205 rule 14 UF-09.3 UF-09.4 UF-08.2: `prefill` — the 7-step waterfall, the timed
// branch and `carry` (docs/engine-rules.md rule 14, D-0026, D-0057, D-0060). AC1–AC15, AC20.
import { describe, expect, it } from "vitest";
import {
  prefill,
  type HistorySet,
  type LibraryExercise,
  type PrefillPrevious,
  type PrefillResult,
  type PrefillSlot,
} from "../src/index.js";
import { LIBRARY, NOW, TZ, setsWithReps, type SetEntry } from "./fixtures/common.js";

const MAIN: PrefillSlot = { repsMin: 6, repsMax: 8 };
const COMPOUND: PrefillSlot = { repsMin: 8, repsMax: 12 };
const ISOLATION: PrefillSlot = { repsMin: 10, repsMax: 15 };
const TIMED: PrefillSlot = { repsMin: null, repsMax: null };

function ex(id: string): LibraryExercise {
  const found = LIBRARY.find((e) => e.id === id);
  if (found === undefined) throw new Error(`no ${id} in LIBRARY`);
  return found;
}

function pf(
  id: string,
  slot: PrefillSlot,
  history: readonly HistorySet[],
  previous: PrefillPrevious | null = null,
  opts: { now?: string; library?: readonly LibraryExercise[] } = {},
): PrefillResult {
  return prefill(ex(id), slot, history, opts.library ?? LIBRARY, opts.now ?? NOW, TZ, previous);
}

/** "S(date, exerciseId, [w × r, …])" (T-0205 fixture notation). */
const S = (date: string, id: string, entries: readonly SetEntry[], time?: string): HistorySet[] =>
  setsWithReps(date, id, entries, time === undefined ? {} : { time });
const x = (
  w: number | null,
  r: number | null,
  n = 1,
): Array<readonly [number | null, number | null]> =>
  Array.from({ length: n }, () => [w, r] as const);
const secs = (...d: Array<number | null>): SetEntry[] => d.map((durationS) => ({ durationS }));

const r = (
  weightKg: number | null,
  reps: number | null,
  kind: PrefillResult["kind"],
  durationS: number | null = null,
): PrefillResult => ({ weightKg, reps, durationS, kind });

// ---- The worked examples R14-E1 … R14-E8 (R14-E9 lives in rule-14-suggest.test.ts) ----

describe("rule 14 waterfall: the worked examples", () => {
  it("R14-E1 rule-14 (AC1) 100 × 8, 8, 8 on 09-24 in the main slot → 102.5 × 6 increase", () => {
    const h = S("2026-09-24", "back-squat", x(100, 8, 3));
    expect(pf("back-squat", MAIN, h)).toEqual(r(102.5, 6, "increase"));
  });

  it("R14-E2 rule-14 (AC2) 100 × 8, 7, 6 on 09-24 → 100 × 7 add_rep", () => {
    const h = S("2026-09-24", "back-squat", [...x(100, 8), ...x(100, 7), ...x(100, 6)]);
    expect(pf("back-squat", MAIN, h)).toEqual(r(100, 7, "add_rep"));
  });

  it("R14-E3 rule-14 (AC3) 100 × 8, 8, 8 on 09-15 (gap 12) → 100 × 6 hold_after_break", () => {
    const h = S("2026-09-15", "back-squat", x(100, 8, 3));
    expect(pf("back-squat", MAIN, h)).toEqual(r(100, 6, "hold_after_break"));
  });

  it("R14-E4 rule-14 (AC4) 102.5 × 8, 8, 8 on 09-01 (gap 26) → floorInc(92.25) = 90 × 6 reentry", () => {
    const h = S("2026-09-01", "back-squat", x(102.5, 8, 3));
    expect(pf("back-squat", MAIN, h)).toEqual(r(90, 6, "reentry"));
  });

  const e5a = S("2026-09-20", "back-squat", [...x(100, 5, 2), ...x(100, 4)]);
  const e5b = S("2026-09-24", "back-squat", [...x(100, 5), ...x(100, 4, 2)]);

  it("R14-E5 rule-14 (AC5) two sessions at W 100 with minReps < 6 → 90 × 6 deload", () => {
    expect(pf("back-squat", MAIN, [...e5a, ...e5b])).toEqual(r(90, 6, "deload"));
    expect(pf("back-squat", MAIN, [...e5b, ...e5a])).toEqual(r(90, 6, "deload"));
  });

  it("R14-E5 rule-14 (AC5) the 09-24 session alone → 100 × 6 hold (step 5 needs two sessions)", () => {
    expect(pf("back-squat", MAIN, e5b)).toEqual(r(100, 6, "hold"));
  });

  it("R14-E5 rule-14 (AC5) the older session at W 95 → hold, not deload (same W in both, D-0057 §5)", () => {
    const at95 = S("2026-09-20", "back-squat", [...x(95, 5, 2), ...x(95, 4)]);
    expect(pf("back-squat", MAIN, [...at95, ...e5b])).toEqual(r(100, 6, "hold"));
    // The older session's W must equal the newer one's, not merely contain a set at it.
    const mixed = S("2026-09-20", "back-squat", [...x(100, 5), ...x(105, 5)]);
    expect(pf("back-squat", MAIN, [...mixed, ...e5b])).toEqual(r(100, 6, "hold"));
  });

  it("R14-E5 rule-14 (AC5) a third, older good session does not stop the deload (last two only)", () => {
    const older = S("2026-09-16", "back-squat", x(100, 5, 3));
    expect(pf("back-squat", MAIN, [...older, ...e5a, ...e5b])).toEqual(r(90, 6, "deload"));
    // … and a bad third-oldest session doesn't create one either (09-20 is fine).
    const good = S("2026-09-20", "back-squat", x(100, 6, 3));
    const oldBad = S("2026-09-16", "back-squat", x(100, 4, 3));
    expect(pf("back-squat", MAIN, [...oldBad, ...good, ...e5b])).toEqual(r(100, 6, "hold"));
  });

  it("R14-E5 rule-14 (AC5) the older session also needs minReps < low: at exactly low it is hold", () => {
    const atLow = S("2026-09-20", "back-squat", [...x(100, 6, 2), ...x(100, 8)]);
    expect(pf("back-squat", MAIN, [...atLow, ...e5b])).toEqual(r(100, 6, "hold"));
  });

  it("R14-E6 rule-14 (AC6) no history: leg-curl null × 10, push-up (accessory) 0 × 8, first_time", () => {
    expect(pf("leg-curl", ISOLATION, [])).toEqual(r(null, 10, "first_time"));
    expect(pf("push-up", COMPOUND, [])).toEqual(r(0, 8, "first_time"));
  });

  it("R14-E7 rule-14 (AC7) lat-pulldown 50 → seated-cable-row with no history: 50 × 8 carry", () => {
    const prev = { exerciseId: "lat-pulldown", weightKg: 50 };
    expect(pf("seated-cable-row", COMPOUND, [], prev)).toEqual(r(50, 8, "carry"));
  });

  it("R14-E7 rule-14 (AC7) barbell-row 60 → db-row: first_time (no shared equipment item)", () => {
    const prev = { exerciseId: "barbell-row", weightKg: 60 };
    expect(pf("db-row", COMPOUND, [], prev)).toEqual(r(null, 8, "first_time"));
  });

  it("R14-E7 rule-14 (AC7) bench-press 80 → barbell-row: first_time (barbell shared, no weight-1.0 area)", () => {
    const prev = { exerciseId: "bench-press", weightKg: 80 };
    expect(pf("barbell-row", COMPOUND, [], prev)).toEqual(r(null, 8, "first_time"));
  });

  it("R14-E7 rule-14 (AC7) a null previous weight has nothing to carry: first_time", () => {
    const prev = { exerciseId: "lat-pulldown", weightKg: null };
    expect(pf("seated-cable-row", COMPOUND, [], prev)).toEqual(r(null, 8, "first_time"));
  });

  it("R14-E7 rule-14 (AC7) a previous exercise missing from the library: first_time", () => {
    const prev = { exerciseId: "no-such-exercise", weightKg: 50 };
    expect(pf("seated-cable-row", COMPOUND, [], prev)).toEqual(r(null, 8, "first_time"));
    const noLat = LIBRARY.filter((e) => e.id !== "lat-pulldown");
    const real = { exerciseId: "lat-pulldown", weightKg: 50 };
    expect(pf("seated-cable-row", COMPOUND, [], real, { library: noLat })).toEqual(
      r(null, 8, "first_time"),
    );
  });

  it("R14-E7 rule-14 (AC7) history wins over a qualifying previous: 40 × 12 ×3 → 45 × 8 increase", () => {
    const prev = { exerciseId: "lat-pulldown", weightKg: 50 };
    const h = S("2026-09-24", "seated-cable-row", x(40, 12, 3));
    expect(pf("seated-cable-row", COMPOUND, h, prev)).toEqual(r(45, 8, "increase"));
  });

  it("R14-E7 rule-14 (AC7) carry keeps the previous weight exactly, at low reps of this slot", () => {
    const prev = { exerciseId: "lat-pulldown", weightKg: 47.5 };
    expect(pf("seated-cable-row", MAIN, [], prev)).toEqual(r(47.5, 6, "carry"));
    expect(pf("straight-arm-pulldown", ISOLATION, [], prev)).toEqual(r(47.5, 10, "carry"));
  });

  it("R14-E8 rule-14 (AC8) plank 45, 45, 40 s on 09-24 → 45 s add_rep (min 40 + 5)", () => {
    const h = S("2026-09-24", "plank", secs(45, 45, 40));
    expect(pf("plank", TIMED, h)).toEqual(r(null, null, "add_rep", 45));
    // min, not max or last: the 40 is first here.
    const h2 = S("2026-09-24", "plank", secs(40, 45, 50));
    expect(pf("plank", TIMED, h2)).toEqual(r(null, null, "add_rep", 45));
  });

  it("R14-E8 rule-14 (AC8) plank with no history → defaultDurationS 45 first_time", () => {
    expect(pf("plank", TIMED, [])).toEqual(r(null, null, "first_time", 45));
  });

  it("R14-E8 rule-14 (AC8) plank on 09-15 (gap 12) → 40 s hold_after_break", () => {
    const h = S("2026-09-15", "plank", secs(45, 45, 40));
    expect(pf("plank", TIMED, h)).toEqual(r(null, null, "hold_after_break", 40));
  });

  it("R14-E8 rule-14 (AC8) plank on 09-01 (gap 26) → max(15, floor5(36)) = 35 s reentry", () => {
    const h = S("2026-09-01", "plank", secs(45, 45, 40));
    expect(pf("plank", TIMED, h)).toEqual(r(null, null, "reentry", 35));
  });

  it("R14-E8 rule-14 (AC8) the 120 s cap and the 15 s floor", () => {
    expect(pf("plank", TIMED, S("2026-09-24", "plank", secs(118, 120)))).toEqual(
      r(null, null, "add_rep", 120),
    );
    expect(pf("plank", TIMED, S("2026-09-01", "plank", secs(10, 12)))).toEqual(
      r(null, null, "reentry", 15),
    );
    // Exactly at the cap nothing increases, so the kind is hold (D-0057 §6).
    expect(pf("plank", TIMED, S("2026-09-24", "plank", secs(120, 120)))).toEqual(
      r(null, null, "hold", 120),
    );
    expect(pf("plank", TIMED, S("2026-09-24", "plank", secs(115, 120)))).toEqual(
      r(null, null, "add_rep", 120),
    );
    // floor5 at 21+ days: 0.9 × 50 = 45 exactly, 0.9 × 49 = 44.1 → 40.
    expect(pf("plank", TIMED, S("2026-09-01", "plank", secs(50))).durationS).toBe(45);
    expect(pf("plank", TIMED, S("2026-09-01", "plank", secs(49))).durationS).toBe(40);
  });

  it("R14-E8 rule-14 (AC8) every durationS null → the timed first-time branch (D-0057 §6)", () => {
    const h = S("2026-09-24", "plank", secs(null, null));
    expect(pf("plank", TIMED, h)).toEqual(r(null, null, "first_time", 45));
    // A null set is ignored, not read as 0.
    expect(pf("plank", TIMED, S("2026-09-24", "plank", secs(null, 40)))).toEqual(
      r(null, null, "add_rep", 45),
    );
  });

  it("R14-E8 rule-14 (AC8) timed gap boundaries: 9 → +5, 10 → hold, 20 → hold, 21 → reentry", () => {
    const at = (date: string): PrefillResult => pf("plank", TIMED, S(date, "plank", secs(40)));
    expect(at("2026-09-18")).toEqual(r(null, null, "add_rep", 45));
    expect(at("2026-09-17")).toEqual(r(null, null, "hold_after_break", 40));
    expect(at("2026-09-07")).toEqual(r(null, null, "hold_after_break", 40));
    expect(at("2026-09-06")).toEqual(r(null, null, "reentry", 35));
  });

  it("R14-E8 rule-14 (AC8) the timed branch reads only the most recent plank session", () => {
    const h = [...S("2026-09-20", "plank", secs(20)), ...S("2026-09-24", "plank", secs(60))];
    expect(pf("plank", TIMED, h)).toEqual(r(null, null, "add_rep", 65));
  });
});

// ---- Build defaults (D-0057 §2–§5, §9) ----

describe("rule 14 bodyweight progression (D-0057 §2)", () => {
  for (const w of [0, null] as const) {
    const label = w === null ? "weightKg null" : "weightKg 0";
    it(`rule-14 (AC10) push-up 12, 12, 12 (${label}) → 0 × 12 increase: reps go to high, not low`, () => {
      expect(pf("push-up", COMPOUND, S("2026-09-24", "push-up", x(w, 12, 3)))).toEqual(
        r(0, 12, "increase"),
      );
    });

    it(`rule-14 (AC10) push-up 12, 11, 10 (${label}) → 0 × 11 add_rep`, () => {
      const h = S("2026-09-24", "push-up", [...x(w, 12), ...x(w, 11), ...x(w, 10)]);
      expect(pf("push-up", COMPOUND, h)).toEqual(r(0, 11, "add_rep"));
    });

    it(`rule-14 (AC10) push-up after a break (${label}): gap 12 hold_after_break, gap 26 reentry, both 0 × 8`, () => {
      expect(pf("push-up", COMPOUND, S("2026-09-15", "push-up", x(w, 12, 3)))).toEqual(
        r(0, 8, "hold_after_break"),
      );
      expect(pf("push-up", COMPOUND, S("2026-09-01", "push-up", x(w, 12, 3)))).toEqual(
        r(0, 8, "reentry"),
      );
    });

    it(`rule-14 (AC10) push-up deload (${label}): two sessions under low → 0 × 8 deload; one → hold`, () => {
      const a = S("2026-09-20", "push-up", [...x(w, 5, 2), ...x(w, 4)]);
      const b = S("2026-09-24", "push-up", [...x(w, 5), ...x(w, 4, 2)]);
      expect(pf("push-up", COMPOUND, [...a, ...b])).toEqual(r(0, 8, "deload"));
      expect(pf("push-up", COMPOUND, b)).toEqual(r(0, 8, "hold"));
    });
  }

  it("rule-14 (AC10) a bodyweight set logged with a stray weight still pre-fills 0 and reads every set", () => {
    // W is 0 for externalLoad false: a 5 kg vest set doesn't narrow "all at W" to itself.
    const h = S("2026-09-24", "push-up", [...x(5, 12), ...x(0, 9)]);
    expect(pf("push-up", COMPOUND, h)).toEqual(r(0, 10, "add_rep"));
  });

  it("rule-14 (AC10) mixed 0 and null weights on push-up count as one bodyweight session", () => {
    const h = S("2026-09-24", "push-up", [...x(0, 12), ...x(null, 12)]);
    expect(pf("push-up", COMPOUND, h)).toEqual(r(0, 12, "increase"));
    const h2 = S("2026-09-24", "push-up", [...x(0, 12), ...x(null, 9)]);
    expect(pf("push-up", COMPOUND, h2)).toEqual(r(0, 10, "add_rep"));
  });

  it("rule-14 (AC10) bodyweight reps null only → first_time 0 at low", () => {
    expect(pf("push-up", COMPOUND, S("2026-09-24", "push-up", x(0, null, 2)))).toEqual(
      r(0, 8, "first_time"),
    );
  });
});

describe("rule 14 missing weights on a loaded exercise (D-0057 §3)", () => {
  it("rule-14 (AC11) every weightKg null on back-squat → first_time null × 6", () => {
    const h = S("2026-09-24", "back-squat", x(null, 8, 3));
    expect(pf("back-squat", MAIN, h)).toEqual(r(null, 6, "first_time"));
  });

  it("rule-14 (AC11) … with a qualifying previous hip-thrust 60 → 60 × 6 carry", () => {
    const h = S("2026-09-24", "back-squat", x(null, 8, 3));
    const prev = { exerciseId: "hip-thrust", weightKg: 60 };
    expect(pf("back-squat", MAIN, h, prev)).toEqual(r(60, 6, "carry"));
  });

  it("rule-14 (AC11) one set without a weight: W is 100 → 102.5 × 6 increase", () => {
    const h = S("2026-09-24", "back-squat", [...x(null, 8), ...x(100, 8, 2)]);
    expect(pf("back-squat", MAIN, h)).toEqual(r(102.5, 6, "increase"));
    // The null-weight set's reps don't count either: 100 × 8, 8 plus null × 4 is still increase.
    const h2 = S("2026-09-24", "back-squat", [...x(null, 4), ...x(100, 8, 2)]);
    expect(pf("back-squat", MAIN, h2)).toEqual(r(102.5, 6, "increase"));
  });

  it("rule-14 (AC11) non-timed sets with no reps → first_time (no usable set at W)", () => {
    const h = S("2026-09-24", "back-squat", x(100, null, 2));
    expect(pf("back-squat", MAIN, h)).toEqual(r(null, 6, "first_time"));
  });

  it("rule-14 (AC11) a reps-null set is ignored for minReps and all-at-W", () => {
    const h = S("2026-09-24", "back-squat", [...x(100, null), ...x(100, 8, 2)]);
    expect(pf("back-squat", MAIN, h)).toEqual(r(102.5, 6, "increase"));
    const h2 = S("2026-09-24", "back-squat", [...x(100, null), ...x(100, 7, 2)]);
    expect(pf("back-squat", MAIN, h2)).toEqual(r(100, 8, "add_rep"));
  });

  it("rule-14 (AC11) an unusable most-recent session does not fall back to an older one (D-0060 §2)", () => {
    const older = S("2026-09-20", "back-squat", x(100, 8, 3));
    const newest = S("2026-09-24", "back-squat", x(null, 8, 3));
    expect(pf("back-squat", MAIN, [...older, ...newest])).toEqual(r(null, 6, "first_time"));
  });

  it("rule-14 (AC11) an older session with no weights never matches step 5", () => {
    const a = S("2026-09-20", "back-squat", x(null, 4, 3));
    const b = S("2026-09-24", "back-squat", x(100, 4, 3));
    expect(pf("back-squat", MAIN, [...a, ...b])).toEqual(r(100, 6, "hold"));
  });

  it("rule-14 (AC11) minReps and all-at-W use only the sets at W, not the lighter ones", () => {
    const h = S("2026-09-24", "back-squat", [...x(80, 3), ...x(100, 8, 2)]);
    expect(pf("back-squat", MAIN, h)).toEqual(r(102.5, 6, "increase"));
    const h2 = S("2026-09-24", "back-squat", [...x(80, 12), ...x(100, 7)]);
    expect(pf("back-squat", MAIN, h2)).toEqual(r(100, 8, "add_rep"));
  });
});

describe("rule 14 floorInc floor (D-0057 §4)", () => {
  it("rule-14 (AC12) biceps-curl 2 × 10 on 09-01 → reentry 2 × 10, never 0", () => {
    const h = S("2026-09-01", "biceps-curl", x(2, 10, 3));
    expect(pf("biceps-curl", ISOLATION, h)).toEqual(r(2, 10, "reentry"));
  });

  it("rule-14 (AC12) back-squat 2.5 × 8 on 09-01 → 2.5 × 6 reentry", () => {
    expect(pf("back-squat", MAIN, S("2026-09-01", "back-squat", x(2.5, 8)))).toEqual(
      r(2.5, 6, "reentry"),
    );
  });

  it("rule-14 (AC12) back-squat 50 × 8 on 09-01 → 45 × 6 reentry (a normal weight is undisturbed)", () => {
    expect(pf("back-squat", MAIN, S("2026-09-01", "back-squat", x(50, 8)))).toEqual(
      r(45, 6, "reentry"),
    );
    // floorInc floors, never rounds: 0.9 × 55 = 49.5 → 47.5, not 50.
    expect(pf("back-squat", MAIN, S("2026-09-01", "back-squat", x(55, 8)))).toEqual(
      r(47.5, 6, "reentry"),
    );
  });

  it("rule-14 (AC12) the same floor applies to deload: biceps-curl 2 × 5 twice → 2 × 10 deload", () => {
    const a = S("2026-09-20", "biceps-curl", x(2, 5, 2));
    const b = S("2026-09-24", "biceps-curl", [...x(2, 5), ...x(2, 4)]);
    expect(pf("biceps-curl", ISOLATION, [...a, ...b])).toEqual(r(2, 10, "deload"));
  });

  it("rule-14 (AC12) a loaded lift logged at 0 kg: W = 0, so reentry and deload stay 0 and increase adds inc", () => {
    // D-0057 §4: max(inc, floorInc(0.9 × W)) applies "when W > 0"; "when W = 0 the result is 0".
    expect(pf("back-squat", MAIN, S("2026-09-01", "back-squat", x(0, 8, 2)))).toEqual(
      r(0, 6, "reentry"),
    );
    const a = S("2026-09-20", "back-squat", x(0, 4, 2));
    const b = S("2026-09-24", "back-squat", x(0, 4, 2));
    expect(pf("back-squat", MAIN, [...a, ...b])).toEqual(r(0, 6, "deload"));
    expect(pf("back-squat", MAIN, S("2026-09-24", "back-squat", x(0, 8, 2)))).toEqual(
      r(2.5, 6, "increase"),
    );
    expect(pf("back-squat", MAIN, S("2026-09-15", "back-squat", x(0, 8, 2)))).toEqual(
      r(0, 6, "hold_after_break"),
    );
    // 0 is a recorded weight, not a missing one: 0 × 8 beside null × 8 still reads W = 0.
    expect(
      pf("back-squat", MAIN, S("2026-09-24", "back-squat", [...x(0, 8), ...x(null, 3)])),
    ).toEqual(r(2.5, 6, "increase"));
  });

  it("rule-14 (AC12) the drop uses the exercise's own increment (5 kg leg-curl, 2 kg db-row)", () => {
    // 0.9 × 47 = 42.3 → floorInc(42.3, 5) = 40, floorInc(42.3, 2) = 42.
    expect(pf("leg-curl", ISOLATION, S("2026-09-01", "leg-curl", x(47, 10))).weightKg).toBe(40);
    expect(pf("db-row", COMPOUND, S("2026-09-01", "db-row", x(47, 10))).weightKg).toBe(42);
    // increase adds the exercise's own increment: 20 + 2 on db-row, 20 + 5 on leg-curl.
    expect(pf("db-row", COMPOUND, S("2026-09-24", "db-row", x(20, 12))).weightKg).toBe(22);
    expect(pf("leg-curl", ISOLATION, S("2026-09-24", "leg-curl", x(20, 15))).weightKg).toBe(25);
  });

  it("rule-14 (AC12) a loaded exercise with incrementKg null uses the 2.5 kg default", () => {
    const loose: LibraryExercise = { ...ex("back-squat"), id: "loose-squat", incrementKg: null };
    const lib = [...LIBRARY, loose];
    const up = setsWithReps("2026-09-24", "loose-squat", x(100, 8, 2));
    expect(prefill(loose, MAIN, up, lib, NOW, TZ, null)).toEqual(r(102.5, 6, "increase"));
    const back = setsWithReps("2026-09-01", "loose-squat", x(100, 8, 2));
    expect(prefill(loose, MAIN, back, lib, NOW, TZ, null)).toEqual(r(90, 6, "reentry"));
  });

  it("rule-14 (AC12) weights are rounded to 3 decimals (no float noise)", () => {
    const h = S("2026-09-24", "db-row", x(20.1, 12));
    expect(pf("db-row", COMPOUND, h).weightKg).toBe(22.1);
    const h2 = S("2026-09-24", "back-squat", x(0.1, 8));
    expect(pf("back-squat", MAIN, h2).weightKg).toBe(2.6);
  });
});

describe("rule 14 session recency and gap (D-0057 §5, §9)", () => {
  it("rule-14 (AC13) the 09-26 session is the last performance → 92.5 × 6 increase", () => {
    const h = [
      ...S("2026-09-24", "back-squat", x(100, 8, 3)),
      ...S("2026-09-26", "back-squat", x(90, 8, 2)),
    ];
    expect(pf("back-squat", MAIN, h)).toEqual(r(92.5, 6, "increase"));
    expect(pf("back-squat", MAIN, [...h].reverse())).toEqual(r(92.5, 6, "increase"));
  });

  it("rule-14 (AC13) two sessions with the same completedAt: the smaller sessionId wins", () => {
    const a = setsWithReps("2026-09-26", "back-squat", x(90, 8, 2), { sessionId: "s-a", tag: "a" });
    const b = setsWithReps("2026-09-26", "back-squat", x(80, 8, 2), { sessionId: "s-b", tag: "b" });
    expect(pf("back-squat", MAIN, [...a, ...b])).toEqual(r(92.5, 6, "increase"));
    expect(pf("back-squat", MAIN, [...b, ...a])).toEqual(r(92.5, 6, "increase"));
    const b2 = b.map((s) => ({ ...s, sessionId: "s-0" }));
    expect(pf("back-squat", MAIN, [...a, ...b2])).toEqual(r(82.5, 6, "increase"));
  });

  it("rule-14 (AC13) sessions are ordered by their greatest completedAt, not their first set", () => {
    // Session A starts earlier but its last set is later than all of session B.
    const a = [
      ...setsWithReps("2026-09-24", "back-squat", x(90, 8), {
        sessionId: "s-z",
        tag: "a1",
        time: "08:00",
      }),
      ...setsWithReps("2026-09-24", "back-squat", x(90, 8), {
        sessionId: "s-z",
        tag: "a2",
        time: "12:00",
      }),
    ];
    const b = setsWithReps("2026-09-24", "back-squat", x(80, 8, 2), {
      sessionId: "s-a",
      time: "10:00",
    });
    expect(pf("back-squat", MAIN, [...a, ...b])).toEqual(r(92.5, 6, "increase"));
  });

  it("rule-14 (AC13) a session earlier today and later today both give gap 0 → increase", () => {
    expect(pf("back-squat", MAIN, S("2026-09-27", "back-squat", x(100, 8, 3)))).toEqual(
      r(102.5, 6, "increase"),
    );
    expect(pf("back-squat", MAIN, S("2026-09-27", "back-squat", x(100, 8, 3), "23:30"))).toEqual(
      r(102.5, 6, "increase"),
    );
  });

  it("rule-14 (AC13) a future session is still the last performance, at gap 0", () => {
    const h = S("2026-09-28", "back-squat", x(100, 8, 3));
    expect(pf("back-squat", MAIN, h)).toEqual(r(102.5, 6, "increase"));
    // Far in the future is gap 0 too, never a negative-gap anomaly or a reentry.
    expect(pf("back-squat", MAIN, S("2026-12-31", "back-squat", x(100, 8, 3)))).toEqual(
      r(102.5, 6, "increase"),
    );
    // And it beats an older session.
    const both = [...S("2026-09-24", "back-squat", x(60, 8, 3)), ...h];
    expect(pf("back-squat", MAIN, both)).toEqual(r(102.5, 6, "increase"));
  });

  const acrossMidnight = (day1: string, day2: string): HistorySet[] => [
    ...setsWithReps(day1, "back-squat", x(100, 8), {
      at: `${day1}T23:45:00+02:00`,
      sessionId: "late",
      tag: "p",
    }),
    ...setsWithReps(day2, "back-squat", x(100, 8), {
      at: `${day2}T00:10:00+02:00`,
      sessionId: "late",
      tag: "q",
    }),
  ];

  it("rule-14 (AC13) a session crossing midnight 09-16 → 09-17 is dated by its later set: gap 10", () => {
    expect(pf("back-squat", MAIN, acrossMidnight("2026-09-16", "2026-09-17"))).toEqual(
      r(100, 6, "hold_after_break"),
    );
  });

  it("rule-14 (AC13) crossing midnight on the boundaries: 09-17 → 09-18 is gap 9, 09-06 → 09-07 is gap 20", () => {
    expect(pf("back-squat", MAIN, acrossMidnight("2026-09-17", "2026-09-18"))).toEqual(
      r(102.5, 6, "increase"),
    );
    expect(pf("back-squat", MAIN, acrossMidnight("2026-09-06", "2026-09-07"))).toEqual(
      r(100, 6, "hold_after_break"),
    );
  });

  it("rule-14 (AC13) a DST change between the session and now: 10-24 → 11-06 is gap 13", () => {
    const now = "2026-11-06T12:00:00+01:00";
    const h = S("2026-10-24", "back-squat", x(100, 8, 3));
    expect(pf("back-squat", MAIN, h, null, { now })).toEqual(r(100, 6, "hold_after_break"));
  });

  it("rule-14 (AC13) gap counts local calendar days: 10-16 23:30 → 11-06 12:00 is 21 across DST", () => {
    const now = "2026-11-06T12:00:00+01:00";
    // Elapsed time is 20 days 13.5 hours; the calendar gap is 21.
    const late = S("2026-10-16", "back-squat", x(100, 8, 3), "23:30");
    expect(pf("back-squat", MAIN, late, null, { now })).toEqual(r(90, 6, "reentry"));
    const h20 = S("2026-10-17", "back-squat", x(100, 8, 3));
    expect(pf("back-squat", MAIN, h20, null, { now })).toEqual(r(100, 6, "hold_after_break"));
  });

  it("rule-14 (AC13) gap uses the local date in tz, not the UTC date", () => {
    // 2026-09-06T22:30Z is 00:30 on 09-07 in Stockholm: gap 20, not 21.
    const h = setsWithReps("2026-09-07", "back-squat", x(100, 8, 2), {
      at: "2026-09-06T22:30:00Z",
    });
    expect(pf("back-squat", MAIN, h)).toEqual(r(100, 6, "hold_after_break"));
    // now = 2026-09-26T22:30Z is D = 09-27 locally: 09-17 is gap 10.
    const h2 = S("2026-09-17", "back-squat", x(100, 8, 2));
    expect(pf("back-squat", MAIN, h2, null, { now: "2026-09-26T22:30:00Z" })).toEqual(
      r(100, 6, "hold_after_break"),
    );
  });

  it("rule-14 (AC13) non-timed gap boundaries: 9 → progression, 10 and 20 → hold_after_break, 21 → reentry", () => {
    const at = (d: string): PrefillResult =>
      pf("back-squat", MAIN, S(d, "back-squat", x(100, 8, 3)));
    expect(at("2026-09-18")).toEqual(r(102.5, 6, "increase"));
    expect(at("2026-09-17")).toEqual(r(100, 6, "hold_after_break"));
    expect(at("2026-09-07")).toEqual(r(100, 6, "hold_after_break"));
    expect(at("2026-09-06")).toEqual(r(90, 6, "reentry"));
  });

  it("rule-14 (AC13) reentry and hold_after_break beat deload and hold (steps 2–3 before 5–6)", () => {
    const a = S("2026-09-01", "back-squat", x(100, 4, 2));
    const b = S("2026-09-02", "back-squat", x(100, 4, 2));
    expect(pf("back-squat", MAIN, [...a, ...b])).toEqual(r(90, 6, "reentry"));
    const c = S("2026-09-14", "back-squat", x(100, 4, 2));
    const d = S("2026-09-15", "back-squat", x(100, 4, 2));
    expect(pf("back-squat", MAIN, [...c, ...d])).toEqual(r(100, 6, "hold_after_break"));
  });

  it("rule-14 (AC13) other exercises' sessions never define this exercise's last performance", () => {
    const h = [
      ...S("2026-09-24", "back-squat", x(100, 8, 3)),
      ...S("2026-09-26", "romanian-deadlift", x(60, 4, 3)),
    ];
    expect(pf("back-squat", MAIN, h)).toEqual(r(102.5, 6, "increase"));
    // Nor does a mixed session's other exercise leak into W.
    const mixed = [
      ...setsWithReps("2026-09-24", "back-squat", x(100, 8, 2), { sessionId: "m" }),
      ...setsWithReps("2026-09-24", "romanian-deadlift", x(140, 3), { sessionId: "m" }),
    ];
    expect(pf("back-squat", MAIN, mixed)).toEqual(r(102.5, 6, "increase"));
  });

  it("rule-14 (AC13) the second session for step 5 is the second most recent, not any older one", () => {
    const old = S("2026-09-16", "back-squat", x(100, 4, 2));
    const mid = S("2026-09-20", "back-squat", x(100, 7, 2));
    const last = S("2026-09-24", "back-squat", x(100, 4, 2));
    expect(pf("back-squat", MAIN, [...old, ...mid, ...last])).toEqual(r(100, 6, "hold"));
  });
});

describe("rule 14 tombstones and the offline queue (rule 0, D-0034)", () => {
  const live = S("2026-09-24", "back-squat", [...x(100, 8, 2), ...x(100, 6)]);
  const later = "2026-09-26T08:00:00+02:00";
  const tomb = (s: HistorySet): HistorySet => ({
    ...s,
    pending: true,
    editedAt: later,
    deletedAt: later,
  });

  it("rule-14 (AC14) every row tombstoned by a newer queued row → first_time", () => {
    expect(pf("back-squat", MAIN, [...live, ...live.map(tomb)])).toEqual(r(null, 6, "first_time"));
  });

  it("rule-14 (AC14) one of three tombstoned: the other two define W 100 → increase", () => {
    // Without the tombstone the 6-rep set makes it add_rep.
    expect(pf("back-squat", MAIN, live)).toEqual(r(100, 7, "add_rep"));
    const h = [...live, tomb(live[2] as HistorySet)];
    expect(pf("back-squat", MAIN, h)).toEqual(r(102.5, 6, "increase"));
  });

  it("rule-14 (AC14) a tombstoned newer session never defines last performance", () => {
    const newer = S("2026-09-26", "back-squat", x(60, 4, 3));
    const kill = "2026-09-27T08:00:00+02:00";
    const killed = newer.map((s) => ({ ...s, pending: true, editedAt: kill, deletedAt: kill }));
    const h = [...S("2026-09-24", "back-squat", x(100, 8, 3)), ...newer, ...killed];
    expect(pf("back-squat", MAIN, h)).toEqual(r(102.5, 6, "increase"));
    // Without the tombstones the 09-26 session is the last performance.
    expect(pf("back-squat", MAIN, h.slice(0, 6))).toEqual(r(60, 6, "hold"));
    // A server row already carrying deletedAt is dropped too.
    const dead = newer.map((s) => ({ ...s, deletedAt: later }));
    expect(
      pf("back-squat", MAIN, [...S("2026-09-24", "back-squat", x(100, 8, 3)), ...dead]),
    ).toEqual(r(102.5, 6, "increase"));
  });

  it("rule-14 (AC14) an identical queued replay of each live row changes nothing", () => {
    const replay = live.map((s) => ({ ...s, pending: true }));
    expect(pf("back-squat", MAIN, [...live, ...replay])).toEqual(pf("back-squat", MAIN, live));
    expect(pf("back-squat", MAIN, [...replay, ...live])).toEqual(pf("back-squat", MAIN, live));
  });

  it("rule-14 (AC14) a queued edit to 110 × 8 with a newer editedAt makes W 110", () => {
    const base = S("2026-09-24", "back-squat", x(100, 8, 3));
    const edit = { ...(base[0] as HistorySet), pending: true, weightKg: 110, editedAt: later };
    expect(pf("back-squat", MAIN, [...base, edit])).toEqual(r(112.5, 6, "increase"));
    // An older queued edit loses to the server row.
    const stale = { ...edit, editedAt: "2026-09-23T08:00:00+02:00" };
    expect(pf("back-squat", MAIN, [...base, stale])).toEqual(r(102.5, 6, "increase"));
    // A queued edit that lowers reps at W flips increase to add_rep.
    const fewer = { ...(base[1] as HistorySet), pending: true, reps: 6, editedAt: later };
    expect(pf("back-squat", MAIN, [...base, fewer])).toEqual(r(100, 7, "add_rep"));
  });

  it("rule-14 (AC14) sets of an exerciseId missing from the library never define a pre-fill", () => {
    const noSquat = LIBRARY.filter((e) => e.id !== "back-squat");
    const h = S("2026-09-24", "back-squat", x(100, 8, 3));
    expect(pf("back-squat", MAIN, h, null, { library: noSquat })).toEqual(r(null, 6, "first_time"));
    const ghost: LibraryExercise = { ...ex("back-squat"), id: "ghost-lift" };
    const g = setsWithReps("2026-09-24", "ghost-lift", x(100, 8, 3));
    expect(prefill(ghost, MAIN, g, LIBRARY, NOW, TZ, null)).toEqual(r(null, 6, "first_time"));
  });

  it("rule-14 (AC14) warm-up sets never define a pre-fill (rule 2)", () => {
    const wu = setsWithReps("2026-09-26", "back-squat", x(40, 10, 2), { isWarmup: true });
    expect(pf("back-squat", MAIN, wu)).toEqual(r(null, 6, "first_time"));
    const h = [...S("2026-09-24", "back-squat", x(100, 8, 3)), ...wu];
    expect(pf("back-squat", MAIN, h)).toEqual(r(102.5, 6, "increase"));
    // A warm-up set at a heavier weight in the same session doesn't become W either.
    const same = [
      ...S("2026-09-24", "back-squat", x(100, 8, 3)),
      ...setsWithReps("2026-09-24", "back-squat", x(120, 2), { isWarmup: true, tag: "w" }),
    ];
    expect(pf("back-squat", MAIN, same)).toEqual(r(102.5, 6, "increase"));
  });
});

describe("rule 14 rep-range floor and ceiling", () => {
  const ranges: Array<[string, PrefillSlot]> = [
    ["6–8", MAIN],
    ["8–12", COMPOUND],
    ["10–15", ISOLATION],
  ];
  for (const [name, slot] of ranges) {
    const low = slot.repsMin as number;
    const high = slot.repsMax as number;
    const load = (reps: number[]): HistorySet[] =>
      S(
        "2026-09-24",
        "back-squat",
        reps.map((n) => [100, n] as const),
      );
    const bw = (reps: number[]): HistorySet[] =>
      S(
        "2026-09-24",
        "push-up",
        reps.map((n) => [0, n] as const),
      );

    it(`rule-14 (AC15) ${name}: every set at high + 3 → increase at low (loaded) or high (bodyweight)`, () => {
      expect(pf("back-squat", slot, load([high + 3, high + 3]))).toEqual(r(102.5, low, "increase"));
      expect(pf("push-up", slot, bw([high + 3, high + 3]))).toEqual(r(0, high, "increase"));
    });

    it(`rule-14 (AC15) ${name}: add_rep from minReps = high − 1 gives exactly high`, () => {
      expect(pf("back-squat", slot, load([high, high - 1]))).toEqual(r(100, high, "add_rep"));
      expect(pf("push-up", slot, bw([high, high - 1]))).toEqual(r(0, high, "add_rep"));
    });

    it(`rule-14 (AC15) ${name}: minReps = high is step 4, not step 7`, () => {
      expect(pf("back-squat", slot, load([high, high]))).toEqual(r(102.5, low, "increase"));
      expect(pf("push-up", slot, bw([high, high + 1]))).toEqual(r(0, high, "increase"));
    });

    it(`rule-14 (AC15) ${name}: minReps = low → low + 1; minReps = low − 1 → hold at low`, () => {
      expect(pf("back-squat", slot, load([low, high]))).toEqual(r(100, low + 1, "add_rep"));
      expect(pf("back-squat", slot, load([low - 1, high]))).toEqual(r(100, low, "hold"));
      expect(pf("push-up", slot, bw([low - 1, high]))).toEqual(r(0, low, "hold"));
    });

    it(`rule-14 (AC15) ${name}: reps stay within low…high for every minReps 1…high + 3`, () => {
      for (let m = 1; m <= high + 3; m++) {
        for (const id of ["back-squat", "push-up"]) {
          const h = id === "push-up" ? bw([m, high + 3]) : load([m, high + 3]);
          const out = pf(id, slot, h);
          expect(out.reps, `${id} minReps ${m}`).toBeGreaterThanOrEqual(low);
          expect(out.reps, `${id} minReps ${m}`).toBeLessThanOrEqual(high);
          const expected = m >= high ? "increase" : m < low ? "hold" : "add_rep";
          expect(out.kind, `${id} minReps ${m}`).toBe(expected);
          if (expected === "add_rep") expect(out.reps).toBe(Math.min(high, m + 1));
        }
      }
    });
  }
});

describe("rule 14 carry scope (D-0057 §1, D-0060 §1)", () => {
  it("rule-14 (AC7) carry needs both a shared weight-1.0 area and a shared equipment item", () => {
    // straight-arm-pulldown (cable, back 1) ← lat-pulldown (cable, back 1): carry.
    expect(
      pf("straight-arm-pulldown", ISOLATION, [], { exerciseId: "lat-pulldown", weightKg: 30 }),
    ).toEqual(r(30, 10, "carry"));
    // leg-extension (machine, quads) ← leg-curl (machine, hamstrings): equipment only.
    expect(pf("leg-extension", ISOLATION, [], { exerciseId: "leg-curl", weightKg: 40 })).toEqual(
      r(null, 10, "first_time"),
    );
    // back-squat (barbell, rack; quads, glutes) ← hip-thrust (barbell, bench; glutes): both.
    expect(pf("back-squat", MAIN, [], { exerciseId: "hip-thrust", weightKg: 60 })).toEqual(
      r(60, 6, "carry"),
    );
    // A shared secondary area (arms .5) is not enough: biceps-curl (arms 1) ← db-row (arms .5).
    expect(pf("biceps-curl", ISOLATION, [], { exerciseId: "db-row", weightKg: 20 })).toEqual(
      r(null, 10, "first_time"),
    );
  });

  it("rule-14 (AC7) a bodyweight exercise never carries a weight: it stays 0, first_time", () => {
    // inverted-row (rack; back 1) ← back-squat shares rack but not back; pull-up alone.
    expect(pf("inverted-row", COMPOUND, [], { exerciseId: "barbell-row", weightKg: 60 })).toEqual(
      r(0, 8, "first_time"),
    );
    // Even when a loaded previous shares area (back) and equipment (rack), it stays 0.
    const rackPull: LibraryExercise = {
      ...ex("barbell-row"),
      id: "rack-pull",
      equipment: ["rack"],
    };
    const lib = [...LIBRARY, rackPull];
    const prev = { exerciseId: "rack-pull", weightKg: 60 };
    expect(prefill(ex("inverted-row"), COMPOUND, [], lib, NOW, TZ, prev)).toEqual(
      r(0, 8, "first_time"),
    );
  });

  it("rule-14 (AC7) a 0 kg previous weight (a bodyweight previous) is not carried to a loaded lift", () => {
    const cableBw: LibraryExercise = {
      ...ex("inverted-row"),
      id: "cable-bw-row",
      equipment: ["cable"],
    };
    const lib = [...LIBRARY, cableBw];
    expect(
      prefill(ex("seated-cable-row"), COMPOUND, [], lib, NOW, TZ, {
        exerciseId: "cable-bw-row",
        weightKg: 0,
      }),
    ).toEqual(r(null, 8, "first_time"));
  });

  it("rule-14 (AC7) a timed exercise never carries", () => {
    expect(pf("plank", TIMED, [], { exerciseId: "dead-bug", weightKg: 10 })).toEqual(
      r(null, null, "first_time", 45),
    );
  });

  it("rule-14 (AC7) a warm-up move is not a previous exercise", () => {
    const wuCable: LibraryExercise = { ...ex("lat-pulldown"), id: "wu-cable", kind: "warmup" };
    const lib = [...LIBRARY, wuCable];
    expect(
      prefill(ex("seated-cable-row"), COMPOUND, [], lib, NOW, TZ, {
        exerciseId: "wu-cable",
        weightKg: 50,
      }),
    ).toEqual(r(null, 8, "first_time"));
  });

  it("rule-14 (AC7) carry applies after an unusable history (no weights), not after a real one", () => {
    const prev = { exerciseId: "lat-pulldown", weightKg: 50 };
    const noW = S("2026-09-24", "seated-cable-row", x(null, 10, 2));
    expect(pf("seated-cable-row", COMPOUND, noW, prev)).toEqual(r(50, 8, "carry"));
    const tombed = S("2026-09-24", "seated-cable-row", x(40, 10, 2)).map((s) => ({
      ...s,
      deletedAt: s.completedAt,
    }));
    expect(pf("seated-cable-row", COMPOUND, tombed, prev)).toEqual(r(50, 8, "carry"));
    const old = S("2026-08-01", "seated-cable-row", x(40, 10, 2));
    expect(pf("seated-cable-row", COMPOUND, old, prev)).toEqual(r(35, 8, "reentry"));
  });
});

describe("rule 14 validation", () => {
  const bad =
    (slot: PrefillSlot, id = "back-squat"): (() => PrefillResult) =>
    () =>
      pf(id, slot, []);

  it("rule-14 (AC20) throws RangeError when repsMin > repsMax", () => {
    expect(bad({ repsMin: 9, repsMax: 8 })).toThrow(RangeError);
    expect(bad({ repsMin: 8, repsMax: 8 })).not.toThrow();
  });

  it("rule-14 (AC20) throws RangeError when exactly one of repsMin / repsMax is null", () => {
    expect(bad({ repsMin: 6, repsMax: null })).toThrow(RangeError);
    expect(bad({ repsMin: null, repsMax: 8 })).toThrow(RangeError);
    expect(bad({ repsMin: null, repsMax: 8 }, "plank")).toThrow(RangeError);
  });

  it("rule-14 (AC20) throws RangeError when repsMin is 0, negative or not an integer", () => {
    expect(bad({ repsMin: 0, repsMax: 8 })).toThrow(RangeError);
    expect(bad({ repsMin: -1, repsMax: 8 })).toThrow(RangeError);
    expect(bad({ repsMin: 6.5, repsMax: 8 })).toThrow(RangeError);
    expect(bad({ repsMin: 6, repsMax: 8.5 })).toThrow(RangeError);
    expect(bad({ repsMin: Number.NaN, repsMax: 8 })).toThrow(RangeError);
    expect(bad({ repsMin: 1, repsMax: 1 })).not.toThrow();
  });

  it("rule-14 (AC20) throws RangeError when now has no offset", () => {
    expect(() => pf("back-squat", MAIN, [], null, { now: "2026-09-27T12:00:00" })).toThrow(
      RangeError,
    );
  });

  it("rule-14 (AC20) throws RangeError when previous.weightKg is negative", () => {
    const prev = { exerciseId: "lat-pulldown", weightKg: -1 };
    expect(() => pf("seated-cable-row", COMPOUND, [], prev)).toThrow(RangeError);
    const nan = { exerciseId: "lat-pulldown", weightKg: Number.NaN };
    expect(() => pf("seated-cable-row", COMPOUND, [], nan)).toThrow(RangeError);
    // 0 is valid (it just isn't carried).
    expect(() => pf("seated-cable-row", COMPOUND, [], { ...prev, weightKg: 0 })).not.toThrow();
  });

  it("rule-14 (AC20) a non-timed exercise with a null range and a timed one with a range both throw", () => {
    expect(bad(TIMED, "back-squat")).toThrow(RangeError);
    expect(bad(MAIN, "plank")).toThrow(RangeError);
    expect(bad(TIMED, "plank")).not.toThrow();
  });

  it("rule-14 (AC20) validation runs even when history would make the slot irrelevant", () => {
    const h = S("2026-09-24", "back-squat", x(100, 8, 3));
    expect(() => pf("back-squat", { repsMin: 9, repsMax: 8 }, h)).toThrow(RangeError);
    const prev = { exerciseId: "lat-pulldown", weightKg: -5 };
    expect(() => pf("back-squat", MAIN, h, prev)).toThrow(RangeError);
  });
});
