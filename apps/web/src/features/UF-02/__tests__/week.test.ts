// T-0623 (UF-02.1, D-0212 §1.1): `weekRow`, the pure week helper. AC1 to AC4.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { HistorySet } from "@workoutlab/shared";
import { en } from "../../../lib/i18n/en.js";
import { weekdayNames, weekRow } from "../week.js";

const STO = "Europe/Stockholm";
const NY = "America/New_York";
const SUNDAY = new Date("2026-10-11T12:00:00+02:00");

function set(
  at: string,
  sessionId: string,
  extra: Partial<HistorySet> = {},
  id = `${sessionId}-${at}`,
): HistorySet {
  const iso = new Date(at).toISOString();
  return {
    clientId: id,
    sessionId,
    exerciseId: "bench-press",
    isWarmup: false,
    completedAt: iso,
    editedAt: iso,
    deletedAt: null,
    reps: 8,
    weightKg: 60,
    durationS: null,
    ...extra,
  };
}

const statuses = (row: ReturnType<typeof weekRow>) => row.days.map((d) => d.status);

describe("AC1 the week", () => {
  const history = [
    set("2026-10-05T18:00:00+02:00", "A", {}, "a1"),
    set("2026-10-05T18:05:00+02:00", "A", {}, "a2"),
    set("2026-10-07T18:00:00+02:00", "B"),
    set("2026-10-07T19:00:00+02:00", "C"),
    set("2026-10-11T09:00:00+02:00", "D"),
  ];

  it("Sunday 2026-10-11: [done, rest, done, rest, rest, rest, done(today)], 4 sessions", () => {
    const row = weekRow(history, SUNDAY, STO);
    expect(statuses(row)).toEqual(["done", "rest", "done", "rest", "rest", "rest", "done"]);
    expect(row.days.map((d) => d.isToday)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      true,
    ]);
    expect(row.days[0]!.date).toBe("2026-10-05");
    expect(row.count).toBe(4);
  });

  it("midweek: later days are upcoming", () => {
    const row = weekRow([], new Date("2026-10-07T12:00:00+02:00"), STO);
    expect(statuses(row)).toEqual([
      "rest",
      "rest",
      null,
      "upcoming",
      "upcoming",
      "upcoming",
      "upcoming",
    ]);
    expect(row.count).toBe(0);
  });

  it("reads no clock", () => {
    const src = readFileSync(resolve(__dirname, "..", "week.ts"), "utf8");
    expect(src).not.toMatch(/Date\.now/);
    expect(src).not.toMatch(/new Date\(\s*\)/);
  });
});

describe("AC2 filters", () => {
  it("a tombstoned set does not count", () => {
    const row = weekRow(
      [set("2026-10-05T10:00:00+02:00", "A", { deletedAt: "2026-10-06T10:00:00Z" })],
      SUNDAY,
      STO,
    );
    expect(row.days[0]!.status).toBe("rest");
    expect(row.count).toBe(0);
  });

  it("a warm-up-only day is not done", () => {
    const row = weekRow([set("2026-10-05T10:00:00+02:00", "A", { isWarmup: true })], SUNDAY, STO);
    expect(row.days[0]!.status).toBe("rest");
    expect(row.count).toBe(0);
  });

  it("a pending queued set counts", () => {
    const row = weekRow([set("2026-10-05T10:00:00+02:00", "A", { pending: true })], SUNDAY, STO);
    expect(row.days[0]!.status).toBe("done");
    expect(row.count).toBe(1);
  });
});

describe("AC3 time zone and boundaries", () => {
  it("23:30 local Sunday of the previous week does not count; 00:10 Monday does", () => {
    const before = weekRow([set("2026-10-04T23:30:00+02:00", "A")], SUNDAY, STO);
    expect(before.count).toBe(0);
    expect(statuses(before)[0]).toBe("rest");
    const after = weekRow([set("2026-10-05T00:10:00+02:00", "A")], SUNDAY, STO);
    expect(after.count).toBe(1);
    expect(statuses(after)[0]).toBe("done");
  });

  it("the same instant falls on the other side in America/New_York", () => {
    // 2026-10-05T00:10+02:00 is Sunday 18:10 in New York: the previous week.
    const sets = [set("2026-10-05T00:10:00+02:00", "A")];
    const ny = weekRow(sets, new Date("2026-10-11T18:00:00Z"), NY);
    expect(ny.count).toBe(0);
    expect(ny.days[0]!.date).toBe("2026-10-05");
    expect(statuses(ny)[0]).toBe("rest");
  });

  it("a session spanning midnight counts both days and one session", () => {
    const row = weekRow(
      [
        set("2026-10-06T23:50:00+02:00", "A", {}, "x"),
        set("2026-10-07T00:20:00+02:00", "A", {}, "y"),
      ],
      SUNDAY,
      STO,
    );
    expect(statuses(row).slice(0, 4)).toEqual(["rest", "done", "done", "rest"]);
    expect(row.count).toBe(1);
  });

  it("DST: the week of Sunday 2026-10-25 (Stockholm clocks go back) keeps seven calendar days", () => {
    const row = weekRow(
      [
        set("2026-10-25T00:30:00+02:00", "A"),
        set("2026-10-25T23:30:00+01:00", "B", {}, "b"),
        set("2026-10-19T00:10:00+02:00", "C"),
        set("2026-10-18T23:30:00+02:00", "D"),
      ],
      new Date("2026-10-25T12:00:00+01:00"),
      STO,
    );
    expect(row.days.map((d) => d.date)).toEqual([
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
    ]);
    expect(statuses(row)).toEqual(["done", "rest", "rest", "rest", "rest", "rest", "done"]);
    expect(row.count).toBe(3);
  });
});

describe("AC4 today", () => {
  it("with no set: no status and the text is 'Sunday, today'", () => {
    const row = weekRow([], SUNDAY, STO);
    const today = row.days[6]!;
    expect(today.status).toBeNull();
    expect(
      en.uf02.weekDayName(weekdayNames(row.days, "en-GB")[6]!, today.status, today.isToday),
    ).toBe("Sunday, today");
  });

  it("with one set: 'Sunday, today, done'", () => {
    const row = weekRow([set("2026-10-11T08:00:00+02:00", "A")], SUNDAY, STO);
    const today = row.days[6]!;
    expect(en.uf02.weekDayName("Sunday", today.status, today.isToday)).toBe("Sunday, today, done");
  });

  it("past and upcoming texts", () => {
    expect(en.uf02.weekDayName("Monday", "done", false)).toBe("Monday, done");
    expect(en.uf02.weekDayName("Tuesday", "rest", false)).toBe("Tuesday, rest");
    expect(en.uf02.weekDayName("Thursday", "upcoming", false)).toBe("Thursday");
  });
});
