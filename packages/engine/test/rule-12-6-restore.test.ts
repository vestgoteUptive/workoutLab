// T-1022 UF-08.2: rules 12.6 and 12.7 `ctx.restore` (D-0290). AC1 to AC8.
import { describe, expect, it } from "vitest";
import {
  addArea,
  areaCandidates,
  areaGroups,
  availableS,
  homeAreaOf,
  orderItems,
  itemCostS,
  removeArea,
  suggest,
  AREAS,
  type AddAreaRefusal,
  type Area,
  type AreaRefused,
  type Workout,
  type WorkoutItem,
} from "@workoutlab/engine";
import { LIBRARY, NOW, TZ, F_PROFILE, F_TARGETS, deepFreeze, input } from "./fixtures/common.js";
import { ctxOf, fixtureW45, R7_E3_HISTORY, sets } from "./fixtures/area-edits.js";
import { mkItem, mkWorkout } from "./fixtures/order-groups.js";

function ok(r: Workout | AreaRefused<AddAreaRefusal>): Workout {
  if ("refused" in r) throw new Error(`refused: ${r.refused}`);
  return r;
}

const itemsOf = (w: Workout, area: Area): WorkoutItem[] =>
  w.plan.items.filter((i) => homeAreaOf(i) === area);

/** A 45-minute plan with hamstrings (leg-curl x 2): after removing hamstrings 330 s are left. */
function hamPlan(): Workout {
  const items = [
    mkItem("bench-press", 4, true),
    mkItem("inverted-row", 3),
    mkItem("leg-extension", 2),
    mkItem("leg-curl", 2),
    mkItem("biceps-curl", 3),
    mkItem("calf-raise", 2),
  ];
  const w = mkWorkout(items, "bench-press");
  return { ...w, budgetMin: 45, unusedS: availableS(45, w.warmupInBudget) - w.itemsTotalS };
}

/** `w` with `budgetMin` set so exactly `leftS` seconds are left. */
function withLeft(w: Workout, leftS: number): Workout {
  const budgetMin = (w.itemsTotalS + leftS + 180) / 60;
  return { ...w, budgetMin, unusedS: leftS };
}

describe("T-1022 rule-12-6 restore round trip (AC1)", () => {
  it("T-1022 AC1 R12-E66 every area of W round-trips to a deep-equal workout", () => {
    const w = fixtureW45();
    for (const g of areaGroups(w)) {
      const removed = itemsOf(w, g.area);
      const gone = removeArea(w, g.area);
      const back = ok(addArea(gone, g.area, ctxOf({ restore: removed })));
      expect(back).toStrictEqual(w);
    }
  });

  it("T-1022 AC1 R12-E67 an area with two items round-trips (R12-E52's plan)", () => {
    const w0 = mkWorkout(
      [mkItem("bench-press", 4, true), mkItem("barbell-row", 3), mkItem("inverted-row", 2)],
      "bench-press",
    );
    const w = { ...w0, budgetMin: 45, unusedS: availableS(45, true) - w0.itemsTotalS };
    const removed = itemsOf(w, "back");
    expect(removed).toHaveLength(2);
    const back = ok(addArea(removeArea(w, "back"), "back", ctxOf({ restore: removed })));
    expect(back.plan.items.map((i) => i.exerciseId).sort()).toEqual(
      w.plan.items.map((i) => i.exerciseId).sort(),
    );
    expect(back.itemsTotalS).toBe(w.itemsTotalS);
    expect(back.unusedS).toBe(w.unusedS);
    expect(back.plan.mainLiftId).toBe("bench-press");
    // The restored plan is the rule 7.6 order of the original (the fixture's synthetic quads
    // session reason has no item behind it, so it is left out of the comparison).
    const want = orderItems(w, LIBRARY);
    expect({ ...back, sessionReasons: [] }).toStrictEqual({ ...want, sessionReasons: [] });
    expect(back.sessionReasons.map((r) => (r.code === "area_deficit" ? r.area : r.code))).toEqual([
      "chest",
      "back",
    ]);
  });
});

