// T-0202: the simulated 14-day histories through evaluateCheckin (engine-rules §Required tests)
// and rule 9 invariants (AC24, AC25), plus a seeded property test (D-0036 §5: no fast-check).
import { describe, expect, it } from "vitest";
import {
  addDays,
  checkinSessions,
  dayDiff,
  evaluateCheckin,
  localDate,
  type CheckinAnswer,
  type CheckinEvaluation,
  type CheckinProfile,
  type CheckinSession,
  type HistorySet,
} from "@workoutlab/engine";
import {
  CHECKIN_TZ as TZ,
  DOWN_2_3,
  F_CHECKIN,
  NO_CHECKINS,
  ONBOARD_DATE,
  checkinProfile,
  on,
  per,
  sessionRefsOf,
} from "./fixtures/checkin.js";
import { LIBRARY } from "./fixtures/common.js";
import { SIMULATED_HISTORIES } from "./fixtures/histories.js";
import { mulberry32, randomHistory } from "./fixtures/random.js";

type Name = keyof typeof SIMULATED_HISTORIES;

function sessionsOf(history: readonly HistorySet[]): CheckinSession[] {
  return checkinSessions(sessionRefsOf(history), history, LIBRARY);
}

function evalOn(name: Name, date: string): CheckinEvaluation {
  return evaluateCheckin(
    sessionsOf(SIMULATED_HISTORIES[name]),
    F_CHECKIN,
    NO_CHECKINS,
    on(date),
    TZ,
  );
}

describe("simulated 14-day histories through evaluateCheckin (AC24)", () => {
  it("rule-9 (AC24) session hard-set counts from checkinSessions", () => {
    const counts = (n: Name) => sessionsOf(SIMULATED_HISTORIES[n]).map((s) => s.hardSetCount);
    expect(counts("balanced")).toEqual([19, 19, 19, 19, 19, 19, 19]);
    expect(counts("allChestNoLegs")).toEqual([10, 10, 10, 10, 10, 10]);
    expect(counts("returningAfter10Days")).toEqual([19, 19, 19, 19, 3, 4]);
    // The 09-26 session lost a tombstoned bench-press set; the queued 09-27 session has 3.
    expect(counts("offlineMerged")).toEqual([10, 10, 10, 10, 10, 9, 3]);
  });

  it("rule-9 (AC24) on 2026-09-27", () => {
    const onPlan = [per(2, 0, "under"), per(3, 6, "on_plan")];
    for (const n of ["balanced", "allChestNoLegs", "offlineMerged"] as const) {
      expect(evalOn(n, "2026-09-27"), n).toStrictEqual({
        periods: onPlan,
        proposal: null,
        nextCheckinDate: "2026-10-11",
      });
    }
    expect(evalOn("returningAfter10Days", "2026-09-27")).toStrictEqual({
      periods: [per(2, 4, "under"), per(3, 2, "under")],
      proposal: DOWN_2_3,
      nextCheckinDate: "2026-10-11",
    });
  });

  it("rule-9 (AC24) on 2026-10-11", () => {
    const cases: Array<[Name, CheckinEvaluation["periods"], CheckinEvaluation["proposal"]]> = [
      ["balanced", [per(3, 6, "on_plan"), per(4, 1, "under")], null],
      ["allChestNoLegs", [per(3, 6, "on_plan"), per(4, 0, "under")], null],
      ["returningAfter10Days", [per(3, 2, "under"), per(4, 0, "under")], DOWN_2_3],
      ["offlineMerged", [per(3, 6, "on_plan"), per(4, 1, "under")], null],
    ];
    for (const [n, periods, proposal] of cases) {
      expect(evalOn(n, "2026-10-11"), n).toStrictEqual({
        periods,
        proposal,
        nextCheckinDate: "2026-10-25",
      });
    }
  });
});

// ---- Invariants (AC25) ----

