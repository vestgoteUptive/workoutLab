// T-0204 UF-08.3 UF-05.1: rule 12 swap ranking (rankSwaps, muscleMatch). AC1–AC12, AC24.
import { describe, expect, it } from "vitest";
import {
  muscleMatch,
  rankSwaps,
  suggest,
  type EngineProfile,
  type HistorySet,
  type LibraryExercise,
  type SwapCandidate,
  type SwapReason,
  type Workout,
} from "@workoutlab/engine";
import {
  F_PROFILE,
  F_TARGETS,
  HOUR,
  L1,
  LIBRARY,
  NOW,
  TZ,
  deepFreeze,
  fSwap,
  input,
  itemsOf,
  profile,
  sessionOf,
  setsAt,
  setsOn,
  shift,
} from "./fixtures/common.js";
import { SIMULATED_HISTORIES, returningAfter10DaysHistory } from "./fixtures/histories.js";

const LIB = new Map(LIBRARY.map((e) => [e.id, e]));
const exOf = (id: string): LibraryExercise => {
  const e = LIB.get(id);
  if (e === undefined) throw new Error(`no ${id}`);
  return e;
};

const REASONS: Array<SwapReason | null> = [
  null,
  "equipment_taken",
  "discomfort",
  "variety",
  "short_on_time",
];

function rank(
  current: string,
  reason: SwapReason | null,
  opts: {
    session?: Workout;
    profile?: Pick<EngineProfile, "level" | "equipment">;
    library?: readonly LibraryExercise[];
    history?: readonly HistorySet[];
  } = {},
): SwapCandidate[] {
  return rankSwaps(
    current,
    reason,
    opts.session ?? fSwap(),
    opts.profile ?? F_PROFILE,
    opts.library ?? LIBRARY,
    opts.history ?? [],
    NOW,
    TZ,
  );
}

const ids = (list: readonly SwapCandidate[]): string[] => list.map((c) => c.exerciseId);

/** AC12: shape, value ranges, exclusions and bestMatch for one ranked list. */
function checkShape(list: readonly SwapCandidate[], session: Workout, current: string): void {
  const planIds = new Set(session.plan.items.map((i) => i.exerciseId));
  list.forEach((c, i) => {
    expect(Object.keys(c).sort()).toEqual(
      ["bestMatch", "equipment", "exerciseId", "fitsBudget", "muscleMatch", "timeCostS"].sort(),
    );
    expect(c.equipment).toEqual([...exOf(c.exerciseId).equipment]);
    expect(Number.isInteger(c.timeCostS)).toBe(true);
    expect(c.timeCostS).toBeGreaterThan(0);
    expect(c.muscleMatch).toBeGreaterThan(0);
    expect(c.muscleMatch).toBeLessThanOrEqual(1);
    expect(c.exerciseId).not.toBe(current);
    expect(planIds.has(c.exerciseId)).toBe(false);
    expect(c.bestMatch).toBe(i === 0);
  });
  expect(new Set(ids(list)).size).toBe(list.length);
}

describe("rule 12 muscleMatch", () => {
  it("rule-12 (AC1) muscleMatch over L1 is Σ min / Σ w_cur rounded to 3 decimals", () => {
    const mm = (a: string, b: string) => muscleMatch(exOf(a), exOf(b));
    expect(mm("barbell-row", "db-row")).toBe(1);
    expect(mm("barbell-row", "straight-arm-pulldown")).toBe(0.667);
    expect(mm("bench-press", "push-up")).toBe(0.75);
    expect(mm("bench-press", "db-bench-press")).toBe(1);
    expect(mm("barbell-row", "barbell-row")).toBe(1);
    expect(mm("back-squat", "leg-extension")).toBe(0.333);
    for (const a of L1) {
      for (const b of L1) {
        const v = muscleMatch(a, b);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
        expect(Math.round(v * 1000) / 1000).toBe(v);
      }
    }
  });
});