describe("T-1022 rule-12-6 restore beats the top candidate (AC2)", () => {
  it("T-1022 AC2 R12-E68 leg-curl x 2 comes back when the top candidate does not fit", () => {
    const w = hamPlan();
    const removed = itemsOf(w, "hamstrings");
    expect(removed.map((i) => [i.exerciseId, i.sets])).toEqual([["leg-curl", 2]]);
    const gone = removeArea(w, "hamstrings");
    expect(gone.unusedS).toBe(330);
    const back = ok(addArea(gone, "hamstrings", ctxOf({ restore: removed })));
    expect(sets(back)).toContainEqual(["leg-curl", 2]);
    expect(back.plan.items).toHaveLength(6);
    expect(back.itemsTotalS).toBe(w.itemsTotalS);
    expect(back.itemsTotalS).toBeLessThanOrEqual(availableS(45, back.warmupInBudget));
  });

  it("T-1022 AC2 R12-E68 without restore it is time, as before (rule 12.6 unchanged)", () => {
    const gone = removeArea(hamPlan(), "hamstrings");
    expect(addArea(gone, "hamstrings", ctxOf())).toStrictEqual({ refused: "time" });
    expect(addArea(gone, "hamstrings", ctxOf({ restore: [] }))).toStrictEqual({ refused: "time" });
  });
});

