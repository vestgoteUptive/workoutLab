// @vitest-environment node
// T-0307b AC-2 (bestSet), AC-8 (clock-free stats), and the pure halves of AC-1, AC-3, AC-6, AC-9.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CheckinSession } from "@workoutlab/engine";
import { bestSet, exerciseHistory, monthCalendar, recentExercises } from "../stats.js";
import { LIBRARY, LOCALE, NOW, TZ, historyH, set } from "./fixtures.js";

const lib = (id: string) => LIBRARY.find((e) => e.id === id)!;

describe("AC-2 bestSet", () => {
  it("weighted: highest weight, then most reps at it", () => {
    const sets = [
      set("s", "back-squat", "2026-09-20 10:00", { w: 100, r: 8 }),
      set("s", "back-squat", "2026-09-20 10:05", { w: 102.5, r: 5 }),
      set("s", "back-squat", "2026-09-20 10:10", { w: 102.5, r: 6 }),
    ];
    const best = bestSet(sets, lib("back-squat"), { locale: LOCALE })!;
    expect(best).toMatchObject({ kind: "weighted", weightKg: 102.5, reps: 6 });
    expect(best.label).toBe("102.5 kg × 6");
  });

  it("bodyweight: most reps", () => {
    const sets = [
      set("s", "push-up", "2026-09-20 10:00", { w: 0, r: 12 }),
      set("s", "push-up", "2026-09-20 10:05", { w: 0, r: 15 }),
    ];
    const best = bestSet(sets, lib("push-up"), { locale: LOCALE })!;
    expect(best).toMatchObject({ kind: "reps", reps: 15 });
    expect(best.label).toBe("15 reps");
  });

  it("timed: longest duration", () => {
    const sets = [
      set("s", "plank", "2026-09-20 10:00", { d: 40 }),
      set("s", "plank", "2026-09-20 10:05", { d: 45 }),
    ];
    const best = bestSet(sets, lib("plank"), { locale: LOCALE })!;
    expect(best).toMatchObject({ kind: "timed", durationS: 45 });
    expect(best.label).toBe("45 s");
  });

  it("ignores a warm-up set and a tombstoned set", () => {
    const sets = [
      set("s", "back-squat", "2026-09-20 10:00", { w: 150, r: 5, isWarmup: true }),
      set("s", "back-squat", "2026-09-20 10:05", {
        w: 140,
        r: 5,
        deletedAt: "2026-09-20T09:00:00.000Z",
        editedAt: "2026-09-20T09:00:00.000Z",
      }),
      set("s", "back-squat", "2026-09-20 10:10", { w: 100, r: 5 }),
    ];
    expect(bestSet(sets, lib("back-squat"), { locale: LOCALE })!.label).toBe("100 kg × 5");
  });

  it("is null when only warm-up or tombstoned rows exist", () => {
    const sets = [
      set("s", "back-squat", "2026-09-20 10:00", { w: 150, r: 5, isWarmup: true }),
      set("s", "back-squat", "2026-09-20 10:05", {
        w: 140,
        r: 5,
        deletedAt: "2026-09-20T09:00:00.000Z",
        editedAt: "2026-09-20T09:00:00.000Z",
      }),
    ];
    expect(bestSet(sets, lib("back-squat"))).toBeNull();
    expect(bestSet([], lib("back-squat"))).toBeNull();
  });

  it("prints at most 2 fraction digits", () => {
    const sets = [set("s", "back-squat", "2026-09-20 10:00", { w: 101.25, r: 3 })];
    expect(bestSet(sets, lib("back-squat"), { locale: LOCALE })!.label).toBe("101.25 kg × 3");
  });
});

describe("monthCalendar (AC-1, AC-6, pure)", () => {
  const s = (startedAt: string, hardSetCount: number): CheckinSession => ({
    id: startedAt,
    startedAt,
    hardSetCount,
  });

  it("marks local dates, counts sessions and lays out Monday-first", () => {
    const cal = monthCalendar(
      [
        s("2026-09-01T07:00:00Z", 3),
        s("2026-09-14T08:00:00Z", 0),
        s("2026-09-26T22:30:00Z", 4),
        s("2026-08-31T21:59:00Z", 5),
        s("2026-09-20T09:00:00Z", 2),
        s("2026-08-31T22:30:00Z", 2),
      ],
      NOW,
      TZ,
    );
    expect(cal.marked).toEqual([1, 20, 27]);
    expect(cal.count).toBe(4);
    expect(cal.today).toBe(27);
    expect(cal.weeks[0]).toEqual([null, 1, 2, 3, 4, 5, 6]);
    expect(cal.weeks.every((w) => w.length === 7)).toBe(true);
  });

  it("rolls over on 1 October (Thursday start, 3 blank cells)", () => {
    const cal = monthCalendar(
      [s("2026-09-17T08:00:00Z", 4)],
      new Date("2026-10-01T09:00:00+02:00"),
      TZ,
    );
    expect(cal).toMatchObject({ year: 2026, month: 10, marked: [], count: 0, today: 1 });
    expect(cal.weeks[0]).toEqual([null, null, null, 1, 2, 3, 4]);
  });
});

