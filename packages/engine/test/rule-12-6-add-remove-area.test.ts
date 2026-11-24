// T-0995 UF-08.2 UF-08.6: rule 12.6 `addArea` and `removeArea` (D-0275 §4). AC6 to AC8.
import { describe, expect, it } from "vitest";
import {
  addArea,
  removeArea,
  removeItem,
  suggest,
  type AddAreaRefusal,
  type AreaRefused,
  type Workout,
  type WorkoutItem,
} from "@workoutlab/engine";
import { F_PROFILE, F_TARGETS, LIBRARY, NOW, TZ, deepFreeze, input } from "./fixtures/common.js";
import { ctxOf, fixtureW45, R7_E3_HISTORY, sets } from "./fixtures/area-edits.js";
import { mkItem, mkWorkout } from "./fixtures/order-groups.js";

function ok(r: Workout | AreaRefused<AddAreaRefusal>): Workout {
  if ("refused" in r) throw new Error(`refused: ${r.refused}`);
  return r;
}

/** R7-E31's empty plan (both switches off, nothing picked). */
function emptyPlan(): Workout {
  return suggest(
    [],
    F_TARGETS,
    F_PROFILE,
    LIBRARY,
    input({ autoMainLift: false, fill: false }),
    NOW,
    TZ,
  );
}

/** W45 with exactly `leftS` seconds left (available = budgetMin x 60 - 180). */
function withLeft(leftS: number): Workout {
  const w = fixtureW45();
  return { ...w, budgetMin: (w.itemsTotalS + leftS + 180) / 60 };
}

describe("rule-12-6 addArea (AC6)", () => {
  it("rule-12-6 R12-E44 W45 + shoulders: the top shoulders candidate at 3 sets, last in the plan", () => {
    const w = deepFreeze(fixtureW45());
    const r = ok(addArea(w, "shoulders", ctxOf()));
    expect(sets(r)).toEqual([
      ["bench-press", 4],
      ["inverted-row", 3],
      ["leg-extension", 2],
      ["overhead-press", 3],
    ]);
    const added = r.plan.items[3] as WorkoutItem;
    expect(added.isMain).toBe(false);
    expect(added.costS).toBe(555);
    expect(r.plan.mainLiftId).toBe("bench-press");
    expect(r.itemsTotalS).toBe(1545 + 555);
    expect(r.totalS).toBe(r.itemsTotalS + 180);
    expect(r.unusedS).toBe(975 - 555);
    expect(added.reasons.map((x) => x.code)).toEqual(["area_deficit", "days_since", "prefill"]);
    expect(r.plan.items.slice(0, 3)).toStrictEqual(w.plan.items);
  });

  it("rule-12-6 R12-E45 falls back to 2 sets when 3 don't fit, else time", () => {
    // Compound-only shoulders list: overhead-press is 555 s at 3 sets, 390 s at 2.
    const lib = LIBRARY.filter((e) => e.id !== "lateral-raise");
    const ctx = ctxOf({ library: lib });
    const two = ok(addArea(withLeft(390), "shoulders", ctx));
    expect(sets(two)[3]).toEqual(["overhead-press", 2]);
    expect(two.plan.items[3]?.costS).toBe(390);
    expect(addArea(withLeft(345), "shoulders", ctx)).toStrictEqual({ refused: "time" });
    const three = ok(addArea(withLeft(555), "shoulders", ctx));
    expect(sets(three)[3]).toEqual(["overhead-press", 3]);
  });

  it("rule-12-6 R12-E46 at 8 items the refusal is items_cap", () => {
    const ids = [
      "bench-press",
      "barbell-row",
      "overhead-press",
      "biceps-curl",
      "dead-bug",
      "hip-thrust",
      "leg-extension",
      "leg-curl",
    ];
    const items = ids.map((id, k) => mkItem(id, 2, k === 0));
    const w = { ...mkWorkout(items, "bench-press"), budgetMin: 120 };
    expect(addArea(w, "calves", ctxOf())).toStrictEqual({ refused: "items_cap" });
  });

  it("rule-12-6 R12-E47 a recovering area is area_unavailable", () => {
    const ctx = ctxOf({ history: R7_E3_HISTORY });
    const noQuads = removeArea(fixtureW45(), "quads");
    expect(addArea(noQuads, "quads", ctx)).toStrictEqual({ refused: "area_unavailable" });
    expect(addArea(noQuads, "glutes", ctx)).toStrictEqual({ refused: "area_unavailable" });
  });

  it("rule-12-6 R12-E48 an avoided area is area_unavailable", () => {
    const ctx = ctxOf({ avoidAreas: ["shoulders"] });
    expect(addArea(fixtureW45(), "shoulders", ctx)).toStrictEqual({ refused: "area_unavailable" });
  });

  it("rule-12-6 R12-E49 an area whose every exercise is excluded is area_unavailable", () => {
    const ctx = ctxOf({ excludeIds: ["overhead-press", "lateral-raise"] });
    expect(addArea(fixtureW45(), "shoulders", ctx)).toStrictEqual({ refused: "area_unavailable" });
    // Excluding only one leaves the other.
    const one = ok(addArea(fixtureW45(), "shoulders", ctxOf({ excludeIds: ["overhead-press"] })));
    expect(sets(one)[3]?.[0]).toBe("lateral-raise");
  });

  it("rule-12-6 an area with no eligible exercise (equipment) is area_unavailable", () => {
    const ctx = ctxOf({ profile: { ...F_PROFILE, equipment: [] } });
    expect(addArea(fixtureW45(), "shoulders", ctx)).toStrictEqual({ refused: "area_unavailable" });
  });

  it("rule-12-6 an area already in the plan, or unknown, is a RangeError; so is a bad now", () => {
    expect(() => addArea(fixtureW45(), "chest", ctxOf())).toThrow(RangeError);
    expect(() => addArea(fixtureW45(), "elbows" as never, ctxOf())).toThrow(RangeError);
    expect(() => addArea(fixtureW45(), "arms", ctxOf({ now: "2026-09-27" }))).toThrow(RangeError);
  });

  it("rule-12-6 a favorite ranks first inside the area", () => {
    const r = ok(addArea(fixtureW45(), "shoulders", ctxOf({ favoriteIds: ["lateral-raise"] })));
    expect(sets(r)[3]).toEqual(["lateral-raise", 3]);
  });

  it("rule-12-6 an item's home area is the area added (back-squat is a glutes item, never offered for quads)", () => {
    const noQuads = removeArea(fixtureW45(), "quads");
    // back-squat has weight 1.0 in quads, but its first primary area is glutes.
    expect(addArea(noQuads, "quads", ctxOf({ excludeIds: ["leg-extension"] }))).toStrictEqual({
      refused: "area_unavailable",
    });
    const r = ok(addArea(noQuads, "glutes", ctxOf()));
    expect(r.plan.items.at(-1)?.exerciseId).toBe("back-squat");
  });

  it("rule-12-6 at Low energy an accessory is added at 2 sets with energy_low_trim", () => {
    const w = { ...fixtureW45(), energy: "low" as const };
    const r = ok(addArea(w, "shoulders", ctxOf()));
    const added = r.plan.items[3] as WorkoutItem;
    expect(added.sets).toBe(2);
    expect(added.reasons.map((x) => x.code)).toContain("energy_low_trim");
  });
});

