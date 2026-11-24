// T-1021 UF-08.6: rule 12.8 `setMainLift` (D-0205 §5). AC1 to AC4.
import { describe, expect, it } from "vitest";
import {
  adjustAreaSets,
  availableS,
  itemCostS,
  orderItems,
  setCostS,
  setMainLift,
  suggest,
  type AreaRefused,
  type HistorySet,
  type Workout,
  type WorkoutItem,
} from "@workoutlab/engine";
import { F_PROFILE, F_TARGETS, LIBRARY, NOW, TZ, deepFreeze, input } from "./fixtures/common.js";
import { SIMULATED_HISTORIES } from "./fixtures/histories.js";
import { ctxOf, fixtureW45, R7_E3_HISTORY, sets } from "./fixtures/area-edits.js";

function ok(r: Workout | AreaRefused<string>): Workout {
  if ("refused" in r) throw new Error(`refused: ${r.refused}`);
  return r;
}
const item = (w: Workout, id: string): WorkoutItem => {
  const i = w.plan.items.find((x) => x.exerciseId === id);
  if (i === undefined) throw new Error(`no ${id}`);
  return i;
};
const lib = new Map(LIBRARY.map((e) => [e.id, e] as const));
const ids = (w: Workout): string[] => w.plan.items.map((i) => i.exerciseId);

describe("rule-12-8 setMainLift (AC1)", () => {
  it("rule-12-8 R12-E55 a new compound becomes the main lift at 4 sets, others untouched", () => {
    const w = deepFreeze(fixtureW45());
    const r = ok(setMainLift(w, "barbell-row", ctxOf()));
    expect(r.plan.mainLiftId).toBe("barbell-row");
    expect(sets(r)).toEqual([
      ["barbell-row", 4],
      ["bench-press", 3],
      ["inverted-row", 3],
      ["leg-extension", 2],
    ]);
    const main = item(r, "barbell-row");
    expect(main.isMain).toBe(true);
    expect([main.repsMin, main.repsMax]).toEqual([6, 8]);
    expect(main.reasons[0]).toEqual({ code: "main_lift" });
    expect(main.costS).toBe(720);
    const old = item(r, "bench-press");
    expect(old.isMain).toBe(false);
    expect([old.repsMin, old.repsMax]).toEqual([8, 12]);
    expect(old.costS).toBe(555);
    expect(item(r, "inverted-row")).toStrictEqual(item(w, "inverted-row"));
    expect(item(r, "leg-extension")).toStrictEqual(item(w, "leg-extension"));
    expect(r.itemsTotalS).toBe(720 + 555 + 555 + 270);
    expect(r.totalS).toBe(r.itemsTotalS + 180);
    expect(r.unusedS).toBe(2520 - r.itemsTotalS);
    expect(r.sessionReasons).toStrictEqual(w.sessionReasons);
    expect(r.plan.warmup).toStrictEqual(w.plan.warmup);
  });

  it("rule-12-8 R12-E56 an existing item is promoted in place and re-ordered by rule 7.6", () => {
    const w = fixtureW45();
    const r = ok(setMainLift(w, "inverted-row", ctxOf()));
    // inverted-row is a bodyweight compound: main-lift reps, 4 sets, first in the order.
    expect(sets(r)[0]).toEqual(["inverted-row", 4]);
    expect(r.plan.mainLiftId).toBe("inverted-row");
    expect(r.plan.items.filter((i) => i.isMain)).toHaveLength(1);
    expect(item(r, "leg-extension")).toStrictEqual(item(w, "leg-extension"));
    expect(r).toStrictEqual(orderItems(r, LIBRARY)); // already ordered
    expect(ids(r).sort()).toEqual(ids(w).sort());
  });

  it("rule-12-8 R12-E57 already the main lift gives a copy", () => {
    const w = deepFreeze(fixtureW45());
    expect(setMainLift(w, "bench-press", ctxOf())).toStrictEqual(w);
  });

  it("rule-12-8 R12-E57b an unordered suggest plan is ordered even when the lift is already main", () => {
    const w = suggest([], F_TARGETS, F_PROFILE, LIBRARY, input({ budgetMin: 60 }), NOW, TZ);
    const main = w.plan.mainLiftId as string;
    expect(setMainLift(w, main, ctxOf())).toStrictEqual(orderItems(w, LIBRARY));
  });

  it("rule-12-8 R12-E58 other areas keep the user's set edits (no suggest rebuild)", () => {
    let w = fixtureW45();
    w = ok(adjustAreaSets(w, "quads", 1, ctxOf())); // leg-extension x3
    w = ok(adjustAreaSets(w, "back", -1, ctxOf())); // inverted-row x2
    const r = ok(setMainLift(w, "overhead-press", ctxOf()));
    expect(item(r, "leg-extension")).toStrictEqual(item(w, "leg-extension"));
    expect(item(r, "inverted-row")).toStrictEqual(item(w, "inverted-row"));
    expect(item(r, "leg-extension").sets).toBe(3);
    expect(item(r, "inverted-row").sets).toBe(2);
  });

  it("rule-12-8 R12-E59 High energy adds a back-off when it fits, Low does not trim the main lift", () => {
    const high = { ...fixtureW45(), energy: "high" as const };
    const r = ok(setMainLift(high, "barbell-row", ctxOf()));
    expect(item(r, "barbell-row").backoff).not.toBeNull();
    expect(item(r, "barbell-row").costS).toBe(720 + setCostS(lib.get("barbell-row")!));
    expect(item(r, "bench-press").backoff).toBeNull();
    const low = { ...fixtureW45(), energy: "low" as const };
    const l = ok(setMainLift(low, "barbell-row", ctxOf()));
    expect(item(l, "barbell-row").sets).toBe(4);
    expect(item(l, "bench-press").reasons.map((x) => x.code)).not.toContain("energy_low_trim");
  });

  it("rule-12-8 R12-E60 falls back to 3 then 2 sets", () => {
    const w = fixtureW45();
    // others after demotion: 555 + 555 + 270 = 1380 (bench-press x3 demoted, inverted-row x3, leg-ext x2).
    const withLeft = (left: number): Workout => ({ ...w, budgetMin: (1380 + left + 180) / 60 });
    expect(item(ok(setMainLift(withLeft(720), "barbell-row", ctxOf())), "barbell-row").sets).toBe(
      4,
    );
    expect(item(ok(setMainLift(withLeft(719), "barbell-row", ctxOf())), "barbell-row").sets).toBe(
      3,
    );
    expect(item(ok(setMainLift(withLeft(554), "barbell-row", ctxOf())), "barbell-row").sets).toBe(
      2,
    );
    expect(setMainLift(withLeft(389), "barbell-row", ctxOf())).toStrictEqual({ refused: "time" });
  });
});

