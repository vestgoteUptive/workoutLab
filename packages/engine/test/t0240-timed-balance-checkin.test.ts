// T-0240 UF-10.1 UF-10.2 UF-11.1: a timed hard set (plank, `durationS` instead of `reps`) counts
// in balance() (rule 11) and in the check-in (rule 9, D-0041 §3) exactly like a rep set (rule 2,
// D-0034 §4, D-0092 §1). Every expected value is an inline literal derived by hand from
// `timedCoreHistory`: 4 sessions at 18:00 local on 09-20/22/24/26, each 3 × bench-press,
// 3 × barbell-row, 3 × plank. Window 2026-09-14 … 2026-09-27 (F-tz).
import { describe, expect, it } from "vitest";
import {
  balance,
  checkinSessions,
  evaluateCheckin,
  type BalanceResult,
  type HistorySet,
} from "../src/index.js";
import { NO_CHECKINS, checkinProfile, sessionRefsOf } from "./fixtures/checkin.js";
import { F_TARGETS, LIBRARY, NOW, TZ } from "./fixtures/common.js";
import { timedCoreHistory } from "./fixtures/histories-timed.js";
import { areaOf } from "./helpers.js";

/** Every plank row as a `dead-bug` rep row (same clientId scheme, session, instant, warm-up flag). */
function plankToDeadBug(history: readonly HistorySet[]): HistorySet[] {
  return history.map((row) =>
    row.exerciseId !== "plank"
      ? row
      : {
          ...row,
          clientId: row.clientId.replace(/^plank@/, "dead-bug@"),
          exerciseId: "dead-bug",
          reps: 10,
          weightKg: null,
          durationS: null,
        },
  );
}

/** Every plank row with `isWarmup: true`. */
function plankAsWarmup(history: readonly HistorySet[]): HistorySet[] {
  return history.map((row) => (row.exerciseId === "plank" ? { ...row, isWarmup: true } : row));
}

const PLANK_ONLY: HistorySet[] = timedCoreHistory.filter((r) => r.exerciseId === "plank");

/** Core's contributor `dead-bug` renamed to `plank`, everything else untouched. */
function deadBugAsPlank(r: BalanceResult): BalanceResult {
  return {
    ...r,
    areas: r.areas.map((a) => ({
      ...a,
      contributors: a.contributors.map((c) =>
        c.exerciseId === "dead-bug" ? { ...c, exerciseId: "plank" } : c,
      ),
    })),
  };
}

const CHECKIN_PROFILE = checkinProfile({ rhythmMin: 2, rhythmMax: 3 });

function checkinOf(history: readonly HistorySet[]) {
  return evaluateCheckin(
    checkinSessions(sessionRefsOf(history), history, LIBRARY),
    CHECKIN_PROFILE,
    NO_CHECKINS,
    NOW,
    TZ,
  );
}

describe("T-0240 timed hard sets in balance (rule 11)", () => {
  it("T-0240 AC1 rule-11 balance counts the 12 plank sets for core, and chest keeps its rep rows", () => {
    expect(timedCoreHistory).toHaveLength(36);
    const r = balance(timedCoreHistory, F_TARGETS, LIBRARY, NOW, TZ);
    expect(r.windowStart).toBe("2026-09-14");
    expect(r.windowEnd).toBe("2026-09-27");
    const core = areaOf(r, "core");
    expect(core.load).toBe(12);
    expect(core.target).toBe(12);
    expect(core.deficit).toBe(0);
    expect(core.coverageStep).toBe(4);
    expect(core.days).toEqual([0, 0, 0, 0, 0, 0, 3, 0, 3, 0, 3, 0, 3, 0]);
    expect(core.lastTrainedDate).toBe("2026-09-26");
    expect(core.contributors).toEqual([
      { exerciseId: "plank", weightedSets: 12, lastDate: "2026-09-26" },
    ]);
    const chest = areaOf(r, "chest");
    expect(chest.load).toBe(12);
    expect(chest.deficit).toBe(0.4);
  });

  it("T-0240 AC2 rule-2 a plank set fills balance exactly like a dead-bug rep set", () => {
    const timed = balance(timedCoreHistory, F_TARGETS, LIBRARY, NOW, TZ);
    const reps = balance(plankToDeadBug(timedCoreHistory), F_TARGETS, LIBRARY, NOW, TZ);
    // The rewrite really swapped the rows: dead-bug is core's only contributor on the rep side.
    expect(areaOf(reps, "core").contributors.map((c) => c.exerciseId)).toEqual(["dead-bug"]);
    expect(timed.areas).toHaveLength(9);
    expect(deadBugAsPlank(reps)).toStrictEqual(timed);
  });

  it("T-0240 AC3 rule-11 plank rows marked isWarmup add nothing to core; chest is unchanged", () => {
    const r = balance(plankAsWarmup(timedCoreHistory), F_TARGETS, LIBRARY, NOW, TZ);
    const core = areaOf(r, "core");
    expect(core.load).toBe(0);
    expect(core.coverageStep).toBe(0);
    expect(core.contributors).toEqual([]);
    expect(areaOf(r, "chest").load).toBe(12);
  });
});

describe("T-0240 timed hard sets in the check-in (rule 9)", () => {
  it("T-0240 AC4 rule-9 checkinSessions counts 9 hard sets per session, 3 when plank-only", () => {
    const all = checkinSessions(sessionRefsOf(timedCoreHistory), timedCoreHistory, LIBRARY);
    expect(all.map((s) => [s.startedAt, s.hardSetCount])).toEqual([
      ["2026-09-20T18:00:00+02:00", 9],
      ["2026-09-22T18:00:00+02:00", 9],
      ["2026-09-24T18:00:00+02:00", 9],
      ["2026-09-26T18:00:00+02:00", 9],
    ]);
    const plank = checkinSessions(sessionRefsOf(PLANK_ONLY), PLANK_ONLY, LIBRARY);
    expect(plank.map((s) => [s.startedAt, s.hardSetCount])).toEqual([
      ["2026-09-20T18:00:00+02:00", 3],
      ["2026-09-22T18:00:00+02:00", 3],
      ["2026-09-24T18:00:00+02:00", 3],
      ["2026-09-26T18:00:00+02:00", 3],
    ]);
  });

  it("T-0240 AC5 rule-9 plank-only sessions complete the period on plan; as warm-ups they don't", () => {
    expect(PLANK_ONLY).toHaveLength(12);
    expect(checkinOf(PLANK_ONLY)).toStrictEqual({
      periods: [
        { index: 3, start: "2026-09-13", end: "2026-09-26", completed: 4, status: "on_plan" },
      ],
      proposal: null,
      nextCheckinDate: "2026-10-11",
    });
    const warm = checkinOf(plankAsWarmup(PLANK_ONLY));
    expect(warm.periods).toEqual([
      { index: 3, start: "2026-09-13", end: "2026-09-26", completed: 0, status: "under" },
    ]);
    expect(warm.proposal).not.toBeNull();
    expect(warm.proposal?.direction).toBe("down");
  });
});
