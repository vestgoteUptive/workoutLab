// Rules 1–3: mapping, hard sets, rolling window (UF-10.1, UF-10.2). AC6–AC13.
import { describe, expect, it } from "vitest";
import {
  AREAS,
  areaLoads,
  balance,
  isHardSet,
  localDate,
  primaryAreas,
  windowOf,
} from "../src/index.js";
import {
  F_TARGETS,
  L1,
  LIBRARY,
  NOW,
  NOW_MIDNIGHT_28,
  TZ,
  setsAt,
  setsOn,
} from "./fixtures/common.js";
import { ZERO_DAYS, areaOf } from "./helpers.js";

const lib = (id: string) => {
  const ex = LIBRARY.find((e) => e.id === id);
  if (!ex) throw new Error(id);
  return ex;
};

describe("rule-1 exercise → area mapping", () => {
  it("R1-E1 (AC6) 1 back-squat set maps to quads 1, glutes 1, hamstrings 0.5, core 0.5", () => {
    expect(areaLoads(setsOn(1, "back-squat", "2026-09-25"), LIBRARY, NOW, TZ)).toEqual({
      chest: 0,
      back: 0,
      shoulders: 0,
      arms: 0,
      core: 0.5,
      glutes: 1,
      quads: 1,
      hamstrings: 0.5,
      calves: 0,
    });
  });

  it("rule-1 (AC6) primaryAreas lists weight-1.0 areas in the fixed order", () => {
    expect(primaryAreas(lib("back-squat"))).toEqual(["glutes", "quads"]);
    expect(primaryAreas(lib("bench-press"))).toEqual(["chest"]);
  });

  it("rule-1 every L1 exercise has at least one primary area", () => {
    for (const ex of L1) expect(primaryAreas(ex).length).toBeGreaterThan(0);
  });
});

describe("rule-2 hard sets", () => {
  it("R2-E1 (AC7) warm-up sets never count", () => {
    const history = [
      ...setsOn(6, "back-squat", "2026-09-25"),
      ...setsOn(2, "back-squat", "2026-09-25", { isWarmup: true, tag: "wu-" }),
    ];
    const loads = areaLoads(history, LIBRARY, NOW, TZ);
    expect([loads.quads, loads.glutes, loads.hamstrings, loads.core]).toEqual([6, 6, 3, 3]);
  });

  it("rule-2 (AC7) warm-up moves (kind warmup) add 0 even when isWarmup is false", () => {
    const history = setsOn(2, "wu-bodyweight-squat", "2026-09-25");
    const r = balance(history, F_TARGETS, LIBRARY, NOW, TZ);
    for (const area of ["quads", "glutes"] as const) {
      expect(areaOf(r, area).load).toBe(0);
      expect(areaOf(r, area).lastTrainedDate).toBeNull();
    }
    expect(isHardSet(history[0]!, lib("wu-bodyweight-squat"))).toBe(false);
  });

  it("rule-2 (AC7, stale library) sets of an unknown exercise add 0 and are no contributor", () => {
    const base = setsOn(3, "back-squat", "2026-09-25");
    const withUnknown = [...base, ...setsOn(2, "cossack-squat-v2", "2026-09-26")];
    const a = balance(base, F_TARGETS, LIBRARY, NOW, TZ);
    const b = balance(withUnknown, F_TARGETS, LIBRARY, NOW, TZ);
    expect(b).toEqual(a);
    for (const area of b.areas) {
      expect(area.contributors.map((c) => c.exerciseId)).not.toContain("cossack-squat-v2");
    }
    expect(isHardSet(withUnknown[3]!, undefined)).toBe(false);
  });

  it("rule-2 isHardSet: not warm-up, not tombstoned, known exercise", () => {
    const [s] = setsOn(1, "back-squat", "2026-09-25");
    expect(isHardSet(s!, lib("back-squat"))).toBe(true);
    expect(isHardSet({ ...s!, isWarmup: true }, lib("back-squat"))).toBe(false);
    expect(isHardSet({ ...s!, deletedAt: s!.completedAt }, lib("back-squat"))).toBe(false);
  });
});