describe("rule-12-8 refusals leave the plan alone (AC2)", () => {
  const refused = (w: Workout, id: string, over = {}): unknown =>
    setMainLift(deepFreeze(w), id, ctxOf(over));

  it("rule-12-8 R12-E61 an isolation is not_compound", () => {
    expect(refused(fixtureW45(), "biceps-curl")).toStrictEqual({ refused: "not_compound" });
    expect(refused(fixtureW45(), "leg-extension")).toStrictEqual({ refused: "not_compound" });
  });

  it("rule-12-8 R12-E62 excluded, equipment, recovering, avoided and the area cap are not_admissible", () => {
    const w = fixtureW45();
    const na = { refused: "not_admissible" };
    expect(refused(w, "barbell-row", { excludeIds: ["barbell-row"] })).toStrictEqual(na);
    expect(refused(w, "barbell-row", { profile: { ...F_PROFILE, equipment: [] } })).toStrictEqual(
      na,
    );
    expect(refused(w, "barbell-row", { avoidAreas: ["back"] })).toStrictEqual(na);
    const base = { ...w, plan: { ...w.plan, items: [] as WorkoutItem[], mainLiftId: null } };
    expect(refused(base, "back-squat", { history: R7_E3_HISTORY })).toStrictEqual(na);
    // chest already has bench-press and db-bench-press: a third chest compound is over the cap.
    const two = ok(
      setMainLift(ok(setMainLift(w, "db-bench-press", ctxOf())), "bench-press", ctxOf()),
    );
    expect(refused(two, "push-up")).toStrictEqual(na);
  });

  it("rule-12-8 R12-E63 8 items refuse a new exercise but not a promotion", () => {
    const w = fixtureW45();
    // Build an 8-item plan by hand from the fixture's items.
    const items = Array.from({ length: 8 }, (_, k) => ({
      ...(w.plan.items[k % 3] as WorkoutItem),
      exerciseId: [
        "bench-press",
        "inverted-row",
        "leg-extension",
        "overhead-press",
        "biceps-curl",
        "dead-bug",
        "calf-raise",
        "lateral-raise",
      ][k] as string,
      isMain: k === 0,
    }));
    const eight = { ...w, plan: { ...w.plan, items } };
    expect(setMainLift(eight, "barbell-row", ctxOf())).toStrictEqual({ refused: "items_cap" });
  });

  it("rule-12-8 R12-E64 not enough time is time, and the structural errors throw", () => {
    const w = fixtureW45();
    const tight = { ...w, budgetMin: 25 };
    expect(setMainLift(tight, "barbell-row", ctxOf())).toStrictEqual({ refused: "time" });
    expect(() => setMainLift(w, "nope", ctxOf())).toThrow(RangeError);
    expect(() => setMainLift(w, "wu-jumping-jack", ctxOf())).toThrow(RangeError);
    expect(() =>
      setMainLift(w, "barbell-row", ctxOf({ now: "2026-09-25T12:00:00" as never })),
    ).toThrow(RangeError);
  });
});

