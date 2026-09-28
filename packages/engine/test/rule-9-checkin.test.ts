// T-0202: rule 9 evaluateCheckin (UF-11.1, UF-11.2; D-0018, D-0027, D-0041). AC1–AC9, AC11–AC22.
import { describe, expect, it } from "vitest";
import { evaluateCheckin, type CheckinAnswer, type CheckinSession } from "@workoutlab/engine";
import {
  AC1_RESULT,
  AC1_SESSIONS,
  CHECKIN_TZ as TZ,
  DOWN_2_3,
  NO_CHECKINS,
  T,
  checkinProfile,
  on,
  per,
  periodSessions,
  sessionsFor,
} from "./fixtures/checkin.js";
import { deepFreeze } from "./fixtures/common.js";

const SEP_27 = on("2026-09-27");

function run(
  sessions: readonly CheckinSession[],
  now: string,
  opts: { profile?: Parameters<typeof checkinProfile>[0]; checkins?: CheckinAnswer[] } = {},
) {
  return evaluateCheckin(
    sessions,
    checkinProfile(opts.profile),
    opts.checkins ?? NO_CHECKINS,
    now,
    TZ,
  );
}

function statuses(r: ReturnType<typeof run>): string[] {
  return r.periods.map((p) => p.status);
}

describe("rule 9 examples (R9-E1…R9-E13)", () => {
  it("R9-E1 UF-11 AC1 under twice → propose one session fewer (AC1)", () => {
    const r = run(AC1_SESSIONS, SEP_27);
    expect(r).toStrictEqual(AC1_RESULT);
    expect(Object.keys(r).sort()).toEqual(["nextCheckinDate", "periods", "proposal"]);
  });

  it("R9-E2 UF-11 AC2 one low period after 10 days off → no proposal (AC2)", () => {
    const r = run(sessionsFor({ 2: 7, 3: 2 }), SEP_27);
    expect(r.periods).toStrictEqual([per(2, 7, "on_plan"), per(3, 2, "under")]);
    expect(r.proposal).toBeNull();

    const later = run(sessionsFor({ 2: 7, 3: 2, 4: 3 }), on("2026-10-11"));
    expect(later.periods).toStrictEqual([per(3, 2, "under"), per(4, 3, "under")]);
    expect(later.proposal).toStrictEqual(DOWN_2_3);
    expect(later.nextCheckinDate).toBe("2026-10-25");
  });

  it("R9-E3 UF-11 AC3 threshold: 5 is on plan, 4 is under at rhythm 3–4 (AC3)", () => {
    const five = run(sessionsFor({ 2: 5, 3: 5 }), SEP_27);
    expect(statuses(five)).toEqual(["on_plan", "on_plan"]);
    expect(five.proposal).toBeNull();

    const four = run(sessionsFor({ 2: 4, 3: 4 }), SEP_27);
    expect(statuses(four)).toEqual(["under", "under"]);
    expect(four.proposal).toStrictEqual(DOWN_2_3);
  });

  it("R9-E4 UF-11 AC4 over twice → propose one session more (AC4)", () => {
    const r = run(sessionsFor({ 2: 9, 3: 10 }), SEP_27);
    expect(statuses(r)).toEqual(["over", "over"]);
    expect(r.proposal).toStrictEqual({
      direction: "up",
      rhythmMin: 4,
      rhythmMax: 5,
      previewTargets: T["4-5"],
    });

    const mixed = run(sessionsFor({ 2: 9, 3: 8 }), SEP_27);
    expect(statuses(mixed)).toEqual(["over", "on_plan"]);
    expect(mixed.proposal).toBeNull();
  });

  it("R9-E5 UF-11 AC5 under then over → no proposal (AC5)", () => {
    const r = run(sessionsFor({ 2: 3, 3: 9 }), SEP_27);
    expect(statuses(r)).toEqual(["under", "over"]);
    expect(r.proposal).toBeNull();
  });

  it("R9-E6 UF-11 AC7 after Accept only post-change periods count (AC6)", () => {
    const r = run(sessionsFor({ 2: 4, 3: 3, 4: 3 }), on("2026-10-11"), {
      profile: { rhythmMin: 2, rhythmMax: 3, planUpdatedAt: "2026-09-27T12:05:00+02:00" },
      checkins: [{ answeredAt: "2026-09-27T12:05:00+02:00" }],
    });
    expect(r.periods).toStrictEqual([per(4, 3, "on_plan")]); // 30 < 28 is false
    expect(r.proposal).toBeNull();
    expect(r.nextCheckinDate).toBe("2026-10-25");
  });

  it("R9-E7 UF-11 AC8 Keep resets the streak (AC7)", () => {
    const checkins = [{ answeredAt: "2026-09-27T12:05:00+02:00" }];
    const right = run(AC1_SESSIONS, "2026-09-27T12:10:00+02:00", { checkins });
    expect(right.periods).toStrictEqual([]);
    expect(right.proposal).toBeNull();

    const p4 = run(sessionsFor({ 2: 4, 3: 3, 4: 3 }), on("2026-10-11"), { checkins });
    expect(p4.periods).toStrictEqual([per(4, 3, "under")]);
    expect(p4.proposal).toBeNull();

    const p5 = run(sessionsFor({ 2: 4, 3: 3, 4: 3, 5: 2 }), on("2026-10-25"), { checkins });
    expect(p5.periods).toStrictEqual([per(4, 3, "under"), per(5, 2, "under")]);
    expect(p5.proposal).toStrictEqual(DOWN_2_3);
    expect(p5.nextCheckinDate).toBe("2026-11-08");
  });

  it("R9-E8 UF-11 AC11 zero history for a new user (AC8)", () => {
    const profile = {
      onboardedAt: "2026-09-20T10:00:00+02:00",
      planUpdatedAt: "2026-09-20T10:00:00+02:00",
    };
    const first = run([], SEP_27, { profile });
    expect(first).toStrictEqual({ periods: [], proposal: null, nextCheckinDate: "2026-10-04" });

    const later = run([], on("2026-10-18"), { profile });
    expect(later.periods).toStrictEqual([
      { index: 0, start: "2026-09-20", end: "2026-10-03", completed: 0, status: "under" },
      { index: 1, start: "2026-10-04", end: "2026-10-17", completed: 0, status: "under" },
    ]);
    expect(later.proposal).toStrictEqual(DOWN_2_3);
    expect(later.nextCheckinDate).toBe("2026-11-01");
  });

  it("R9-E9 UF-11 AC12 floor: 1–1 never goes lower, 1–2 goes to 1–1 (AC9)", () => {
    const sessions = sessionsFor({ 2: 0, 3: 0 });
    const floor = run(sessions, SEP_27, { profile: { rhythmMin: 1, rhythmMax: 1 } });
    expect(statuses(floor)).toEqual(["under", "under"]); // 0 < 1.4
    expect(floor.proposal).toBeNull();

    const r = run(sessions, SEP_27, { profile: { rhythmMin: 1, rhythmMax: 2 } });
    expect(r.proposal).toStrictEqual({
      direction: "down",
      rhythmMin: 1,
      rhythmMax: 1,
      previewTargets: T["1-1"],
    });
  });

  it("R9-E11 UF-11 AC14 long absence gives one proposal from the last two periods (AC11)", () => {
    const r = run(sessionsFor({ 2: 2, 3: 0, 4: 0 }), on("2026-10-11"));
    expect(r.periods).toStrictEqual([per(3, 0, "under"), per(4, 0, "under")]);
    expect(Array.isArray(r.proposal)).toBe(false);
    expect(r.proposal).toStrictEqual(DOWN_2_3);
  });

  it("R9-E12 mid-period Keep: a period ending after the Keep stays eligible (AC12)", () => {
    const sessions = sessionsFor({ 2: 4, 3: 3, 4: 3, 5: 2 });
    const checkins = [{ answeredAt: "2026-09-30T19:00:00+02:00" }];
    const r = run(sessions, "2026-10-25T12:00:00+01:00", { checkins });
    expect(r.periods).toStrictEqual([per(4, 3, "under"), per(5, 2, "under")]);
    expect(r.proposal).toStrictEqual(DOWN_2_3);

    const earlier = run(sessions, on("2026-10-11"), { checkins });
    expect(earlier.periods).toStrictEqual([per(4, 3, "under")]);
    expect(earlier.proposal).toBeNull();
  });

  it("R9-E13 editing the plan resets the streak (AC13)", () => {
    const edited = run(AC1_SESSIONS, SEP_27, {
      profile: { planUpdatedAt: "2026-09-20T10:00:00+02:00" },
    });
    expect(edited.periods).toStrictEqual([per(3, 3, "under")]);
    expect(edited.proposal).toBeNull();

    // P2's last day: end ≥ resetDate, so P2 is still eligible.
    const onLastDay = run(AC1_SESSIONS, SEP_27, {
      profile: { planUpdatedAt: "2026-09-12T10:00:00+02:00" },
    });
    expect(onLastDay).toStrictEqual(AC1_RESULT);
  });
});