describe("rule 12 rankSwaps examples", () => {
  it("rule-12 (AC2) F-swap, built by the fixture helper, has the R13-E1 items and totals", () => {
    const f = fSwap();
    const r13e1 = suggest([], F_TARGETS, F_PROFILE, LIBRARY, input({ shuffle: 1 }), NOW, TZ);
    expect(itemsOf(f)).toEqual([
      ["bench-press", 4],
      ["barbell-row", 3],
      ["leg-extension", 2],
    ]);
    expect(itemsOf(r13e1)).toEqual(itemsOf(f));
    expect(r13e1.plan.items.map((i) => [i.isMain, i.costS])).toEqual(
      f.plan.items.map((i) => [i.isMain, i.costS]),
    );
    expect(f.plan.items.map((i) => i.costS)).toEqual([720, 555, 270]);
    expect([f.itemsTotalS, f.unusedS, f.budgetMin, f.warmupInBudget]).toEqual([1545, 75, 30, true]);
  });

  it("R12-E1 rule-12 (AC2) reason null: muscleMatch 1.0 compounds by id, then straight-arm-pulldown 0.667", () => {
    const list = rank("barbell-row", null);
    expect(ids(list)).toEqual([
      "db-row",
      "inverted-row",
      "lat-pulldown",
      "seated-cable-row",
      "straight-arm-pulldown",
    ]);
    expect(list.map((c) => c.muscleMatch)).toEqual([1, 1, 1, 1, 0.667]);
    expect(list.map((c) => c.bestMatch)).toEqual([true, false, false, false, false]);
    for (const absent of ["pull-up", "barbell-row", "bench-press", "leg-extension"]) {
      expect(ids(list)).not.toContain(absent);
    }
  });

  it("R12-E2 rule-12 (AC3) short_on_time: timeCostS asc at the slot's 3 sets, all fit", () => {
    const list = rank("barbell-row", "short_on_time");
    expect(ids(list)).toEqual([
      "straight-arm-pulldown",
      "db-row",
      "inverted-row",
      "lat-pulldown",
      "seated-cable-row",
    ]);
    expect(list.map((c) => c.timeCostS)).toEqual([375, 555, 555, 555, 555]);
    expect(list.every((c) => c.fitsBudget)).toBe(true);
  });

  it("R12-E3 rule-12 (AC4) variety: never done first, then last-done ascending", () => {
    const history = [
      ...setsOn(3, "lat-pulldown", "2026-09-20"),
      ...setsOn(3, "db-row", "2026-09-10"),
    ];
    const expected = [
      "inverted-row",
      "seated-cable-row",
      "straight-arm-pulldown",
      "db-row",
      "lat-pulldown",
    ];
    expect(ids(rank("barbell-row", "variety", { history }))).toEqual(expected);
  });

  it("R12-E3 rule-12 (AC4) variety looks at the whole passed history, not the 14-day window", () => {
    const history = [
      ...setsOn(3, "lat-pulldown", "2026-09-20"),
      ...setsOn(3, "db-row", "2026-08-10"),
    ];
    expect(ids(rank("barbell-row", "variety", { history }))).toEqual([
      "inverted-row",
      "seated-cable-row",
      "straight-arm-pulldown",
      "db-row",
      "lat-pulldown",
    ]);
  });

  it("R12-E3 rule-12 (AC4) variety: a last-done tie falls through to muscleMatch then id", () => {
    const history = [
      ...setsOn(3, "lat-pulldown", "2026-09-20"),
      ...setsOn(3, "db-row", "2026-09-20", { time: "11:00" }),
    ];
    expect(ids(rank("barbell-row", "variety", { history })).slice(-2)).toEqual([
      "db-row",
      "lat-pulldown",
    ]);
  });

  it("R12-E3 rule-12 (AC4) variety: a tombstoned set leaves the exercise never done", () => {
    const history = setsOn(3, "lat-pulldown", "2026-09-20", {
      deletedAt: "2026-09-21T10:00:00+02:00",
      editedAt: "2026-09-21T10:00:00+02:00",
    });
    expect(ids(rank("barbell-row", "variety", { history }))).toEqual([
      "db-row",
      "inverted-row",
      "lat-pulldown",
      "seated-cable-row",
      "straight-arm-pulldown",
    ]);
  });

  it("R12-E4 rule-12 (AC5) discomfort: no shared equipment, then guided, then muscleMatch, id", () => {
    expect(ids(rank("barbell-row", "discomfort"))).toEqual([
      "lat-pulldown",
      "seated-cable-row",
      "straight-arm-pulldown",
      "db-row",
      "inverted-row",
    ]);
  });

  it("R12-E4 rule-12 (AC5) discomfort from lat-pulldown puts the cable sharers last", () => {
    const session = sessionOf([
      ["bench-press", 4, true],
      ["lat-pulldown", 3],
      ["leg-extension", 2],
    ]);
    expect(ids(rank("lat-pulldown", "discomfort", { session }))).toEqual([
      "barbell-row",
      "db-row",
      "inverted-row",
      "seated-cable-row",
      "straight-arm-pulldown",
    ]);
  });

  it("R12-E5 rule-12 (AC6) equipment_taken at the main slot: [push-up] at 0.75 and 720 s", () => {
    const list = rank("bench-press", "equipment_taken");
    expect(ids(list)).toEqual(["push-up"]);
    expect(list[0]?.muscleMatch).toBe(0.75);
    expect(list[0]?.timeCostS).toBe(720);
    expect(list[0]?.bestMatch).toBe(true);
  });

  it("R12-E5 rule-12 (AC6) reason null at the main slot: compounds only, db-bench-press then push-up", () => {
    const list = rank("bench-press", null);
    expect(ids(list)).toEqual(["db-bench-press", "push-up"]);
    expect(list.map((c) => c.muscleMatch)).toEqual([1, 0.75]);
    // A chest isolation added to the library is still dropped at the main slot.
    const fly: LibraryExercise = { ...exOf("lateral-raise"), id: "cable-fly", areas: { chest: 1 } };
    expect(ids(rank("bench-press", null, { library: [...LIBRARY, fly] }))).toEqual([
      "db-bench-press",
      "push-up",
    ]);
    expect(ids(rank("barbell-row", null, { library: [...LIBRARY, fly] }))).not.toContain(
      "cable-fly",
    );
  });

  it("rule-12 (AC7) equipment_taken keeps every sharer when dropping them would empty the list", () => {
    const session = sessionOf([
      ["bench-press", 4, true],
      ["lat-pulldown", 3],
      ["leg-extension", 2],
    ]);
    const cableOnly = profile({ equipment: ["cable"] });
    const list = rank("lat-pulldown", "equipment_taken", { session, profile: cableOnly });
    expect(ids(list)).toEqual(["seated-cable-row", "straight-arm-pulldown"]);
    expect(list.map((c) => c.muscleMatch)).toEqual([1, 0.667]);
    expect(ids(rank("lat-pulldown", "equipment_taken", { session }))).toEqual([
      "barbell-row",
      "db-row",
      "inverted-row",
    ]);
  });

  it("rule-12 (AC7) the fallback sorts by fewest shared equipment items first", () => {
    // Two extra cable+machine rows share 2 items with a cable+machine current exercise.
    const combo = (id: string, extra: string[]): LibraryExercise => ({
      ...exOf("seated-cable-row"),
      id,
      equipment: ["cable", ...extra],
    });
    const library = [...LIBRARY, combo("aa-combo-row", ["machine"]), combo("zz-combo-row", [])];
    const cur = combo("cur-combo-row", ["machine"]);
    const session = sessionOf(
      [
        ["bench-press", 4, true],
        ["cur-combo-row", 3],
      ],
      {},
      [...library, cur],
    );
    const list = rank("cur-combo-row", "equipment_taken", {
      session,
      library: [...library, cur],
      profile: profile({ equipment: ["cable", "machine"] }),
    });
    expect(ids(list)).toEqual([
      "lat-pulldown",
      "seated-cable-row",
      "zz-combo-row",
      "straight-arm-pulldown",
      "aa-combo-row",
    ]);
  });

  it("rule-12 (AC8) reason null: a candidate in the last session drops behind its muscleMatch peers", () => {
    const withDbRow = setsOn(3, "db-row", "2026-09-25");
    expect(ids(rank("barbell-row", null, { history: withDbRow }))).toEqual([
      "inverted-row",
      "lat-pulldown",
      "seated-cable-row",
      "db-row",
      "straight-arm-pulldown",
    ]);
    const withSap = setsOn(3, "straight-arm-pulldown", "2026-09-25");
    expect(rank("barbell-row", null, { history: withSap })).toEqual(rank("barbell-row", null));
  });

  it("rule-12 (AC8) reason null: same type ranks before the last-session key", () => {
    // An isolation twin of db-row ties on muscleMatch 1.0 but sorts after every compound.
    const twin: LibraryExercise = { ...exOf("db-row"), id: "aa-row-iso", type: "isolation" };
    const list = rank("barbell-row", null, {
      library: [...LIBRARY, twin],
      history: setsOn(3, "db-row", "2026-09-25"),
    });
    expect(ids(list)).toEqual([
      "inverted-row",
      "lat-pulldown",
      "seated-cable-row",
      "db-row",
      "aa-row-iso",
      "straight-arm-pulldown",
    ]);
  });

  it("rule-12 (AC9) fitsBudget: a candidate over budget is still returned and can be bestMatch", () => {
    const list = rank("leg-extension", null);
    expect(list).toEqual([
      {
        exerciseId: "back-squat",
        muscleMatch: 1,
        timeCostS: 390,
        equipment: ["barbell", "rack"],
        fitsBudget: false,
        bestMatch: true,
      },
    ]);
    const off = rank("leg-extension", null, { session: fSwap({ warmupInBudget: false }) });
    expect(off[0]?.fitsBudget).toBe(true);
  });

  it("rule-12 (AC10) a candidate with a recovering area at weight 1.0 is not returned", () => {
    const history = setsAt(6, "back-squat", shift(NOW, -24 * HOUR));
    expect(rank("leg-extension", null, { history })).toEqual([]);
  });

  it("rule-12 (AC10) intermediate makes pull-up eligible; barbell+rack leaves inverted-row", () => {
    expect(ids(rank("barbell-row", null, { profile: profile({ level: "intermediate" }) }))).toEqual(
      [
        "db-row",
        "inverted-row",
        "lat-pulldown",
        "pull-up",
        "seated-cable-row",
        "straight-arm-pulldown",
      ],
    );
    expect(
      ids(rank("barbell-row", null, { profile: profile({ equipment: ["barbell", "rack"] }) })),
    ).toEqual(["inverted-row"]);
  });
});

