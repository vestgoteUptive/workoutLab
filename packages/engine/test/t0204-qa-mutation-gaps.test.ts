// T-0204 QA (UF-08.2, UF-08.3, UF-05.1): tests that close the gaps found by mutation testing
// rules 12 and 13. Each expectation was derived by hand from docs/engine-rules.md and D-0056.
// The derivation is in the comment above each assertion.
import { describe, expect, it } from "vitest";
import {
  rankSwaps,
  suggest,
  type HistorySet,
  type LibraryExercise,
  type SessionInput,
  type SwapReason,
  type Workout,
  type WorkoutItem,
} from "@workoutlab/engine";
import {
  F_PROFILE,
  F_TARGETS,
  LIBRARY,
  NOW,
  TZ,
  fSwap,
  input,
  itemsOf,
  sessionOf,
  setsOn,
} from "./fixtures/common.js";

const LIB = new Map(LIBRARY.map((e) => [e.id, e]));
const exOf = (id: string): LibraryExercise => {
  const e = LIB.get(id);
  if (e === undefined) throw new Error(`no ${id}`);
  return e;
};

function rank(
  current: string,
  reason: SwapReason | null,
  opts: { session?: Workout; library?: readonly LibraryExercise[]; history?: HistorySet[] } = {},
): string[] {
  return rankSwaps(
    current,
    reason,
    opts.session ?? fSwap(),
    F_PROFILE,
    opts.library ?? LIBRARY,
    opts.history ?? [],
    NOW,
    TZ,
  ).map((c) => c.exerciseId);
}

function run(si: SessionInput, library: readonly LibraryExercise[] = LIBRARY): Workout {
  return suggest([], F_TARGETS, F_PROFILE, library, si, NOW, TZ);
}

const hasSwap = (i: WorkoutItem): boolean => i.reasons.some((r) => r.code === "swap");
const swapFlags = (w: Workout): boolean[] => w.plan.items.map(hasSwap);

/** A timed compound back row: 3 × (70 + 120) + 60 = 630 s, exactly 75 s over a 555 s slot. */
const ZZ_TIMED_ROW: LibraryExercise = {
  ...exOf("lat-pulldown"),
  id: "zz-timed-row",
  name: "Zz timed row",
  areas: { back: 1 },
  timed: true,
  defaultDurationS: 70,
};