describe("rule 9: other UF-11 spec ACs", () => {
  it("UF-11 AC17 ceiling: 6–7 goes to 7–7, 7–7 never goes higher (AC14)", () => {
    const sixteen = sessionsFor({ 2: 16, 3: 16 });
    const r = run(sixteen, SEP_27, { profile: { rhythmMin: 6, rhythmMax: 7 } });
    expect(statuses(r)).toEqual(["over", "over"]); // 160 > 154
    expect(r.periods.map((p) => p.completed)).toEqual([16, 16]);
    expect(r.proposal).toStrictEqual({
      direction: "up",
      rhythmMin: 7,
      rhythmMax: 7,
      previewTargets: T["7-7"],
    });

    const top = run(sixteen, SEP_27, { profile: { rhythmMin: 7, rhythmMax: 7 } });
    expect(statuses(top)).toEqual(["over", "over"]);
    expect(top.proposal).toBeNull();

    const fifteen = run(sessionsFor({ 2: 15, 3: 15 }), SEP_27, {
      profile: { rhythmMin: 6, rhythmMax: 7 },
    });
    expect(statuses(fifteen)).toEqual(["on_plan", "on_plan"]);
  });

  it("UF-11 AC6 UF-11 AC16 never silent and deterministic over frozen inputs (AC15)", () => {
    const sessions = deepFreeze(structuredClone(AC1_SESSIONS));
    const profile = deepFreeze(checkinProfile());
    const checkins: CheckinAnswer[] = deepFreeze([]);
    const copy = structuredClone({ sessions, profile, checkins });
    const results = ["2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01"].map(
      (d) => {
        let out: ReturnType<typeof evaluateCheckin> | undefined;
        expect(() => {
          out = evaluateCheckin(sessions, profile, checkins, on(d), TZ);
        }).not.toThrow();
        return out;
      },
    );
    expect({ sessions, profile, checkins }).toStrictEqual(copy);
    for (const r of results) {
      expect(r?.proposal).toStrictEqual(DOWN_2_3);
      expect(r?.periods).toStrictEqual(AC1_RESULT.periods);
    }
    expect(evaluateCheckin(sessions, profile, checkins, SEP_27, TZ)).toStrictEqual(
      evaluateCheckin(sessions, profile, checkins, SEP_27, TZ),
    );

    const answers: CheckinAnswer[] = [
      { answeredAt: null },
      { answeredAt: "2026-08-20T08:00:00+02:00" },
    ];
    expect(
      evaluateCheckin([...sessions].reverse(), profile, [...answers].reverse(), SEP_27, TZ),
    ).toStrictEqual(evaluateCheckin(sessions, profile, answers, SEP_27, TZ));
    expect(evaluateCheckin(sessions, profile, answers, SEP_27, TZ)).toStrictEqual(AC1_RESULT);
  });
});