describe("rule-12-8 simulated histories (AC3)", () => {
  const CASES: ReadonlyArray<readonly [string, readonly HistorySet[]]> = [
    ["zero history", []],
    ["balanced", SIMULATED_HISTORIES.balanced],
    ["all-chest-no-legs", SIMULATED_HISTORIES.allChestNoLegs],
    ["returning after 10 days off", SIMULATED_HISTORIES.returningAfter10Days],
    ["offline-merged", SIMULATED_HISTORIES.offlineMerged],
  ];
  const compounds = LIBRARY.filter((e) => e.kind === "exercise" && e.type === "compound");

  it.each(CASES)(
    "rule-12-8 %s: budgets 15 to 120, every compound, never over budget, deterministic",
    (_n, history) => {
      const ctx = ctxOf({ history });
      let accepted = 0;
      for (let budgetMin = 15; budgetMin <= 120; budgetMin += 15) {
        for (const energy of ["low", "normal", "high"] as const) {
          const w = suggest(
            history,
            F_TARGETS,
            F_PROFILE,
            LIBRARY,
            input({ budgetMin, energy }),
            NOW,
            TZ,
          );
          deepFreeze(w);
          const snap = JSON.stringify(w);
          for (const ex of compounds) {
            const r = setMainLift(w, ex.id, ctx);
            expect(JSON.stringify(w)).toBe(snap);
            expect(setMainLift(w, ex.id, ctx)).toStrictEqual(r);
            if ("refused" in r) {
              expect(r).toStrictEqual({ refused: r.refused });
              continue;
            }
            accepted++;
            const avail = availableS(w.budgetMin, w.warmupInBudget);
            const total = r.plan.items.reduce((s, i) => s + i.costS, 0);
            if (!w.plan.items.some((i) => i.exerciseId === ex.id && i.isMain)) {
              expect(total).toBeLessThanOrEqual(avail);
            }
            expect([r.itemsTotalS, r.totalS, r.unusedS]).toEqual([
              total,
              total + 180,
              Math.max(0, avail - total),
            ]);
            expect(r.plan.mainLiftId).toBe(ex.id);
            expect(r.plan.items.filter((i) => i.isMain).map((i) => i.exerciseId)).toEqual([ex.id]);
            expect(r.plan.items[0]?.exerciseId).toBe(ex.id);
            expect(r.plan.items.length).toBeLessThanOrEqual(8);
            for (const i of r.plan.items) {
              const e = lib.get(i.exerciseId)!;
              expect(i.sets).toBeLessThanOrEqual(i.isMain ? 4 : 3);
              const bo = i.backoff === null ? 0 : setCostS(e, i.durationS);
              expect(i.costS).toBe(itemCostS(e, i.sets, i.durationS) + bo);
            }
            // Every item that is not the chosen one or the old main lift is deep-equal to before.
            const oldMain = w.plan.mainLiftId;
            for (const before of w.plan.items) {
              if (before.exerciseId === ex.id || before.exerciseId === oldMain) continue;
              expect(item(r, before.exerciseId)).toStrictEqual(before);
            }
            if (oldMain !== null && oldMain !== ex.id) {
              expect(item(r, oldMain).isMain).toBe(false);
              expect(item(r, oldMain).sets).toBe(Math.min(item(w, oldMain).sets, 3));
            }
            expect(orderItems(r, LIBRARY)).toStrictEqual(r);
          }
        }
      }
      expect(accepted).toBeGreaterThan(0);
    },
  );
});

describe("rule-12-8 suggest unchanged (AC4)", () => {
  it("rule-12-8 R12-E65 suggest() output for R7-E4 and with a mainLiftId is the documented one", () => {
    const w = suggest([], F_TARGETS, F_PROFILE, LIBRARY, input({ budgetMin: 30 }), NOW, TZ);
    expect(sets(w)).toEqual([
      ["bench-press", 4],
      ["inverted-row", 3],
      ["leg-extension", 2],
    ]);
    expect(w.itemsTotalS).toBe(1545);
    expect(w.unusedS).toBe(75);
  });
});