describe("T-1022 rule-12-6 restore falls back (AC3)", () => {
  const w = hamPlan();
  const removed = itemsOf(w, "hamstrings");
  const gone = removeArea(w, "hamstrings");

  it("T-1022 AC3 R12-E69 a restore that does not fit behaves as without restore", () => {
    // 260 s left: leg-curl x 2 (270 s) does not fit, nor does the top candidate.
    const tight = withLeft(gone, 260);
    const ctx = ctxOf({ restore: removed });
    expect(addArea(tight, "hamstrings", ctx)).toStrictEqual(addArea(tight, "hamstrings", ctxOf()));
    expect(addArea(tight, "hamstrings", ctx)).toStrictEqual({ refused: "time" });
    // Plenty of time: the restore still wins over the 3-set top candidate.
    const roomy = withLeft(gone, 2000);
    const r = ok(addArea(roomy, "hamstrings", ctx));
    expect(itemsOf(r, "hamstrings").map((i) => [i.exerciseId, i.sets])).toEqual([["leg-curl", 2]]);
    expect(
      itemsOf(ok(addArea(roomy, "hamstrings", ctxOf())), "hamstrings")[0]?.exerciseId,
    ).not.toBe("leg-curl");
  });

  it("T-1022 AC3 R12-E69 a restore that does not fit falls back to the top candidate at 2 sets", () => {
    // Restored leg-curl x 2 + romanian-deadlift x 2 (660 s) does not fit 400 s; the top candidate
    // romanian-deadlift x 3 (555 s) does not either, x 2 (390 s) does. No partial restore.
    const pair = [mkItem("leg-curl", 2), mkItem("romanian-deadlift", 2)];
    const tight = withLeft(gone, 400);
    const r = ok(addArea(tight, "hamstrings", ctxOf({ restore: pair })));
    expect(r).toStrictEqual(ok(addArea(tight, "hamstrings", ctxOf())));
    expect(sets(r).at(-1)).toEqual(["romanian-deadlift", 2]);
    expect(itemsOf(r, "hamstrings")).toHaveLength(1);
  });

  it("T-1022 AC3 R12-E70 an excluded, missing or ineligible exercise falls back", () => {
    const roomy = withLeft(gone, 2000);
    const plain = addArea(roomy, "hamstrings", ctxOf());
    expect(
      addArea(roomy, "hamstrings", ctxOf({ restore: removed, excludeIds: ["leg-curl"] })),
    ).toStrictEqual(addArea(roomy, "hamstrings", ctxOf({ excludeIds: ["leg-curl"] })));
    const noCurl = LIBRARY.filter((e) => e.id !== "leg-curl");
    expect(
      addArea(roomy, "hamstrings", ctxOf({ restore: removed, library: noCurl })),
    ).toStrictEqual(addArea(roomy, "hamstrings", ctxOf({ library: noCurl })));
    const noMachine = ctxOf({
      restore: removed,
      profile: { ...ctxOf().profile, equipment: ["barbell", "bench", "dumbbell"] },
    });
    expect(addArea(roomy, "hamstrings", noMachine)).toStrictEqual(
      addArea(roomy, "hamstrings", ctxOf({ profile: noMachine.profile })),
    );
    expect(plain).not.toStrictEqual(ok(addArea(roomy, "hamstrings", ctxOf({ restore: removed }))));
  });

  it("T-1022 AC3 R12-E71 a recovering or avoided area is refused, never restored", () => {
    const roomy = withLeft(removeArea(fixtureW45(), "quads"), 2000);
    const quads = itemsOf(fixtureW45(), "quads");
    const rec = ctxOf({ restore: quads, history: R7_E3_HISTORY });
    expect(addArea(roomy, "quads", rec)).toStrictEqual({ refused: "area_unavailable" });
    const avoided = ctxOf({ restore: quads, avoidAreas: ["quads"] });
    expect(addArea(roomy, "quads", avoided)).toStrictEqual({ refused: "area_unavailable" });
  });

  it("T-1022 AC3 R12-E72 an exercise a swap took, or a full plan, falls back", () => {
    const roomy = withLeft(gone, 2000);
    // Put leg-curl into the plan under another home area (a swap elsewhere took it).
    const swapped: Workout = {
      ...roomy,
      plan: {
        ...roomy.plan,
        items: roomy.plan.items.map((i) =>
          i.exerciseId === "biceps-curl" ? { ...mkItem("leg-curl", 3), reasons: i.reasons } : i,
        ),
      },
    };
    expect(addArea(swapped, "hamstrings", ctxOf({ restore: removed }))).toStrictEqual(
      addArea(swapped, "hamstrings", ctxOf()),
    );
    // 7 items and 2 to restore: the cap of 8.
    const seven = withLeft(
      mkWorkout(
        [
          mkItem("bench-press", 4, true),
          mkItem("inverted-row", 3),
          mkItem("leg-extension", 2),
          mkItem("biceps-curl", 2),
          mkItem("calf-raise", 2),
          mkItem("overhead-press", 2),
          mkItem("plank", 2),
        ],
        "bench-press",
      ),
      2000,
    );
    expect(seven.plan.items).toHaveLength(7);
    const two = [mkItem("leg-curl", 2), mkItem("romanian-deadlift", 2)];
    expect(addArea(seven, "hamstrings", ctxOf({ restore: two }))).toStrictEqual(
      addArea(seven, "hamstrings", ctxOf()),
    );
  });

  it("T-1022 AC3 R12-E73 no partial restore: one item that fails drops both", () => {
    const roomy = withLeft(
      removeArea(mkWorkout([mkItem("bench-press", 4, true)], "bench-press"), "chest"),
      2000,
    );
    const pair = [mkItem("barbell-row", 3), mkItem("inverted-row", 2)];
    const full = ok(addArea(roomy, "back", ctxOf({ restore: pair })));
    expect(full.plan.items).toHaveLength(2);
    const ctx = ctxOf({ restore: pair, excludeIds: ["inverted-row"] });
    const r = ok(addArea(roomy, "back", ctx));
    expect(r.plan.items).toHaveLength(1);
    expect(r).toStrictEqual(ok(addArea(roomy, "back", ctxOf({ excludeIds: ["inverted-row"] }))));
  });
});