describe("recentExercises and exerciseHistory over H", () => {
  it("orders by last date desc, then name; best set from the latest session", () => {
    const rows = recentExercises(historyH(), LIBRARY, NOW, TZ, LOCALE);
    expect(rows.map((r) => [r.name, r.lastDate, r.best.label])).toEqual([
      ["Back squat", "2026-09-25", "102.5 kg × 5"],
      ["Plank", "2026-09-24", "45 s"],
      ["Push-up", "2026-09-24", "15 reps"],
      ["Romanian deadlift", "2026-09-22", "80 kg × 10"],
    ]);
  });

  it("skips an exercise missing from the library", () => {
    const withGhost = [...historyH(), set("G", "ghost", "2026-09-26 10:00", { w: 5, r: 5 })];
    expect(recentExercises(withGhost, LIBRARY, NOW, TZ, LOCALE)).toHaveLength(4);
  });

  it("builds the back squat rows and cards", () => {
    const h = exerciseHistory("back-squat", historyH(), LIBRARY, NOW, TZ, LOCALE)!;
    expect(h.rows).toEqual([
      { sessionId: "B", date: "2026-09-25", sets: ["102.5 × 5", "100 × 8"] },
      { sessionId: "A", date: "2026-09-20", sets: ["100 × 8", "100 × 6"] },
    ]);
    expect(h.best!.label).toBe("102.5 kg × 5");
    expect(h.heaviestKg).toBe(102.5);
    expect(h.sessions).toBe(2);
  });

  it("bodyweight and timed rows are bare", () => {
    expect(exerciseHistory("push-up", historyH(), LIBRARY, NOW, TZ, LOCALE)!.rows[0]!.sets).toEqual(
      ["15", "12"],
    );
    const plank = exerciseHistory("plank", historyH(), LIBRARY, NOW, TZ, LOCALE)!;
    expect(plank.rows[0]!.sets).toEqual(["40 s", "45 s"]);
    expect(plank.heaviestKg).toBeNull();
  });

  it("returns null for unknown and warm-up ids", () => {
    expect(exerciseHistory("nope", [], LIBRARY, NOW, TZ)).toBeNull();
    expect(exerciseHistory("wu-cat-cow", [], LIBRARY, NOW, TZ)).toBeNull();
  });

  it("keeps a set at local 00:30 on today - 55 and drops one at 23:30 on today - 56 (AC-8)", () => {
    const edge = [
      set("G", "back-squat", "2026-08-03 00:30", { w: 90, r: 5 }),
      set("G2", "back-squat", "2026-08-02 23:30", { w: 95, r: 5 }),
    ];
    const h = exerciseHistory("back-squat", edge, LIBRARY, NOW, TZ, LOCALE)!;
    expect(h.rows.map((r) => r.date)).toEqual(["2026-08-03"]);
    expect(h.sessions).toBe(1);
  });
});

describe("AC-8 stats.ts is clock-free and pure", () => {
  it("has no Date.now, zero-argument new Date() or Math.random", () => {
    const source = readFileSync(resolve(__dirname, "../stats.ts"), "utf8");
    expect(source).not.toMatch(/Date\.now/);
    expect(source).not.toMatch(/new Date\(\s*\)/);
    expect(source).not.toMatch(/Math\.random/);
  });

  it("gives deep-equal results on a second call with the same inputs", () => {
    const history = historyH();
    const sessions: CheckinSession[] = [
      { id: "A", startedAt: "2026-09-20T08:00:00Z", hardSetCount: 2 },
    ];
    expect(monthCalendar(sessions, NOW, TZ)).toEqual(monthCalendar(sessions, NOW, TZ));
    expect(recentExercises(history, LIBRARY, NOW, TZ)).toEqual(
      recentExercises(history, LIBRARY, NOW, TZ),
    );
    expect(exerciseHistory("back-squat", history, LIBRARY, NOW, TZ)).toEqual(
      exerciseHistory("back-squat", history, LIBRARY, NOW, TZ),
    );
    const sets = history.slice(0, 3);
    expect(bestSet(sets, lib("back-squat"))).toEqual(bestSet(sets, lib("back-squat")));
  });
});
