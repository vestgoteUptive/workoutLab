// Rule 11: balance() output for UF-10.1, UF-10.2 and the C-01 body map on UF-02.1. AC21–AC28.
import { describe, expect, it, vi } from "vitest";
import { AREAS, balance, type LibraryExercise } from "../src/index.js";
import {
  F_TARGETS,
  F_TARGET_VALUES,
  LIBRARY,
  NOW,
  NOW_OCT_01,
  TZ,
  setsOn,
  targetsFrom,
} from "./fixtures/common.js";
import { areaOf, orderOf } from "./helpers.js";

const ac23History = [
  ...setsOn(4, "romanian-deadlift", "2026-09-20"),
  ...setsOn(4, "back-squat", "2026-09-25"),
];

describe("rule-11 balance output", () => {
  it("rule-11 (AC21) result shape and target provenance", () => {
    const targets = targetsFrom(F_TARGET_VALUES, {
      hamstrings: { source: "adapted", updatedAt: "2026-09-20T08:00:00Z" },
    });
    const r = balance([], targets, LIBRARY, NOW, TZ);
    expect(r.windowStart).toBe("2026-09-14");
    expect(r.windowEnd).toBe("2026-09-27");
    expect(r.computedAt).toBe(NOW);
    expect(Object.keys(r).sort()).toEqual(["areas", "computedAt", "windowEnd", "windowStart"]);
    expect(r.areas).toHaveLength(9);
    expect(new Set(r.areas.map((a) => a.area)).size).toBe(9);
    for (const a of r.areas) {
      expect(Object.keys(a).sort()).toEqual(
        [
          "area",
          "load",
          "target",
          "targetSource",
          "targetUpdatedAt",
          "deficit",
          "coverageStep",
          "needsAttention",
          "recovering",
          "lastTrainedDate",
          "days",
          "contributors",
        ].sort(),
      );
      expect(a.days).toHaveLength(14);
    }
    const ham = areaOf(r, "hamstrings");
    expect(ham.targetSource).toBe("adapted");
    expect(ham.targetUpdatedAt).toBe("2026-09-20T08:00:00Z");
    expect(areaOf(r, "chest").targetSource).toBe("default");
    expect(areaOf(r, "chest").targetUpdatedAt).toBe("2026-08-02T10:00:00Z");
  });

  it("R11-E1 (AC22) coverage steps 0–4 at a target of 20", () => {
    const steps = [0, 6, 7, 14, 20, 24].map(
      (n) =>
        areaOf(balance(setsOn(n, "back-squat", "2026-09-25"), F_TARGETS, LIBRARY, NOW, TZ), "quads")
          .coverageStep,
    );
    expect(steps).toEqual([0, 1, 2, 3, 4, 4]);
  });

  it("rule-11 (AC22) coverage-step boundaries 0.33 and 0.66 are exclusive, and any load > 0 is at least 1", () => {
    const t100 = targetsFrom({ ...F_TARGET_VALUES, quads: 100 });
    const step = (n: number) =>
      areaOf(balance(setsOn(n, "back-squat", "2026-09-25"), t100, LIBRARY, NOW, TZ), "quads")
        .coverageStep;
    expect(step(33)).toBe(2);
    expect(step(66)).toBe(3);
    const ham = areaOf(
      balance(setsOn(1, "back-squat", "2026-09-25"), F_TARGETS, LIBRARY, NOW, TZ),
      "hamstrings",
    );
    expect(ham.load).toBe(0.5);
    expect(ham.coverageStep).toBe(1);
  });

  it("R11-E2 (AC23) load, days and contributors per area", () => {
    const ham = areaOf(balance(ac23History, F_TARGETS, LIBRARY, NOW, TZ), "hamstrings");
    expect(ham.load).toBe(6);
    expect(ham.deficit).toBe(0.625);
    expect(ham.lastTrainedDate).toBe("2026-09-25");
    expect(ham.days[6]).toBe(4);
    expect(ham.days[11]).toBe(2);
    expect(ham.contributors).toEqual([
      { exerciseId: "romanian-deadlift", weightedSets: 4, lastDate: "2026-09-20" },
      { exerciseId: "back-squat", weightedSets: 2, lastDate: "2026-09-25" },
    ]);
  });

  it("R11-E3 (AC24) R5-E1 at 2026-10-01: an empty window keeps lastTrainedDate and flags nothing", () => {
    const r = balance(
      setsOn(4, "romanian-deadlift", "2026-09-17"),
      F_TARGETS,
      LIBRARY,
      NOW_OCT_01,
      TZ,
    );
    const ham = areaOf(r, "hamstrings");
    expect(ham.load).toBe(0);
    expect(ham.days).toEqual(new Array(14).fill(0));
    expect(ham.lastTrainedDate).toBe("2026-09-17");
    expect(r.areas.every((a) => !a.needsAttention)).toBe(true);
  });

  it("R11-E4 (AC25, offline) queued sets count like server rows", () => {
    const queued = setsOn(3, "romanian-deadlift", "2026-09-27", { time: "09:00", pending: true });
    const r = balance([...ac23History, ...queued], F_TARGETS, LIBRARY, NOW, TZ);
    expect(areaOf(r, "hamstrings").load).toBe(9);
    expect(areaOf(r, "glutes").load).toBe(7.5);
    const rdl = areaOf(r, "hamstrings").contributors.find(
      (c) => c.exerciseId === "romanian-deadlift",
    );
    expect(rdl).toEqual({
      exerciseId: "romanian-deadlift",
      weightedSets: 7,
      lastDate: "2026-09-27",
    });
  });

  it("rule-11 (AC26) areas sort by needsAttention, then deficit desc, then the fixed order", () => {
    const r = balance(ac23History, F_TARGETS, LIBRARY, NOW, TZ);
    expect(orderOf(r)).toEqual([
      "chest",
      "back",
      "shoulders",
      "arms",
      "calves",
      "core",
      "quads",
      "glutes",
      "hamstrings",
    ]);
    expect(areaOf(r, "core").deficit).toBeCloseTo(5 / 6, 12);
    expect(areaOf(r, "quads").deficit).toBe(0.8);
    expect(areaOf(r, "glutes").deficit).toBe(0.7);
  });

  it("rule-11 (AC27) contributor ties break by name (code units), then id, without localeCompare", () => {
    const spy = vi.spyOn(String.prototype, "localeCompare");
    try {
      const history = [
        ...setsOn(3, "seated-cable-row", "2026-09-25"),
        ...setsOn(3, "lat-pulldown", "2026-09-25"),
      ];
      const back = areaOf(balance(history, F_TARGETS, LIBRARY, NOW, TZ), "back");
      expect(back.contributors.map((c) => c.exerciseId)).toEqual([
        "lat-pulldown",
        "seated-cable-row",
      ]);

      const twin = (id: string): LibraryExercise => ({
        id,
        name: "Row",
        kind: "exercise",
        type: "compound",
        level: "beginner",
        equipment: [],
        areas: { back: 1 },
        timed: false,
        defaultDurationS: null,
        incrementKg: 5,
        externalLoad: true,
      });
      const twinsHistory = [
        ...setsOn(2, "zz-row", "2026-09-25"),
        ...setsOn(2, "aa-row", "2026-09-24"),
      ];
      for (const lib of [
        [...LIBRARY, twin("zz-row"), twin("aa-row")],
        [twin("aa-row"), twin("zz-row"), ...LIBRARY],
      ]) {
        for (const h of [twinsHistory, [...twinsHistory].reverse()]) {
          const b = areaOf(balance(h, F_TARGETS, lib, NOW, TZ), "back");
          expect(b.contributors.map((c) => c.exerciseId)).toEqual(["aa-row", "zz-row"]);
        }
      }
      // Code units: an uppercase name sorts before a lowercase one ("Z" < "a").
      const upper = { ...twin("u-row"), name: "Zed row" };
      const lower = { ...twin("l-row"), name: "alpha row" };
      const h2 = [...setsOn(1, "u-row", "2026-09-25"), ...setsOn(1, "l-row", "2026-09-25")];
      const b2 = areaOf(balance(h2, F_TARGETS, [...LIBRARY, lower, upper], NOW, TZ), "back");
      expect(b2.contributors.map((c) => c.exerciseId)).toEqual(["u-row", "l-row"]);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("rule-11 (AC28) invalid targets throw RangeError", () => {
    const missingCalves = F_TARGETS.filter((t) => t.area !== "calves");
    expect(() => balance([], missingCalves, LIBRARY, NOW, TZ)).toThrow(RangeError);
    for (const bad of [0, 12.5, -4, Number.NaN]) {
      const targets = targetsFrom({ ...F_TARGET_VALUES, chest: bad });
      expect(() => balance([], targets, LIBRARY, NOW, TZ)).toThrow(RangeError);
    }
    expect(() => balance([], [...F_TARGETS, F_TARGETS[0]!], LIBRARY, NOW, TZ)).toThrow(RangeError);
  });

  it("rule-11 targets may arrive in any order; areas still carry the right target", () => {
    const r = balance([], [...F_TARGETS].reverse(), LIBRARY, NOW, TZ);
    for (const area of AREAS) expect(areaOf(r, area).target).toBe(F_TARGET_VALUES[area]);
  });
});
