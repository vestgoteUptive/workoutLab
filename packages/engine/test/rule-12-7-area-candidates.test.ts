// T-0995 UF-08.2: rule 12.7 `areaCandidates` (D-0275 §5). AC9.
import { describe, expect, it } from "vitest";
import {
  addArea,
  areaCandidates,
  suggest,
  type Area,
  type AreaCandidate,
} from "@workoutlab/engine";
import { F_PROFILE, F_TARGETS, LIBRARY, NOW, TZ, deepFreeze, input } from "./fixtures/common.js";
import { ctxOf, fixtureW45, R7_E3_HISTORY } from "./fixtures/area-edits.js";
import { mkItem, mkWorkout } from "./fixtures/order-groups.js";

const order = (c: AreaCandidate[]): Area[] => c.map((x) => x.area);
const byArea = (c: AreaCandidate[], a: Area): AreaCandidate => {
  const f = c.find((x) => x.area === a);
  if (f === undefined) throw new Error(`no candidate ${a}`);
  return f;
};

describe("rule-12-7 areaCandidates (AC9)", () => {
  it("rule-12-7 R12-E53 W45, zero history: the areas not in the plan, rule 7.2 order, all available, load 0", () => {
    const c = areaCandidates(deepFreeze(fixtureW45()), ctxOf());
    // Projected r: glutes, hamstrings, calves 0; shoulders 2/16 and core 1.5/12 (.125, fixed order); arms 3.5/12.
    expect(order(c)).toEqual(["glutes", "hamstrings", "calves", "shoulders", "core", "arms"]);
    expect(c.every((x) => x.available === true)).toBe(true);
    expect(c.every((x) => x.load === 0)).toBe(true);
    expect(byArea(c, "shoulders").target).toBe(16);
    expect(byArea(c, "glutes").target).toBe(20);
    expect(c.find((x) => ["chest", "back", "quads"].includes(x.area))).toBeUndefined();
  });

  it("rule-12-7 R12-E54 R7-E3's history: quads and glutes read recovering, and load is the 14-day load", () => {
    const w = suggest(
      R7_E3_HISTORY,
      F_TARGETS,
      F_PROFILE,
      LIBRARY,
      input({ budgetMin: 45 }),
      NOW,
      TZ,
    );
    const base = mkWorkout([mkItem("bench-press", 4, true)], "bench-press");
    const c = areaCandidates({ ...base, budgetMin: 45 }, ctxOf({ history: R7_E3_HISTORY }));
    expect(byArea(c, "quads").available).toEqual({ reason: "recovering" });
    expect(byArea(c, "glutes").available).toEqual({ reason: "recovering" });
    expect(byArea(c, "quads").load).toBe(6);
    expect(byArea(c, "hamstrings").available).toBe(true);
    expect(byArea(c, "hamstrings").load).toBe(3);
    expect(w.sessionReasons.some((r) => r.code === "recovering_skipped")).toBe(true);
  });

  it("rule-12-7 the reasons: avoided, excluded_out, no_exercise, time, items_cap", () => {
    const w = fixtureW45();
    expect(byArea(areaCandidates(w, ctxOf({ avoidAreas: ["arms"] })), "arms").available).toEqual({
      reason: "avoided",
    });
    expect(
      byArea(areaCandidates(w, ctxOf({ excludeIds: ["calf-raise"] })), "calves").available,
    ).toEqual({ reason: "excluded_out" });
    expect(
      byArea(areaCandidates(w, ctxOf({ profile: { ...F_PROFILE, equipment: [] } })), "calves")
        .available,
    ).toEqual({ reason: "no_exercise" });
    const tight = { ...w, budgetMin: (w.itemsTotalS + 200 + 180) / 60 };
    const t = areaCandidates(tight, ctxOf());
    expect(byArea(t, "calves").available).toEqual({ reason: "time" });
    const items = [
      "bench-press",
      "barbell-row",
      "overhead-press",
      "biceps-curl",
      "dead-bug",
      "hip-thrust",
      "leg-extension",
      "leg-curl",
    ].map((id, k) => mkItem(id, 2, k === 0));
    const full = { ...mkWorkout(items, "bench-press"), budgetMin: 120 };
    expect(areaCandidates(full, ctxOf()).map((x) => x.available)).toEqual([
      { reason: "items_cap" },
    ]);
  });

  it("rule-12-7 an available candidate is exactly one addArea accepts", () => {
    const ctx = ctxOf({ history: R7_E3_HISTORY });
    for (const w of [fixtureW45(), { ...fixtureW45(), budgetMin: 33 }]) {
      for (const c of areaCandidates(w, ctx)) {
        const r = addArea(w, c.area, ctx);
        expect("refused" in r).toBe(c.available !== true);
        if (c.available !== true && "refused" in r) {
          expect(r.refused).toBe(
            c.available.reason === "time" || c.available.reason === "items_cap"
              ? c.available.reason
              : "area_unavailable",
          );
        }
      }
    }
  });

  it("rule-12-7 favoriteIds rank exercises only: the area order is unchanged", () => {
    const w = fixtureW45();
    const a = areaCandidates(w, ctxOf());
    const b = areaCandidates(
      w,
      ctxOf({ favoriteIds: ["lateral-raise", "calf-raise", "back-squat", "biceps-curl"] }),
    );
    expect(b).toStrictEqual(a);
  });

  it("rule-12-7 an empty plan lists all nine areas in the fixed order at zero history", () => {
    const e = suggest(
      [],
      F_TARGETS,
      F_PROFILE,
      LIBRARY,
      input({ autoMainLift: false, fill: false }),
      NOW,
      TZ,
    );
    const c = areaCandidates(e, ctxOf());
    expect(order(c)).toEqual([
      "chest",
      "back",
      "shoulders",
      "arms",
      "core",
      "glutes",
      "quads",
      "hamstrings",
      "calves",
    ]);
    expect(c.every((x) => x.available === true && x.load === 0)).toBe(true);
  });

  it("rule-12-7 a Fill-the-rest loop (addArea of the first available) stops inside the budget", () => {
    let w = fixtureW45();
    const ctx = ctxOf();
    for (let guard = 0; guard < 9; guard++) {
      const next = areaCandidates(w, ctx).find((c) => c.available === true);
      if (next === undefined) break;
      const r = addArea(w, next.area, ctx);
      if ("refused" in r) throw new Error(`candidate ${next.area} was refused: ${r.refused}`);
      w = r;
    }
    expect(w.itemsTotalS).toBeLessThanOrEqual(2520);
    expect(w.plan.items.length).toBeGreaterThan(3);
    expect(areaCandidates(w, ctx).some((c) => c.available === true)).toBe(false);
  });
});