describe("rule 12 edge cases and validation", () => {
  it("rule-12 (AC11) no eligible candidate gives []", () => {
    const alternatives = new Set([
      "db-row",
      "inverted-row",
      "lat-pulldown",
      "seated-cable-row",
      "straight-arm-pulldown",
      "pull-up",
    ]);
    const library = LIBRARY.filter((e) => !alternatives.has(e.id));
    for (const reason of REASONS) {
      expect(rank("barbell-row", reason, { library })).toEqual([]);
      expect(rank("barbell-row", reason, { profile: profile({ equipment: [] }) })).toEqual([]);
    }
  });

  it("rule-12 (AC11) a library with one exercise per area gives [] for every slot", () => {
    const one = LIBRARY.filter((e) =>
      ["bench-press", "barbell-row", "leg-extension"].includes(e.id),
    );
    for (const cur of ["bench-press", "barbell-row", "leg-extension"]) {
      for (const reason of REASONS) expect(rank(cur, reason, { library: one })).toEqual([]);
    }
  });

  it("rule-12 (AC11) a current id that isn't a plan item throws RangeError", () => {
    expect(() => rank("no-such-id", null)).toThrow(RangeError);
    expect(() => rank("db-row", null)).toThrow(RangeError);
  });

  it("rule-12 (AC11) a reason outside SwapReason throws RangeError", () => {
    expect(() => rank("barbell-row", "nope" as SwapReason)).toThrow(RangeError);
  });

  it("rule-12 (AC12) shape and determinism over F-swap, every reason and the simulated histories", () => {
    const histories: Array<[string, HistorySet[]]> = [
      ["zero", []],
      ...Object.entries(SIMULATED_HISTORIES).map(([k, h]): [string, HistorySet[]] => [k, h]),
    ];
    const session = fSwap();
    for (const [name, history] of histories) {
      for (const item of session.plan.items) {
        for (const reason of REASONS) {
          const label = `${name} ${item.exerciseId} ${String(reason)}`;
          const list = rank(item.exerciseId, reason, { history });
          checkShape(list, session, item.exerciseId);
          expect(rank(item.exerciseId, reason, { history }), label).toEqual(list);
          const frozen = rankSwaps(
            item.exerciseId,
            reason,
            deepFreeze(structuredClone(session)),
            deepFreeze(structuredClone(F_PROFILE)),
            deepFreeze(structuredClone(LIBRARY)),
            deepFreeze(structuredClone(history)),
            NOW,
            TZ,
          );
          expect(frozen, label).toEqual(list);
          expect(rank(item.exerciseId, reason, { history: [...history].reverse() }), label).toEqual(
            list,
          );
          expect(
            rank(item.exerciseId, reason, { history, library: [...LIBRARY].reverse() }),
            label,
          ).toEqual(list);
        }
      }
    }
    // The inputs themselves are untouched.
    expect(fSwap()).toEqual(session);
  });
});