describe("T-0204 QA rule 12 gaps", () => {
  it("rule-12 (AC2, AC12) a plan item that would otherwise be a candidate is excluded", () => {
    // db-row shares back 1.0 with barbell-row and is eligible, but it is already in the plan.
    const session = sessionOf([
      ["bench-press", 4, true],
      ["barbell-row", 3],
      ["db-row", 3],
    ]);
    expect(rank("barbell-row", null, { session })).toEqual([
      "inverted-row",
      "lat-pulldown",
      "seated-cable-row",
      "straight-arm-pulldown",
    ]);
  });

  it("rule-12 (AC3) short_on_time breaks a timeCostS tie by muscleMatch desc before id", () => {
    // zz-iso-row: isolation, back 1 + arms .5, so 375 s and muscleMatch 1, against
    // straight-arm-pulldown at 375 s and 0.667. muscleMatch desc wins over id asc.
    const zz: LibraryExercise = {
      ...exOf("straight-arm-pulldown"),
      id: "zz-iso-row",
      areas: { back: 1, arms: 0.5 },
    };
    expect(rank("barbell-row", "short_on_time", { library: [...LIBRARY, zz] })).toEqual([
      "zz-iso-row",
      "straight-arm-pulldown",
      "db-row",
      "inverted-row",
      "lat-pulldown",
      "seated-cable-row",
    ]);
  });

  it("rule-12 (AC9) fitsBudget is true at an exact fit and false one second over (D-0056 §3)", () => {
    // 1545 − 555 + 630 = 1620 = availableS, so it fits. At 71 s it is 633 s and 1623 > 1620.
    const over: LibraryExercise = { ...ZZ_TIMED_ROW, id: "zz-timed-row-71", defaultDurationS: 71 };
    const list = rankSwaps(
      "barbell-row",
      "short_on_time",
      fSwap(),
      F_PROFILE,
      [...LIBRARY, ZZ_TIMED_ROW, over],
      [],
      NOW,
      TZ,
    );
    const byId = new Map(list.map((c) => [c.exerciseId, c]));
    expect([byId.get("zz-timed-row")?.timeCostS, byId.get("zz-timed-row")?.fitsBudget]).toEqual([
      630,
      true,
    ]);
    expect([
      byId.get("zz-timed-row-71")?.timeCostS,
      byId.get("zz-timed-row-71")?.fitsBudget,
    ]).toEqual([633, false]);
  });

  it("rule-12 (AC4) variety: sets tombstoned through a newer edit of the same clientId are never done", () => {
    // Server rows plus a replacement tombstone for each clientId (rule 0 normalisation).
    const server = setsOn(3, "lat-pulldown", "2026-09-20");
    const tombstones = server.map((r) => ({
      ...r,
      editedAt: "2026-09-21T10:00:00+02:00",
      deletedAt: "2026-09-21T10:00:00+02:00",
    }));
    expect(rank("barbell-row", "variety", { history: [...server, ...tombstones] })).toEqual([
      "db-row",
      "inverted-row",
      "lat-pulldown",
      "seated-cable-row",
      "straight-arm-pulldown",
    ]);
  });

  it("rule-12 (AC4) variety: warm-up sets alone leave the exercise never done", () => {
    const history = setsOn(3, "lat-pulldown", "2026-09-20", { isWarmup: true });
    expect(rank("barbell-row", "variety", { history })).toEqual(rank("barbell-row", "variety"));
  });

  it("rule-12 (AC8) reason null: an exercise done only in an older session is not demoted", () => {
    // The last session (09-25) holds biceps-curl only, so lat-pulldown (09-20) keeps its place.
    const history = [
      ...setsOn(3, "lat-pulldown", "2026-09-20"),
      ...setsOn(3, "biceps-curl", "2026-09-25"),
    ];
    expect(rank("barbell-row", null, { history })).toEqual(rank("barbell-row", null));
  });
});

