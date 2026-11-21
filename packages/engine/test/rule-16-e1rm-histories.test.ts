// T-0961 UF-06.2 AC7, AC10, AC5: rule 16 on the simulated histories (D-0258 §13), R16-E11, R16-E13,
// and display-only: suggest output is unchanged by estimatedOneRepMax.
import { describe, expect, it } from "vitest";
import {
  estimatedOneRepMax,
  localDate,
  normalizeHistory,
  suggest,
  type HistorySet,
} from "../src/index.js";
import {
  F_INPUT,
  F_PROFILE,
  F_TARGETS,
  LIBRARY,
  NOW,
  TZ,
  deepFreeze,
  setsAt,
} from "./fixtures/common.js";
import { mk, round3 } from "./fixtures/e1rm.js";
import { SIMULATED_HISTORIES, balancedHistory, offlineQueue } from "./fixtures/histories.js";
import { allChestNoLegsHistory } from "./fixtures/histories.js";

const BENCH = [60, 62.5, 62.5, 60, 65, 65, 67.5];
const SQUAT_REPS = [5, 5, 6, 6, 8, 7, 8];
const DATES = ["09-15", "09-17", "09-19", "09-21", "09-23", "09-25", "09-27"].map(
  (d) => `2026-${d}`,
);
/** The R15-E12 history: balanced with progressive loads. */
const progressive: HistorySet[] = balancedHistory.map((s) => {
  const k = DATES.indexOf(s.completedAt.slice(0, 10));
  if (s.exerciseId === "bench-press") return { ...s, weightKg: BENCH[k] ?? null };
  if (s.exerciseId === "back-squat") return { ...s, weightKg: 100, reps: SQUAT_REPS[k] ?? null };
  if (s.exerciseId === "dead-bug") return { ...s, weightKg: 0, reps: 10 };
  return s;
});

const pts = (h: readonly HistorySet[], id: string) =>
  estimatedOneRepMax(deepFreeze(structuredClone(h)), LIBRARY, id);
const e1s = (h: readonly HistorySet[], id: string) => pts(h, id).map((p) => round3(p.e1rm));

/** One session at `at`: sets of `ex` with the given [weight, reps] pairs, one minute apart. */
function session(ex: string, at: string, sets: Array<[number, number]>, tag = ""): HistorySet[] {
  const base = Date.parse(at);
  return sets.flatMap(([w, r], i) => {
    const t = new Date(base + i * 60_000).toISOString();
    return setsAt(1, ex, t, { tag: `${tag}${i}-` }).map((s) => ({
      ...s,
      sessionId: `s@${at}${tag}`,
      weightKg: w,
      reps: r,
    }));
  });
}

describe("rule-16 R15-E12 series (AC7)", () => {
  it("rule-16 R16-E11 (AC7) bench-press gives 7 points with exact values", () => {
    const p = pts(progressive, "bench-press");
    expect(p).toHaveLength(7);
    expect(p.map((x) => x.e1rm)).toEqual(BENCH.map((w) => (w * 38) / 30));
    expect(p.map((x) => round3(x.e1rm))).toEqual([76, 79.167, 79.167, 76, 82.333, 82.333, 85.5]);
    expect(p.map((x) => x.completedAt.slice(0, 10))).toEqual(DATES);
    expect(p.every((x) => x.reps === 8)).toBe(true);
  });
  it("rule-16 R16-E11 (AC7) back-squat gives 7 points with exact values", () => {
    const p = pts(progressive, "back-squat");
    expect(p).toHaveLength(7);
    expect(p.map((x) => x.e1rm)).toEqual(SQUAT_REPS.map((r) => (100 * (30 + r)) / 30));
    expect(p.map((x) => round3(x.e1rm))).toEqual([
      116.667, 116.667, 120, 120, 126.667, 123.333, 126.667,
    ]);
  });
  it("rule-16 R16-E11 (AC7) dead-bug (bodyweight) gives []", () => {
    expect(pts(progressive, "dead-bug")).toEqual([]);
  });
});

