// @vitest-environment node
// T-0303a AC-4: the finish-time conversion as a pure function (D-0065 §2, D-0107 §6).
import { describe, expect, it } from "vitest";
import { clampBudget, finishInstant, finishToBudget } from "../time.js";
import { NOW, TZ } from "./fixtures.js";

describe("finishToBudget at F-tz (12:00 Europe/Stockholm)", () => {
  it.each([
    ["13:07", 67],
    ["13:00", 60],
    ["12:10", 15],
    ["12:15", 15],
    ["12:20", 20],
    ["14:00", 120],
    ["23:59", 120],
  ])("%s → %i min", (value, expected) => {
    expect(finishToBudget(value, new Date(NOW).toISOString(), TZ)).toEqual({
      kind: "ok",
      budgetMin: expected,
    });
  });

  it.each(["12:00", "11:30", "00:00"])("%s (at or before now) is rejected", (value) => {
    expect(finishToBudget(value, NOW, TZ)).toEqual({ kind: "rejected" });
  });

  it.each(["", "1", "13:", "1:07", "13:7", "25:00", "13:60", "13:07:00"])(
    "%j is partial: nothing converts",
    (value) => {
      expect(finishToBudget(value, NOW, TZ)).toEqual({ kind: "partial" });
    },
  );

  it("floors part minutes: at 12:00:30, 13:07 → 66", () => {
    expect(finishToBudget("13:07", "2026-09-27T12:00:30+02:00", TZ)).toEqual({
      kind: "ok",
      budgetMin: 66,
    });
  });

  it("reads the wall clock in the given zone: 13:07 in New York at 12:00 EDT → 67", () => {
    expect(finishToBudget("13:07", "2026-09-27T12:00:00-04:00", "America/New_York")).toEqual({
      kind: "ok",
      budgetMin: 67,
    });
  });

  it("is DST-safe: 29 Mar 2026 Stockholm, 01:30 CET → 03:15 CEST is 45 min of real time", () => {
    // Clocks jump 02:00 CET → 03:00 CEST; a wall-clock difference would say 105 min.
    expect(finishToBudget("03:15", "2026-03-29T01:30:00+01:00", TZ)).toEqual({
      kind: "ok",
      budgetMin: 45,
    });
  });
});

describe("clamp and finish instant", () => {
  it("clamps to 15–120", () => {
    expect(clampBudget(10)).toBe(15);
    expect(clampBudget(15)).toBe(15);
    expect(clampBudget(120)).toBe(120);
    expect(clampBudget(719)).toBe(120);
  });

  it("finishInstant adds whole minutes", () => {
    expect(finishInstant("2026-09-27T10:00:00.000Z", 45)).toBe("2026-09-27T10:45:00.000Z");
  });
});