describe("T-1022 rule-12-6 restore and the main lift (AC4)", () => {
  const w = fixtureW45();
  const chest = itemsOf(w, "chest");
  const gone = removeArea(w, "chest");

  it("T-1022 AC4 R12-E74 the main lift comes back main when the plan has none", () => {
    const r = ok(addArea(gone, "chest", ctxOf({ restore: chest })));
    expect(r.plan.mainLiftId).toBe("bench-press");
    expect(r.plan.items[0]?.isMain).toBe(true);
    expect(r).toStrictEqual(w);
  });

  it("T-1022 AC4 R12-E75 with a main lift now it comes back as an accessory at min(sets, 3)", () => {
    const other: Workout = {
      ...gone,
      plan: {
        ...gone.plan,
        mainLiftId: "inverted-row",
        items: gone.plan.items.map((i) =>
          i.exerciseId === "inverted-row" ? { ...i, isMain: true } : i,
        ),
      },
    };
    const r = ok(addArea(other, "chest", ctxOf({ restore: chest })));
    const bench = r.plan.items.find((i) => i.exerciseId === "bench-press") as WorkoutItem;
    expect(bench.isMain).toBe(false);
    expect(bench.sets).toBe(3);
    expect(bench.backoff).toBeNull();
    expect(bench.reasons.map((x) => x.code)).not.toContain("main_lift");
    expect(bench.costS).toBe(
      itemCostS(
        LIBRARY.find((e) => e.id === "bench-press")!,
        3,
      ),
    );
    expect(r.plan.mainLiftId).toBe("inverted-row");
    expect(r.plan.items.filter((i) => i.isMain)).toHaveLength(1);
    expect(bench.repsMin).not.toBe((chest[0] as WorkoutItem).repsMin);
  });

  it("T-1022 AC4 R12-E76 the fit is checked at the demoted cost", () => {
    const other: Workout = {
      ...gone,
      plan: {
        ...gone.plan,
        mainLiftId: "inverted-row",
        items: gone.plan.items.map((i) =>
          i.exerciseId === "inverted-row" ? { ...i, isMain: true } : i,
        ),
      },
    };
    const three = itemCostS(
      LIBRARY.find((e) => e.id === "bench-press")!,
      3,
    );
    const tight = withLeft(other, three);
    const r = ok(addArea(tight, "chest", ctxOf({ restore: chest })));
    expect(r.plan.items.find((i) => i.exerciseId === "bench-press")?.sets).toBe(3);
    expect(r.unusedS).toBe(0);
    // One second less than the 3-set cost: no restore, the top candidate (bench-press x 2) or time.
    const tighter = withLeft(other, three - 1);
    const t = addArea(tighter, "chest", ctxOf({ restore: chest }));
    expect(t).toStrictEqual(addArea(tighter, "chest", ctxOf()));
  });
});

describe("T-1022 rule-12-6 restore ignores other areas (AC5)", () => {
  it("T-1022 AC5 R12-E77 only the area's items come back; empty or absent restore changes nothing", () => {
    const w = hamPlan();
    const ham = itemsOf(w, "hamstrings");
    const chest = itemsOf(w, "chest");
    const gone = removeArea(w, "hamstrings");
    const r = ok(addArea(gone, "hamstrings", ctxOf({ restore: [...chest, ...ham] })));
    expect(r.plan.items).toHaveLength(w.plan.items.length);
    expect(itemsOf(r, "hamstrings")).toStrictEqual(ham);
    expect(r).toStrictEqual(ok(addArea(gone, "hamstrings", ctxOf({ restore: ham }))));
    // Only items of another area: as without restore.
    const roomy = withLeft(gone, 2000);
    expect(addArea(roomy, "hamstrings", ctxOf({ restore: chest }))).toStrictEqual(
      addArea(roomy, "hamstrings", ctxOf()),
    );
    expect(addArea(roomy, "hamstrings", ctxOf({ restore: [] }))).toStrictEqual(
      addArea(roomy, "hamstrings", ctxOf()),
    );
  });
});