describe("rule-16 simulated histories (AC10)", () => {
  it("rule-16 (AC10) 1 steady linear gain: back-squat 100 x 8 +2.5 kg weekly for 8 weeks is strictly increasing", () => {
    const h = Array.from({ length: 8 }, (_, i) =>
      session(
        "back-squat",
        new Date(Date.parse("2026-07-06T08:00:00Z") + i * 7 * 86_400_000).toISOString(),
        [[100 + 2.5 * i, 8]],
      ),
    ).flat();
    const p = pts(h, "back-squat");
    expect(p).toHaveLength(8);
    expect(p.map((x) => x.e1rm)).toEqual(
      Array.from({ length: 8 }, (_, i) => ((100 + 2.5 * i) * 38) / 30),
    );
    for (let i = 1; i < p.length; i++) expect((p[i]?.e1rm ?? 0) > (p[i - 1]?.e1rm ?? 0)).toBe(true);
  });
  it("rule-16 (AC10) 2 plateau then deload: flat 80 x 8 for 4 weeks, then 70 x 8 shown as is", () => {
    const h = [80, 80, 80, 80, 70].flatMap((w, i) =>
      session(
        "bench-press",
        new Date(Date.parse("2026-08-03T16:00:00Z") + i * 7 * 86_400_000).toISOString(),
        [[w, 8]],
      ),
    );
    expect(e1s(h, "bench-press")).toEqual([101.333, 101.333, 101.333, 101.333, 88.667]);
  });
  it("rule-16 (AC10) 3 returning after 10 days off: a lower first point back, oldest first, no special handling", () => {
    const h = [
      ...session("back-squat", "2026-09-03T10:00:00+02:00", [[100, 8]]),
      ...session("back-squat", "2026-09-06T10:00:00+02:00", [[102.5, 8]]),
      ...session("back-squat", "2026-09-09T10:00:00+02:00", [[105, 8]]),
      ...session("back-squat", "2026-09-19T10:00:00+02:00", [[95, 8]]),
    ];
    const p = pts([...h].reverse(), "back-squat");
    expect(p.map((x) => round3(x.e1rm))).toEqual([126.667, 129.833, 133, 120.333]);
    expect((p[3]?.e1rm ?? 0) < (p[2]?.e1rm ?? 0)).toBe(true);
    expect(p.map((x) => x.completedAt)).toEqual([...p.map((x) => x.completedAt)].sort());
  });
  it("rule-16 (AC10) 4 mixed rep ranges: 100 x 5, 90 x 10 and 60 x 15 sessions; the 15-rep session gives no point; warm-ups and ties ignored", () => {
    const h = [
      ...session("back-squat", "2026-09-01T10:00:00+02:00", [[100, 5]], "a"),
      ...session("back-squat", "2026-09-03T10:00:00+02:00", [[90, 10]], "b"),
      ...session("back-squat", "2026-09-05T10:00:00+02:00", [[60, 15]], "c"),
      // a warm-up and an equal-score tie in the first session
      mk("back-squat", "s@2026-09-01T10:00:00+02:00a", "2026-09-01T09:50:00+02:00", 140, 1, {
        isWarmup: true,
      }),
      mk("back-squat", "s@2026-09-01T10:00:00+02:00a", "2026-09-01T10:30:00+02:00", 100, 5, {
        clientId: "tie",
      }),
    ];
    const p = pts(h, "back-squat");
    expect(p.map((x) => [x.weightKg, x.reps, round3(x.e1rm)])).toEqual([
      [100, 5, 116.667],
      [90, 10, 120],
    ]);
    // the tie goes to the earlier set, not "tie"
    expect(p[0]?.clientId).not.toBe("tie");
  });
  it("rule-16 R16-E13 (AC10) 5 same-day sessions both kept; a midnight session is dated by its best set", () => {
    const h = [
      ...session("bench-press", "2026-09-20T10:00:00+02:00", [[80, 8]], "am"),
      ...session("bench-press", "2026-09-20T18:00:00+02:00", [[82.5, 8]], "pm"),
      // one session across midnight (local): a set at 23:50 and a better one at 00:10 next day
      mk("bench-press", "night", "2026-09-20T23:50:00+02:00", 70, 8),
      mk("bench-press", "night", "2026-09-21T00:10:00+02:00", 85, 8),
    ];
    const p = pts(h, "bench-press");
    expect(p).toHaveLength(3);
    expect(p.map((x) => localDate(x.completedAt, TZ))).toEqual([
      "2026-09-20",
      "2026-09-20",
      "2026-09-21",
    ]);
    expect(p.map((x) => x.sessionId)).toEqual([
      "s@2026-09-20T10:00:00+02:00am",
      "s@2026-09-20T18:00:00+02:00pm",
      "night",
    ]);
    expect(p[2]?.weightKg).toBe(85);
  });
  it("rule-16 R16-E12 (AC9, AC10) 6 offline-merged: the queue's rows give the clean history's points", () => {
    const merged = SIMULATED_HISTORIES.offlineMerged;
    const deleted = new Set(
      offlineQueue.filter((s) => s.deletedAt !== null).map((s) => s.clientId),
    );
    const clean = [
      ...allChestNoLegsHistory.filter((s) => !deleted.has(s.clientId)),
      ...offlineQueue.filter(
        (s) => s.deletedAt === null && s.pending === true && s.exerciseId === "romanian-deadlift",
      ),
    ];
    for (const id of ["bench-press", "db-bench-press", "romanian-deadlift", "push-up"]) {
      expect(pts(merged, id)).toEqual(pts(clean, id));
    }
    expect(pts(merged, "bench-press")).toHaveLength(6);
    expect(pts(merged, "romanian-deadlift")).toHaveLength(1);
    expect(normalizeHistory(merged).length).toBe(clean.length);
  });
});

describe("rule-16 is display-only (AC5)", () => {
  it.each([...Object.entries(SIMULATED_HISTORIES), ["balanced-progressive", progressive] as const])(
    "rule-16 (AC5) suggest on %s is byte-identical before and after estimatedOneRepMax runs",
    (_n, h) => {
      const history = deepFreeze(structuredClone(h));
      const before = JSON.stringify(
        suggest(history, F_TARGETS, F_PROFILE, LIBRARY, F_INPUT, NOW, TZ),
      );
      for (const ex of LIBRARY) estimatedOneRepMax(history, LIBRARY, ex.id);
      const after = JSON.stringify(
        suggest(history, F_TARGETS, F_PROFILE, LIBRARY, F_INPUT, NOW, TZ),
      );
      expect(after).toBe(before);
      expect(before.length).toBeGreaterThan(100);
    },
  );
});