describe("T-0204 QA rule 13 gaps", () => {
  it("rule-13 (AC19) n = 5: a cheaper pick frees time that a later slot may use", () => {
    // Back list [inverted-row, barbell-row, db-row, lat-pulldown, seated-cable-row,
    // straight-arm-pulldown]: 5 mod 6 → straight-arm-pulldown × 3 = 375 s, so free time is
    // 75 + 555 − 375 = 255 s. Quads list [leg-extension, back-squat]: 5 mod 2 → back-squat
    // × 2 = 390 s, +120 s ≤ 255 s, so it now fits. 720 + 375 + 390 = 1485.
    const w = run(input({ shuffle: 5 }));
    expect(itemsOf(w)).toEqual([
      ["bench-press", 4],
      ["straight-arm-pulldown", 3],
      ["back-squat", 2],
    ]);
    expect([w.itemsTotalS, w.unusedS]).toEqual([1485, 135]);
    expect(swapFlags(w)).toEqual([false, true, true]);
  });

  it("rule-13 (AC14) a pick that fits exactly (0 s left) is taken", () => {
    // zz-timed-row is back 1 (muscleMatch 0.5 vs inverted-row), never done, so it sorts after
    // straight-arm-pulldown by id: list length 7, entry 6. 1545 − 555 + 630 = 1620 = available.
    const w = run(input({ shuffle: 6 }), [...LIBRARY, ZZ_TIMED_ROW]);
    expect(itemsOf(w)).toEqual([
      ["bench-press", 4],
      ["zz-timed-row", 3],
      ["leg-extension", 2],
    ]);
    expect([w.itemsTotalS, w.unusedS]).toEqual([1620, 0]);
  });

  it("rule-13 (AC17) a pinned slot that has alternatives is still never shuffled", () => {
    // Pinned lat-pulldown has 5 back alternatives. The core slot (dead-bug) cycles
    // [dead-bug, hanging-knee-raise, plank] (muscleMatch 1 each, id asc).
    const expected = ["dead-bug", "hanging-knee-raise", "plank"];
    for (let n = 0; n <= 6; n++) {
      const w = run(input({ pinnedIds: ["lat-pulldown"], shuffle: n }));
      expect(itemsOf(w), `n=${n}`).toEqual([
        ["bench-press", 4],
        ["lat-pulldown", 3],
        [expected[n % 3] as string, 2],
      ]);
      expect(swapFlags(w), `n=${n}`).toEqual([false, false, n % 3 !== 0]);
    }
  });

  it("rule-13 (AC19, D-0056 §10) two slots on one area: each list is built against the live plan", () => {
    // A back-only library at 45 min: bench-press × 4, inverted-row × 3, barbell-row × 3.
    const keep = new Set([
      "bench-press",
      "barbell-row",
      "db-row",
      "inverted-row",
      "lat-pulldown",
      "seated-cable-row",
      "straight-arm-pulldown",
    ]);
    const library = LIBRARY.filter((e) => e.kind === "warmup" || keep.has(e.id));
    const at = (n: number) => run(input({ budgetMin: 45, shuffle: n }), library);
    expect(itemsOf(at(0))).toEqual([
      ["bench-press", 4],
      ["inverted-row", 3],
      ["barbell-row", 3],
    ]);
    // n = 1. Slot 1 (inverted-row, Σw 2): [inverted-row, db-row, lat-pulldown,
    // seated-cable-row, straight-arm-pulldown] (barbell-row is in the plan) → db-row. Back is
    // still 2 items, which is allowed. Slot 2 (barbell-row) against the live plan {bench-press,
    // db-row, barbell-row}: inverted-row is free again → [barbell-row, inverted-row,
    // lat-pulldown, seated-cable-row, straight-arm-pulldown] → inverted-row. No db-row repeat.
    expect(itemsOf(at(1))).toEqual([
      ["bench-press", 4],
      ["db-row", 3],
      ["inverted-row", 3],
    ]);
    // n = 4. Slot 1 → straight-arm-pulldown × 3 (375 s). Slot 2 list [barbell-row, db-row,
    // inverted-row, lat-pulldown, seated-cable-row] → seated-cable-row. 720 + 375 + 555.
    const four = at(4);
    expect(itemsOf(four)).toEqual([
      ["bench-press", 4],
      ["straight-arm-pulldown", 3],
      ["seated-cable-row", 3],
    ]);
    expect(four.itemsTotalS).toBe(1650);
    for (let n = 0; n <= 12; n++) {
      const ids = at(n).plan.items.map((i) => i.exerciseId);
      expect(new Set(ids).size, `n=${n}`).toBe(ids.length);
    }
  });

  it("rule-13 (AC19) excludeIds also bound the shuffle list", () => {
    // Without barbell-row the back list is [inverted-row, db-row, lat-pulldown,
    // seated-cable-row, straight-arm-pulldown], so n = 1 → db-row.
    for (let n = 0; n <= 10; n++) {
      const w = run(input({ excludeIds: ["barbell-row"], shuffle: n }));
      expect(
        w.plan.items.map((i) => i.exerciseId),
        `n=${n}`,
      ).not.toContain("barbell-row");
    }
    expect(itemsOf(run(input({ excludeIds: ["barbell-row"], shuffle: 1 })))).toEqual([
      ["bench-press", 4],
      ["db-row", 3],
      ["leg-extension", 2],
    ]);
  });
});