describe("T-1022 rule-12-7 areaCandidates reads restore (AC6)", () => {
  it("T-1022 AC6 R12-E78 hamstrings is available with restore, time without", () => {
    const w = hamPlan();
    const ham = itemsOf(w, "hamstrings");
    const gone = removeArea(w, "hamstrings");
    const find = (list: ReturnType<typeof areaCandidates>) =>
      list.find((c) => c.area === "hamstrings");
    expect(find(areaCandidates(gone, ctxOf()))?.available).toStrictEqual({ reason: "time" });
    expect(find(areaCandidates(gone, ctxOf({ restore: ham })))?.available).toBe(true);
    expect(areaCandidates(gone, ctxOf({ restore: ham })).map((c) => c.area)).toStrictEqual(
      areaCandidates(gone, ctxOf()).map((c) => c.area),
    );
  });

  it("T-1022 AC6 available is true iff addArea returns a Workout (every area, several budgets)", () => {
    for (const left of [100, 270, 300, 405, 2000]) {
      const w = hamPlan();
      const removedAll = [
        ...itemsOf(w, "hamstrings"),
        ...itemsOf(w, "calves"),
        ...itemsOf(w, "arms"),
      ];
      const gone = withLeft(
        removeArea(removeArea(removeArea(w, "hamstrings"), "calves"), "arms"),
        left,
      );
      const ctx = ctxOf({ restore: removedAll });
      for (const c of areaCandidates(gone, ctx)) {
        const r = addArea(gone, c.area, ctx);
        expect([c.area, c.available === true]).toEqual([c.area, !("refused" in r)]);
      }
    }
    for (const area of AREAS) expect(typeof area).toBe("string");
  });
});

describe("T-1022 rule-12-6 restore after a time change (AC7)", () => {
  it("T-1022 AC7 R12-E79 a stale restore that does not fit 20 minutes falls back, never over budget", () => {
    const w = hamPlan();
    const stale = w.plan.items; // everything removed at 45 minutes
    const rebuilt = suggest([], F_TARGETS, F_PROFILE, LIBRARY, input({ budgetMin: 20 }), NOW, TZ);
    const room = removeArea(rebuilt, rebuilt.plan.items.map(homeAreaOf)[0] as Area);
    const present = new Set(room.plan.items.map((i) => homeAreaOf(i)));
    for (const area of AREAS.filter((a) => !present.has(a))) {
      const base = addArea(room, area, ctxOf());
      const r = addArea(room, area, ctxOf({ restore: stale }));
      if (!("refused" in r))
        expect(r.itemsTotalS).toBeLessThanOrEqual(availableS(20, r.warmupInBudget));
      // A restore that cannot fit leaves the answer exactly as without one.
      if ("refused" in base && "refused" in r) expect(r).toStrictEqual(base);
    }
    // Directly: leg-curl x 2 (270 s) does not fit 100 s.
    const gone = withLeft(removeArea(w, "hamstrings"), 100);
    expect(addArea(gone, "hamstrings", ctxOf({ restore: itemsOf(w, "hamstrings") }))).toStrictEqual(
      addArea(gone, "hamstrings", ctxOf()),
    );
  });
});

describe("T-1022 rule-12-6 restore is pure (AC8)", () => {
  it("T-1022 AC8 R12-E80 nothing is mutated, restored items are copies, same input twice is equal", () => {
    const w = hamPlan();
    const ham = itemsOf(w, "hamstrings");
    const gone = deepFreeze(removeArea(w, "hamstrings"));
    deepFreeze(ham);
    const ctx = ctxOf({ restore: ham });
    const a = ok(addArea(gone, "hamstrings", ctx));
    const b = ok(addArea(gone, "hamstrings", ctx));
    expect(a).toStrictEqual(b);
    const mine = a.plan.items.find((i) => i.exerciseId === "leg-curl") as WorkoutItem;
    expect(mine).toStrictEqual(ham[0]);
    expect(mine).not.toBe(ham[0]);
    expect(mine.prefill).not.toBe((ham[0] as WorkoutItem).prefill);
    expect(mine.reasons).not.toBe((ham[0] as WorkoutItem).reasons);
    areaCandidates(gone, ctx);
  });

  it("T-1022 AC8 R12-E65 suggest ignores everything here: R7-E4 is unchanged", () => {
    expect(sets(fixtureW45())).toEqual([
      ["bench-press", 4],
      ["inverted-row", 3],
      ["leg-extension", 2],
    ]);
  });
});
