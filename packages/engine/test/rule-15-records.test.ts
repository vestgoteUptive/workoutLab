// T-0635 UF-02.1: rule 15 records (D-0219 + owner amendment H-36, Epley e1RM). One case per R15 example.
import { describe, expect, it } from "vitest";
import { records, type HistorySet, type RecordSet } from "@workoutlab/engine";
import { LIBRARY, deepFreeze } from "./fixtures/common.js";

const S1 = "2026-09-01";
const S2 = "2026-09-04";
const S3 = "2026-09-14";

interface Opts {
  time?: string;
  tag?: string;
  warmup?: boolean;
  deleted?: boolean;
  durationS?: number;
  editedAt?: string;
}

let seq = 0;
/** One set on `date` (session `s@date`), clientId `ex@date#tag`. */
function set(
  ex: string,
  date: string,
  w: number | null,
  r: number | null,
  o: Opts = {},
): HistorySet {
  const at = `${date}T${o.time ?? "10:00"}:00+02:00`;
  return {
    clientId: `${ex}@${date}#${o.tag ?? String(seq++).padStart(3, "0")}`,
    sessionId: `s@${date}`,
    exerciseId: ex,
    isWarmup: o.warmup ?? false,
    completedAt: at,
    editedAt: o.editedAt ?? at,
    deletedAt: o.deleted ? at : null,
    reps: r,
    weightKg: w,
    durationS: o.durationS ?? null,
  };
}

const short = (rs: RecordSet[]) =>
  rs.map((r) => ({
    ex: r.exerciseId,
    session: r.sessionId,
    set: [r.weightKg, r.reps, r.durationS],
    prev: [r.previous.weightKg, r.previous.reps, r.previous.durationS],
  }));

const run = (h: HistorySet[]) => records(deepFreeze(h), LIBRARY);
const baseline = () => [set("back-squat", S1, 100, 8), set("back-squat", S1, 100, 8)];