describe("rule-3 rolling window", () => {
  it("R3-E1 (AC8) the window is D−13 … D in local days", () => {
    const history = [
      ...setsAt(1, "back-squat", "2026-09-14T23:59:00+02:00"),
      ...setsAt(1, "back-squat", "2026-09-13T23:59:00+02:00"),
    ];
    expect(areaLoads(history, LIBRARY, NOW, TZ).quads).toBe(1);
    expect(areaLoads(history, LIBRARY, NOW_MIDNIGHT_28, TZ).quads).toBe(0);
    expect(windowOf(NOW_MIDNIGHT_28, TZ)).toEqual({
      windowStart: "2026-09-15",
      windowEnd: "2026-09-28",
    });
    expect(balance(history, F_TARGETS, LIBRARY, NOW_MIDNIGHT_28, TZ).windowStart).toBe(
      "2026-09-15",
    );
  });

  it("R3-E2 (AC9) a set at 22:30Z lands on the next local day", () => {
    const r = balance(setsAt(1, "back-squat", "2026-09-26T22:30:00Z"), F_TARGETS, LIBRARY, NOW, TZ);
    expect(areaOf(r, "quads").days[13]).toBe(1);
    expect(areaOf(r, "quads").days[12]).toBe(0);
    expect(localDate("2026-09-26T22:30:00Z", TZ)).toBe("2026-09-27");
  });

  it("R3-E3 (AC10) tombstoned sets are excluded", () => {
    const [a, b, c] = setsOn(3, "back-squat", "2026-09-25");
    const history = [a!, b!, { ...c!, deletedAt: "2026-09-25T11:00:00+02:00" }];
    expect(areaLoads(history, LIBRARY, NOW, TZ).quads).toBe(2);
  });

  it("R3-E4 (AC11, zero history) every load is 0 and every days array is 14 zeros", () => {
    const loads = areaLoads([], LIBRARY, NOW, TZ);
    for (const area of AREAS) expect(loads[area]).toBe(0);
    const r = balance([], F_TARGETS, LIBRARY, NOW, TZ);
    for (const a of r.areas) {
      expect(a.load).toBe(0);
      expect(a.days).toEqual(ZERO_DAYS);
    }
  });

  it("rule-3 (AC12) a DST change inside the window keeps 14 local days", () => {
    const now = "2026-11-06T12:00:00+01:00";
    const history = [
      ...setsAt(1, "back-squat", "2026-10-23T21:30:00Z"),
      ...setsAt(1, "back-squat", "2026-10-23T22:30:00Z"),
      ...setsAt(1, "back-squat", "2026-10-25T01:30:00Z"),
      ...setsAt(1, "back-squat", "2026-11-06T10:59:00Z"),
    ];
    const r = balance(history, F_TARGETS, LIBRARY, now, TZ);
    expect(r.windowStart).toBe("2026-10-24");
    expect(r.windowEnd).toBe("2026-11-06");
    const quads = areaOf(r, "quads");
    expect(quads.load).toBe(3);
    expect(quads.days[0]).toBe(1);
    expect(quads.days[1]).toBe(1);
    expect(quads.days[13]).toBe(1);
  });

  it("rule-3 (AC13) a set is placed by completed_at, never by edited_at", () => {
    const history = setsAt(1, "back-squat", "2026-09-13T23:59:00+02:00", {
      editedAt: "2026-09-20T10:00:00+02:00",
    });
    expect(areaLoads(history, LIBRARY, NOW, TZ).quads).toBe(0);
  });

  it("rule-3 (AC13) a future-dated set adds nothing to the window", () => {
    const r = balance(
      setsAt(1, "back-squat", "2026-09-28T09:00:00+02:00"),
      F_TARGETS,
      LIBRARY,
      NOW,
      TZ,
    );
    expect(areaOf(r, "quads").load).toBe(0);
    for (const a of r.areas) expect(a.days).toEqual(ZERO_DAYS);
    expect(areaOf(r, "quads").lastTrainedDate).toBeNull(); // D-0036
  });
});