describe("rule 9 build defaults (D-0041)", () => {
  it("rule-9 (AC16) exact integer thresholds at rhythm 5–5 (D-0041 §5)", () => {
    const profile = { rhythmMin: 5, rhythmMax: 5 };
    const seven = run(sessionsFor({ 2: 7, 3: 7 }), SEP_27, { profile });
    expect(statuses(seven)).toEqual(["on_plan", "on_plan"]); // 70 < 70 is false
    expect(seven.proposal).toBeNull();

    const six = run(sessionsFor({ 2: 6, 3: 6 }), SEP_27, { profile });
    expect(statuses(six)).toEqual(["under", "under"]);
    expect(six.proposal).toMatchObject({ direction: "down", rhythmMin: 4, rhythmMax: 4 });

    const eleven = run(sessionsFor({ 2: 11, 3: 11 }), SEP_27, { profile });
    expect(statuses(eleven)).toEqual(["on_plan", "on_plan"]); // 110 > 110 is false
    expect(eleven.proposal).toBeNull();

    const twelve = run(sessionsFor({ 2: 12, 3: 12 }), SEP_27, { profile });
    expect(statuses(twelve)).toEqual(["over", "over"]);
    expect(twelve.proposal).toMatchObject({ direction: "up", rhythmMin: 6, rhythmMax: 6 });
  });

  it("rule-9 (AC17) a period ends when its last local day is before D", () => {
    const before = run(AC1_SESSIONS, "2026-09-26T23:59:00+02:00");
    expect(before).toStrictEqual({
      periods: [per(1, 7, "on_plan"), per(2, 4, "under")],
      proposal: null,
      nextCheckinDate: "2026-09-27",
    });
    expect(run(AC1_SESSIONS, "2026-09-27T00:00:00+02:00")).toStrictEqual(AC1_RESULT);
    expect(run(AC1_SESSIONS, "2026-09-26T22:30:00Z")).toStrictEqual(AC1_RESULT); // 00:30 local
  });

  it("rule-9 (AC18) reset inputs: unanswered rows, answer-day boundary and latest answer (D-0041 §2, §6)", () => {
    expect(run(AC1_SESSIONS, SEP_27, { checkins: [{ answeredAt: null }] })).toStrictEqual(
      AC1_RESULT,
    );
    expect(
      run(AC1_SESSIONS, SEP_27, { checkins: [{ answeredAt: "2026-09-12T20:00:00+02:00" }] }),
    ).toStrictEqual(AC1_RESULT); // P2 ends 09-12 ≥ 09-12

    const c = run(AC1_SESSIONS, SEP_27, { checkins: [{ answeredAt: "2026-09-12T22:30:00Z" }] });
    expect(c.periods).toStrictEqual([per(3, 3, "under")]); // local 09-13
    expect(c.proposal).toBeNull();

    const d = [
      { answeredAt: "2026-09-13T08:00:00+02:00" },
      { answeredAt: "2026-08-20T08:00:00+02:00" },
    ];
    expect(run(AC1_SESSIONS, SEP_27, { checkins: d })).toStrictEqual(c);
    expect(run(AC1_SESSIONS, SEP_27, { checkins: [...d].reverse() })).toStrictEqual(c);
  });

  it("rule-9 (AC19) before onboarding and outside every period", () => {
    const profile = { onboardedAt: "2026-09-20T10:00:00+02:00" };
    const empty = { periods: [], proposal: null, nextCheckinDate: "2026-10-04" };
    expect(run([], "2026-09-19T12:00:00+02:00", { profile })).toStrictEqual(empty);
    expect(run([], "2026-09-20T08:00:00+02:00", { profile })).toStrictEqual(empty);

    const beforeOnboarding: CheckinSession[] = Array.from({ length: 9 }, (_, i) => ({
      id: `pre-${i}`,
      startedAt: `2026-08-01T${String(8 + i).padStart(2, "0")}:00:00+02:00`,
      hardSetCount: 3,
    }));
    const r = run([...sessionsFor({ 0: 0, 1: 0 }), ...beforeOnboarding], on("2026-08-30"));
    expect(r.periods).toStrictEqual([per(0, 0, "under"), per(1, 0, "under")]);
    expect(r.proposal).toStrictEqual(DOWN_2_3);

    const zeroSets = periodSessions(2, 9, 0);
    const z = run([...sessionsFor({ 2: 4 }), ...zeroSets], SEP_27);
    expect(z.periods.find((p) => p.index === 2)?.completed).toBe(4);
  });

  it("rule-9 (AC20) DST inside a period: periods are local calendar days", () => {
    const sessions: CheckinSession[] = [
      ...sessionsFor({ 5: 2 }),
      { id: "late-cest", startedAt: "2026-10-24T21:30:00Z", hardSetCount: 3 }, // 23:30 on 10-24
      { id: "after-midnight", startedAt: "2026-10-24T22:30:00Z", hardSetCount: 3 }, // 00:30 on 10-25
      { id: "cet", startedAt: "2026-11-01T10:00:00+01:00", hardSetCount: 3 },
    ];
    const r = run(sessions, on("2026-11-08"));
    expect(r.periods).toStrictEqual([
      { index: 5, start: "2026-10-11", end: "2026-10-24", completed: 3, status: "under" },
      { index: 6, start: "2026-10-25", end: "2026-11-07", completed: 2, status: "under" },
    ]);
    expect(r.proposal).toStrictEqual(DOWN_2_3);
    expect(r.nextCheckinDate).toBe("2026-11-22");
  });

  it("rule-9 (AC21) previewTargets apply priority areas in the fixed order", () => {
    const r = run(AC1_SESSIONS, SEP_27, {
      profile: { priorityAreas: ["back", "hamstrings", "arms"] },
    });
    expect(r.proposal?.previewTargets).toStrictEqual([
      { area: "chest", setsPer14d: 14 },
      { area: "back", setsPer14d: 18 },
      { area: "shoulders", setsPer14d: 11 },
      { area: "arms", setsPer14d: 11 },
      { area: "core", setsPer14d: 9 },
      { area: "glutes", setsPer14d: 14 },
      { area: "quads", setsPer14d: 14 },
      { area: "hamstrings", setsPer14d: 14 },
      { area: "calves", setsPer14d: 9 },
    ]);
    for (const t of r.proposal?.previewTargets ?? []) {
      expect(Object.keys(t).sort()).toEqual(["area", "setsPer14d"]);
    }
  });

  it("rule-9 (AC22) invalid inputs throw RangeError (D-0041 §6)", () => {
    const ok = AC1_SESSIONS;
    for (const hardSetCount of [-1, 1.5, Number.NaN]) {
      const bad = [...ok, { id: "bad", startedAt: SEP_27, hardSetCount }];
      expect(() => run(bad, SEP_27)).toThrow(RangeError);
    }
    const noOffset = [...ok, { id: "bad", startedAt: "2026-09-20T10:00:00", hardSetCount: 3 }];
    expect(() => run(noOffset, SEP_27)).toThrow(RangeError);
    expect(() => run(ok, "2026-09-27T12:00:00")).toThrow(RangeError);
    expect(() => run(ok, SEP_27, { checkins: [{ answeredAt: "2026-09-20" }] })).toThrow(RangeError);
    expect(() => run(ok, SEP_27, { profile: { rhythmMin: 0 } })).toThrow(RangeError);
    expect(() => run(ok, SEP_27, { profile: { rhythmMin: 5, rhythmMax: 4 } })).toThrow(RangeError);
    // Sanity: the valid baseline doesn't throw, so each case above fails on its own input.
    expect(run(ok, SEP_27).nextCheckinDate).toBe("2026-10-11");
  });
});