describe("rule-15 records", () => {
  it("rule-15 R15-E1 (AC1) a higher e1RM in a later session is one record with previous 100 × 8", () => {
    expect(short(run([...baseline(), set("back-squat", S2, 102.5, 8)]))).toEqual([
      { ex: "back-squat", session: `s@${S2}`, set: [102.5, 8, null], prev: [100, 8, null] },
    ]);
  });

  it("rule-15 R15-E2 (AC1) same weight, more reps is a record", () => {
    expect(short(run([...baseline(), set("back-squat", S2, 100, 9)]))).toEqual([
      { ex: "back-squat", session: `s@${S2}`, set: [100, 9, null], prev: [100, 8, null] },
    ]);
  });

  it("rule-15 R15-E3 (AC1) equal is not a record", () => {
    expect(run([...baseline(), set("back-squat", S2, 100, 8)])).toEqual([]);
  });

  it("rule-15 R15-E4 (AC2) the first session is never a record", () => {
    const h = [80, 90, 100].map((w, i) => set("back-squat", S1, w, 8, { time: `10:0${i}` }));
    expect(run(h)).toEqual([]);
  });

  it("rule-15 R15-E5 (AC3) a tombstoned best set is skipped; the session's next best is the record", () => {
    const h = [
      ...baseline(),
      set("back-squat", S2, 105, 8, { deleted: true }),
      set("back-squat", S2, 100, 9, { time: "10:05" }),
    ];
    expect(short(run(h))).toEqual([
      { ex: "back-squat", session: `s@${S2}`, set: [100, 9, null], prev: [100, 8, null] },
    ]);
  });

  it("rule-15 R15-E6 (AC3) a warm-up 130 × 1 is ignored on the baseline side", () => {
    const h = [
      ...baseline(),
      set("back-squat", S1, 130, 1, { warmup: true }),
      set("back-squat", S2, 102.5, 8),
    ];
    expect(short(run(h))).toEqual([
      { ex: "back-squat", session: `s@${S2}`, set: [102.5, 8, null], prev: [100, 8, null] },
    ]);
  });

  it("rule-15 R15-E7 (AC4) timed: plank 60 s then 75 s is a record on durationS", () => {
    const h = [
      set("plank", S1, 0, null, { durationS: 60 }),
      set("plank", S2, 0, null, { durationS: 75 }),
    ];
    expect(short(run(h))).toEqual([
      { ex: "plank", session: `s@${S2}`, set: [0, null, 75], prev: [0, null, 60] },
    ]);
  });

  it("rule-15 R15-E7 (AC4) timed ranks by durationS only: more reps or weight on a shorter hold is no record", () => {
    const h = [
      set("plank", S1, 0, null, { durationS: 60 }),
      set("plank", S2, 20, 10, { durationS: 50 }),
    ];
    expect(run(h)).toEqual([]);
  });

  it("rule-15 R15-E8 (AC4) bodyweight: push-up 20 then 25 reps is a record", () => {
    const h = [set("push-up", S1, 0, 20), set("push-up", S2, 0, 25)];
    expect(short(run(h))).toEqual([
      { ex: "push-up", session: `s@${S2}`, set: [0, 25, null], prev: [0, 20, null] },
    ]);
  });

  it("rule-15 R15-E9 (AC4) a loaded 10 × 5 beats a bodyweight 0 × 12, and not the other way round", () => {
    expect(short(run([set("push-up", S1, 0, 12), set("push-up", S2, 10, 5)]))).toEqual([
      { ex: "push-up", session: `s@${S2}`, set: [10, 5, null], prev: [0, 12, null] },
    ]);
    expect(run([set("push-up", S1, 10, 5), set("push-up", S2, 0, 30)])).toEqual([]);
  });

  it("rule-15 R15-E10 (AC5) after a dip and a 10-day gap only the last session is a record, previous 100 × 8", () => {
    const h = [
      set("back-squat", S1, 100, 8),
      set("back-squat", S2, 95, 8),
      set("back-squat", S3, 102.5, 8),
    ];
    expect(short(run(h))).toEqual([
      { ex: "back-squat", session: `s@${S3}`, set: [102.5, 8, null], prev: [100, 8, null] },
    ]);
  });

  it("rule-15 R15-E13 (H-36) heavier but a lower e1RM is not a record", () => {
    expect(run([set("back-squat", S1, 100, 8), set("back-squat", S2, 105, 5)])).toEqual([]);
  });

  it("rule-15 R15-E14 (H-36) 80 × 10 (e1RM 106.7) beats an earlier 90 × 3 (e1RM 99)", () => {
    expect(short(run([set("back-squat", S1, 90, 3), set("back-squat", S2, 80, 10)]))).toEqual([
      { ex: "back-squat", session: `s@${S2}`, set: [80, 10, null], prev: [90, 3, null] },
    ]);
  });

  it("rule-15 R15-E15 (H-36) equal e1RM (100 × 6 vs 90 × 10, both 120) is a tie, not a record", () => {
    expect(run([set("back-squat", S1, 100, 6), set("back-squat", S2, 90, 10)])).toEqual([]);
  });

  it("rule-15 R15-E16 (AC6) one record per session and exercise: the highest e1RM, not the heaviest", () => {
    const h = [
      set("back-squat", S1, 100, 8),
      set("back-squat", S2, 110, 5),
      set("back-squat", S2, 102.5, 8, { time: "10:05" }),
    ];
    expect(short(run(h))).toEqual([
      { ex: "back-squat", session: `s@${S2}`, set: [102.5, 8, null], prev: [100, 8, null] },
    ]);
  });

  it("rule-15 R15-E16 (AC6) ties inside a session go to the earlier completedAt, then the smaller clientId", () => {
    const later = set("back-squat", S2, 102.5, 8, { time: "10:05", tag: "a" });
    const earlier = set("back-squat", S2, 102.5, 8, { time: "10:00", tag: "z" });
    expect(run([set("back-squat", S1, 100, 8), later, earlier]).map((r) => r.clientId)).toEqual([
      earlier.clientId,
    ]);
    const b = set("back-squat", S2, 102.5, 8, { tag: "b" });
    const a = set("back-squat", S2, 102.5, 8, { tag: "a" });
    expect(run([set("back-squat", S1, 100, 8), b, a]).map((r) => r.clientId)).toEqual([a.clientId]);
  });

  it("rule-15 (AC2) a set in another session at the same completedAt is not an earlier baseline", () => {
    const a = set("back-squat", S1, 100, 8);
    const b: HistorySet = { ...set("back-squat", S1, 102.5, 8), sessionId: "s@other" };
    expect(run([a, b])).toEqual([]);
  });

  it("rule-15 R15-E17 (AC7) unknown and warm-up-move exercises never appear in the output or the baseline", () => {
    const unknown = [set("mystery-lift", S1, 50, 8), set("mystery-lift", S2, 60, 8)];
    const wu = [set("wu-cat-cow", S1, 0, 5), set("wu-cat-cow", S2, 0, 10)];
    expect(run([...unknown, ...wu])).toEqual([]);
    // An unknown-exercise set in S1 is not a baseline for back-squat in S2: still no record.
    expect(run([set("mystery-lift", S1, 200, 8), set("back-squat", S2, 100, 8)])).toEqual([]);
  });

  it("rule-15 R15-E11 (AC8) shuffled input and a replayed older row give a deep-equal output", () => {
    const h = [
      ...baseline(),
      set("back-squat", S2, 102.5, 8),
      set("push-up", S1, 0, 12),
      set("push-up", S2, 0, 15),
      set("plank", S1, 0, null, { durationS: 60 }),
      set("plank", S2, 0, null, { durationS: 75 }),
    ];
    const expected = run(h);
    expect(expected).toHaveLength(3);
    const shuffled = [h[6], h[3], h[0], h[5], h[2], h[4], h[1]] as HistorySet[];
    const first = h[2] as HistorySet;
    const replay: HistorySet = { ...first, weightKg: 200, editedAt: "2026-09-01T08:00:00+02:00" };
    expect(run([...shuffled, replay])).toEqual(expected);
    expect(run([replay, ...h])).toEqual(expected);
  });

  it("rule-15 (AC10) output is sorted by completedAt, then clientId, and has the RecordSet shape", () => {
    const h = [
      set("push-up", S1, 0, 12, { tag: "0" }),
      set("back-squat", S1, 100, 8, { tag: "0" }),
      set("push-up", S3, 0, 15, { tag: "0" }),
      set("back-squat", S2, 102.5, 8, { tag: "0", time: "11:00" }),
      set("bench-press", S1, 60, 8, { tag: "0" }),
      set("bench-press", S2, 62.5, 8, { tag: "0", time: "11:00" }),
    ];
    const out = run(h);
    expect(out.map((r) => r.clientId)).toEqual([
      `back-squat@${S2}#0`,
      `bench-press@${S2}#0`,
      `push-up@${S3}#0`,
    ]);
    const first: RecordSet = {
      exerciseId: "back-squat",
      sessionId: `s@${S2}`,
      clientId: `back-squat@${S2}#0`,
      completedAt: `${S2}T11:00:00+02:00`,
      weightKg: 102.5,
      reps: 8,
      durationS: null,
      previous: { weightKg: 100, reps: 8, durationS: null },
    };
    expect(out[0]).toStrictEqual(first);
  });
});