describe("rule-12-6 addArea into an empty plan (AC7)", () => {
  it("rule-12-6 R12-E50 R7-E31's empty plan + chest: a compound main lift, mainLiftId set", () => {
    const e = deepFreeze(emptyPlan());
    expect(e.plan.items).toEqual([]);
    const r = ok(addArea(e, "chest", ctxOf()));
    expect(sets(r)).toEqual([["bench-press", 3]]);
    expect(r.plan.items[0]?.isMain).toBe(true);
    expect(r.plan.mainLiftId).toBe("bench-press");
    expect(r.plan.items[0]?.reasons[0]).toEqual({ code: "main_lift" });
    expect(r.itemsTotalS).toBe(555);
    expect(r.unusedS).toBe(1620 - 555);
  });

  it("rule-12-6 the main lift follows rule 7.2 step 1 order: favorites first, then loaded", () => {
    const e = emptyPlan();
    expect(ok(addArea(e, "chest", ctxOf({ favoriteIds: ["push-up"] }))).plan.mainLiftId).toBe(
      "push-up",
    );
    expect(ok(addArea(e, "chest", ctxOf({ excludeIds: ["bench-press"] }))).plan.mainLiftId).toBe(
      "db-bench-press",
    );
  });

  it("rule-12-6 an area without a compound gives a plain item and no main lift", () => {
    const r = ok(addArea(emptyPlan(), "calves", ctxOf()));
    expect(sets(r)).toEqual([["calf-raise", 3]]);
    expect(r.plan.mainLiftId).toBeNull();
    expect(r.plan.items[0]?.isMain).toBe(false);
  });

  it("rule-12-6 autoMainLift false never makes a main lift", () => {
    const r = ok(addArea(emptyPlan(), "chest", ctxOf({ autoMainLift: false })));
    expect(r.plan.mainLiftId).toBeNull();
    expect(r.plan.items[0]?.isMain).toBe(false);
  });

  it("rule-12-6 a non-empty plan never gets a main lift from addArea", () => {
    const noMain = removeItem(fixtureW45(), "bench-press");
    expect(noMain.plan.mainLiftId).toBeNull();
    const r = ok(addArea(noMain, "chest", ctxOf()));
    expect(r.plan.mainLiftId).toBeNull();
    expect(r.plan.items.every((i) => !i.isMain)).toBe(true);
  });
});

describe("rule-12-6 removeArea (AC8)", () => {
  it("rule-12-6 R12-E51 W: removeArea(back) equals removeItem(inverted-row)", () => {
    const w = deepFreeze(fixtureW45());
    expect(removeArea(w, "back")).toStrictEqual(removeItem(w, "inverted-row"));
  });

  it("rule-12-6 R12-E52 an area with two items removes both", () => {
    const w = mkWorkout(
      [mkItem("bench-press", 4, true), mkItem("barbell-row", 3), mkItem("inverted-row", 2)],
      "bench-press",
    );
    const r = removeArea(w, "back");
    expect(sets(r)).toEqual([["bench-press", 4]]);
    expect(r).toStrictEqual(removeItem(removeItem(w, "barbell-row"), "inverted-row"));
    expect(r.unusedS).toBe(1620 - 720);
  });

  it("rule-12-6 removing the main lift's area leaves mainLiftId null, nobody promoted", () => {
    const r = removeArea(fixtureW45(), "chest");
    expect(r.plan.mainLiftId).toBeNull();
    expect(r.plan.items.every((i) => !i.isMain)).toBe(true);
  });

  it("rule-12-6 an unknown or absent area is a RangeError", () => {
    expect(() => removeArea(fixtureW45(), "arms")).toThrow(RangeError);
    expect(() => removeArea(fixtureW45(), "elbows" as never)).toThrow(RangeError);
  });
});
