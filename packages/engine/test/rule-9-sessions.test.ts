// T-0202: checkinSessions (D-0041 §3) and rule 9 session counting. AC10, AC23.
import { describe, expect, it } from "vitest";
import { checkinSessions, evaluateCheckin, type HistorySet } from "@workoutlab/engine";
import {
  CHECKIN_TZ as TZ,
  DOWN_2_3,
  F_CHECKIN,
  NO_CHECKINS,
  on,
  per,
  sessionsFor,
} from "./fixtures/checkin.js";
import { LIBRARY, setsAt } from "./fixtures/common.js";

function inSession(sessionId: string, rows: HistorySet[]): HistorySet[] {
  return rows.map((r) => ({ ...r, sessionId }));
}

describe("rule 9 session counting", () => {
  it("R9-E10 UF-11 AC13 warm-ups don't count; a session across midnight counts once on its start date (AC10)", () => {
    const refs = [
      { id: "wu", startedAt: "2026-09-15T10:00:00+02:00" },
      { id: "mid", startedAt: "2026-09-26T23:40:00+02:00" },
      { id: "a", startedAt: "2026-09-20T09:00:00+02:00" },
      { id: "b", startedAt: "2026-09-20T18:00:00+02:00" },
    ];
    const history: HistorySet[] = [
      ...inSession("wu", [
        ...setsAt(3, "back-squat", "2026-09-15T10:00:00+02:00", { isWarmup: true }),
        ...setsAt(2, "wu-bodyweight-squat", "2026-09-15T10:05:00+02:00"),
      ]),
      ...inSession(
        "mid",
        ["23:45", "23:55"]
          .map((t) => `2026-09-26T${t}:00+02:00`)
          .concat(["00:10", "00:25"].map((t) => `2026-09-27T${t}:00+02:00`))
          .flatMap((at) => setsAt(1, "back-squat", at)),
      ),
      ...inSession("a", setsAt(3, "bench-press", "2026-09-20T09:10:00+02:00")),
      ...inSession("b", setsAt(2, "leg-curl", "2026-09-20T18:10:00+02:00")),
    ];

    const p3 = checkinSessions(refs, history, LIBRARY);
    expect(p3.map((s) => s.hardSetCount)).toEqual([0, 4, 3, 2]);

    const r = evaluateCheckin(
      [...sessionsFor({ 2: 7 }), ...p3],
      F_CHECKIN,
      NO_CHECKINS,
      on("2026-09-27"),
      TZ,
    );
    // One period (D-0061 §2, D-0094): P3 = 3 is under, so it proposes on its own (T-0215 AC10).
    expect(r.periods).toStrictEqual([per(3, 3, "under")]);
    expect(r.proposal).toStrictEqual(DOWN_2_3);

    const shiftedRefs = refs.map((s) =>
      s.id === "mid" ? { ...s, startedAt: "2026-09-26T22:30:00Z" } : s,
    ); // 00:30 local on 09-27, so it lands in P4
    const shifted = evaluateCheckin(
      [...sessionsFor({ 2: 7 }), ...checkinSessions(shiftedRefs, history, LIBRARY)],
      F_CHECKIN,
      NO_CHECKINS,
      on("2026-09-27"),
      TZ,
    );
    expect(shifted.periods).toStrictEqual([per(3, 2, "under")]);
  });

  it("rule-9 (AC23) checkinSessions normalises offline-merged history and ignores orphan sets (D-0041 §3)", () => {
    const refs = [
      { id: "s1", startedAt: "2026-09-20T10:00:00+02:00" },
      { id: "s2", startedAt: "2026-09-21T10:00:00+02:00" },
      { id: "s3", startedAt: "2026-09-22T10:00:00+02:00" },
      { id: "s4", startedAt: "2026-09-23T10:00:00+02:00" },
    ];
    const bench = inSession("s2", setsAt(1, "bench-press", "2026-09-21T10:05:00+02:00"));
    const legCurl = inSession("s3", setsAt(1, "leg-curl", "2026-09-22T10:05:00+02:00"));
    const history: HistorySet[] = [
      ...inSession("s1", setsAt(2, "back-squat", "2026-09-20T10:05:00+02:00")),
      ...inSession("s1", setsAt(1, "not-in-library", "2026-09-20T10:20:00+02:00")),
      ...bench,
      ...legCurl,
      ...inSession("orphan", setsAt(3, "back-squat", "2026-09-22T12:00:00+02:00")),
      // Queue: a tombstone for s2's bench-press set, and an identical replay of s3's leg-curl set.
      ...bench.map((r) => ({
        ...r,
        pending: true,
        editedAt: "2026-09-21T20:00:00+02:00",
        deletedAt: "2026-09-21T20:00:00+02:00",
      })),
      ...legCurl.map((r) => ({ ...r, pending: true })),
    ];
    const expected = [
      { id: "s1", startedAt: refs[0]?.startedAt, hardSetCount: 2 },
      { id: "s2", startedAt: refs[1]?.startedAt, hardSetCount: 0 },
      { id: "s3", startedAt: refs[2]?.startedAt, hardSetCount: 1 },
      { id: "s4", startedAt: refs[3]?.startedAt, hardSetCount: 0 },
    ];
    expect(checkinSessions(refs, history, LIBRARY)).toStrictEqual(expected);
    expect(checkinSessions(refs, [...history].reverse(), LIBRARY)).toStrictEqual(expected);
  });
});