describe("rule 12 over the simulated 14-day histories", () => {
  it("rule-12 (AC24) rankSwaps holds the AC12 invariants for every suggested item and reason", () => {
    for (const [name, history] of Object.entries(SIMULATED_HISTORIES)) {
      const w = suggest(history, F_TARGETS, F_PROFILE, LIBRARY, input(), NOW, TZ);
      const doneIds = new Set(
        history.filter((s) => s.deletedAt === null && !s.isWarmup).map((s) => s.exerciseId),
      );
      for (const item of w.plan.items) {
        for (const reason of REASONS) {
          const list = rank(item.exerciseId, reason, { session: w, history });
          checkShape(list, w, item.exerciseId);
          if (reason === "variety") {
            const firstDone = list.findIndex((c) => doneIds.has(c.exerciseId));
            if (firstDone !== -1) {
              expect(
                list.slice(firstDone).every((c) => doneIds.has(c.exerciseId)),
                `${name} ${item.exerciseId}`,
              ).toBe(true);
            }
          }
        }
      }
    }
  });

  it("rule-12 (AC24) returning after 10 days: variety for inverted-row puts barbell-row (last 2026-09-12) last", () => {
    const w = suggest(returningAfter10DaysHistory, F_TARGETS, F_PROFILE, LIBRARY, input(), NOW, TZ);
    expect(itemsOf(w)).toEqual([
      ["bench-press", 4],
      ["inverted-row", 3],
      ["calf-raise", 2],
    ]);
    // Never done: db-row, lat-pulldown, seated-cable-row (0.75), straight-arm-pulldown (0.5).
    // Done: barbell-row, last on 2026-09-12 (before the window, D-0056 §6).
    const lastBarbellRow = returningAfter10DaysHistory
      .filter((s) => s.exerciseId === "barbell-row")
      .map((s) => s.completedAt.slice(0, 10))
      .sort()
      .at(-1);
    expect(lastBarbellRow).toBe("2026-09-12");
    const list = rank("inverted-row", "variety", {
      session: w,
      history: returningAfter10DaysHistory,
    });
    expect(list.map((c) => [c.exerciseId, c.muscleMatch])).toEqual([
      ["db-row", 0.75],
      ["lat-pulldown", 0.75],
      ["seated-cable-row", 0.75],
      ["straight-arm-pulldown", 0.5],
      ["barbell-row", 0.75],
    ]);
    // The main slot: neither chest compound was ever done, so muscleMatch then id.
    expect(
      ids(rank("bench-press", "variety", { session: w, history: returningAfter10DaysHistory })),
    ).toEqual(["db-bench-press", "push-up"]);
  });
});