function expectInvariants(
  sessions: readonly CheckinSession[],
  profile: CheckinProfile,
  checkins: readonly CheckinAnswer[],
  now: string,
  label: string,
): void {
  const r = evaluateCheckin(sessions, profile, checkins, now, TZ);
  const D = localDate(now, TZ);
  const onboard = localDate(profile.onboardedAt, TZ);
  const { rhythmMin: min, rhythmMax: max } = profile;

  expect(r.periods.length, label).toBeLessThanOrEqual(2);
  r.periods.forEach((p, i) => {
    if (i > 0) expect(p.index, label).toBe((r.periods[i - 1]?.index ?? -2) + 1);
    expect(p.start, label).toBe(addDays(onboard, 14 * p.index));
    expect(p.end, label).toBe(addDays(p.start, 13));
    expect(p.end < D, label).toBe(true);
    const completed = sessions.filter((s) => {
      const d = localDate(s.startedAt, TZ);
      return s.hardSetCount >= 1 && d >= p.start && d <= p.end;
    }).length;
    expect(p.completed, label).toBe(completed);
    const expected =
      10 * completed < 14 * min ? "under" : 10 * completed > 22 * max ? "over" : "on_plan";
    expect(p.status, label).toBe(expected);
  });

  const [a, b] = r.periods;
  const streak =
    r.periods.length === 2 && a !== undefined && b !== undefined && a.status === b.status
      ? a.status
      : "on_plan";
  if (streak === "on_plan") {
    expect(r.proposal, label).toBeNull();
  } else {
    const delta = streak === "under" ? -1 : 1;
    const clampMax = Math.min(7, Math.max(1, max + delta));
    const clampMin = Math.min(Math.min(7, Math.max(1, min + delta)), clampMax);
    if (clampMin === min && clampMax === max) {
      expect(r.proposal, label).toBeNull();
    } else {
      expect(r.proposal, label).not.toBeNull();
      const p = r.proposal;
      expect(p?.direction, label).toBe(streak === "under" ? "down" : "up");
      expect(p?.rhythmMin, label).toBe(clampMin);
      expect(p?.rhythmMax, label).toBe(clampMax);
      expect(1 <= clampMin && clampMin <= clampMax && clampMax <= 7, label).toBe(true);
      expect(p?.previewTargets.length, label).toBe(9);
    }
  }

  // D-0041 §6: before onboarding the next check-in is onboardDate + 14.
  const k = dayDiff(onboard, D) < 0 ? 1 : Math.floor(dayDiff(onboard, D) / 14) + 1;
  expect(r.nextCheckinDate, label).toBe(addDays(onboard, 14 * k));
  expect(evaluateCheckin(sessions, profile, checkins, now, TZ), label).toStrictEqual(r);
}

const NOWS = [
  "2026-09-27T12:00:00+02:00",
  "2026-10-11T12:00:00+02:00",
  "2026-10-25T12:00:00+01:00",
  "2026-11-08T12:00:00+01:00",
];
const RHYTHMS: Array<[number, number]> = [
  [1, 1],
  [1, 2],
  [3, 4],
  [5, 5],
  [6, 7],
  [7, 7],
];

describe("rule 9 invariants (AC25)", () => {
  it("rule-9 (AC25) invariants over the simulated histories, every now and rhythm", () => {
    const inputs: Array<[string, CheckinSession[]]> = [
      ...(Object.keys(SIMULATED_HISTORIES) as Name[]).map((n): [string, CheckinSession[]] => [
        n,
        sessionsOf(SIMULATED_HISTORIES[n]),
      ]),
      ["empty", []],
    ];
    for (const [name, sessions] of inputs) {
      for (const now of NOWS) {
        for (const [rhythmMin, rhythmMax] of RHYTHMS) {
          const profile = checkinProfile({ rhythmMin, rhythmMax });
          expectInvariants(
            sessions,
            profile,
            NO_CHECKINS,
            now,
            `${name} ${now} ${rhythmMin}–${rhythmMax}`,
          );
        }
      }
    }
  });

  it("rule-9 property: seeded random sessions, check-ins and dates keep the invariants and ignore input order", () => {
    for (let seed = 1; seed <= 150; seed++) {
      const rand = mulberry32(seed);
      const history = randomHistory(rand);
      const sessions = checkinSessions(sessionRefsOf(history), history, LIBRARY);
      const rhythmMin = 1 + Math.floor(rand() * 7);
      const rhythmMax = rhythmMin + Math.floor(rand() * (8 - rhythmMin));
      const offsetDays = Math.floor(rand() * 40) - 5;
      const onboardedAt = `${addDays(ONBOARD_DATE, offsetDays)}T10:00:00+02:00`;
      const profile = checkinProfile({
        rhythmMin,
        rhythmMax,
        onboardedAt,
        planUpdatedAt: rand() < 0.5 ? onboardedAt : "2026-09-10T08:00:00Z",
      });
      const checkins: CheckinAnswer[] = Array.from({ length: Math.floor(rand() * 3) }, () =>
        rand() < 0.3
          ? { answeredAt: null }
          : {
              answeredAt: new Date(
                Date.UTC(2026, 7, 1) + Math.floor(rand() * 90 * 86_400_000),
              ).toISOString(),
            },
      );
      const now = new Date(
        Date.UTC(2026, 7, 1) + Math.floor(rand() * 110 * 86_400_000),
      ).toISOString();
      const label = `seed ${seed}`;
      expectInvariants(sessions, profile, checkins, now, label);
      const r = evaluateCheckin(sessions, profile, checkins, now, TZ);
      for (const p of r.periods) expect(p.completed, label).toBeGreaterThanOrEqual(0);
      expect(
        evaluateCheckin([...sessions].reverse(), profile, [...checkins].reverse(), now, TZ),
        label,
      ).toStrictEqual(r);
    }
  });
});
