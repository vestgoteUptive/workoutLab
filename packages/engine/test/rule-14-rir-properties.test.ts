// T-0952 rule 14 AC10: seeded properties (inline mulberry32, no fast-check, >= 200 cases each)
// over `prefill` with `rir` (D-0250, D-0259 §5). The golden copy of the pre-change rule below is
// the old step 4 verbatim: it never reads `rir`.
import { describe, expect, it } from "vitest";
import {
  dayDiff,
  isHardSet,
  localDate,
  normalizeHistory,
  prefill,
  type HistorySet,
  type LibraryExercise,
  type PrefillResult,
  type PrefillSlot,
} from "../src/index.js";
import { LIBRARY, NOW, TZ } from "./fixtures/common.js";
import { rirSession } from "./fixtures/rir.js";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CASES = 300;
const MAIN: PrefillSlot = { repsMin: 6, repsMax: 8 };
const ex = (id: string): LibraryExercise => LIBRARY.find((e) => e.id === id) as LibraryExercise;
const floorInc = (x: number, inc: number): number =>
  Math.floor(Math.round(x * 1000) / 1000 / inc + 1e-9) * inc;
const round3 = (x: number): number => Math.round(x * 1000) / 1000;

/** The pre-T-0952 rule 14 for a non-timed, loaded exercise (steps 2-7), `rir` never read. */
function golden(
  exercise: LibraryExercise,
  slot: PrefillSlot,
  history: readonly HistorySet[],
): { result: PrefillResult; W: number | null } | null {
  const low = slot.repsMin as number;
  const high = slot.repsMax as number;
  const bySession = new Map<string, HistorySet[]>();
  for (const s of normalizeHistory(history)) {
    if (s.exerciseId !== exercise.id || !isHardSet(s, exercise)) continue;
    bySession.set(s.sessionId, [...(bySession.get(s.sessionId) ?? []), s]);
  }
  const last = (sets: HistorySet[]): number =>
    Math.max(...sets.map((s) => Date.parse(s.completedAt)));
  const sessions = [...bySession.entries()].sort(
    (a, b) => last(b[1]) - last(a[1]) || (a[0] < b[0] ? -1 : 1),
  );
  const atW = (sets: HistorySet[]): { w: number; reps: number[] } | null => {
    const ws = sets.map((s) => s.weightKg).filter((x): x is number => x !== null);
    if (ws.length === 0) return null;
    const w = Math.max(...ws);
    const reps = sets
      .filter((s) => s.reps !== null && s.weightKg === w)
      .map((s) => s.reps as number);
    return reps.length === 0 ? null : { w, reps };
  };
  const first = sessions[0];
  if (first === undefined) return null;
  const cur = atW(first[1]);
  if (cur === null) return null;
  const inc = exercise.incrementKg ?? 2.5;
  const W = cur.w;
  const gap = Math.max(
    0,
    dayDiff(localDate(new Date(last(first[1])).toISOString(), TZ), localDate(NOW, TZ)),
  );
  const dropped = W > 0 ? round3(Math.min(W, Math.max(inc, floorInc(0.9 * W, inc)))) : 0;
  const res = (w: number, reps: number, kind: PrefillResult["kind"]): PrefillResult => ({
    weightKg: round3(w),
    reps,
    durationS: null,
    kind,
  });
  const minReps = Math.min(...cur.reps);
  let result: PrefillResult;
  if (gap >= 21) result = res(dropped, low, "reentry");
  else if (gap >= 10) result = res(W, low, "hold_after_break");
  else if (cur.reps.every((r) => r >= high)) result = res(W + inc, low, "increase");
  else if (minReps < low) {
    const second = sessions[1];
    const before = second === undefined ? null : atW(second[1]);
    result =
      before !== null && before.w === W && Math.min(...before.reps) < low
        ? res(dropped, low, "deload")
        : res(W, low, "hold");
  } else result = res(W, Math.min(high, minReps + 1), "add_rep");
  return { result, W };
}

const WEIGHTS = [77.5, 80, 80, 82.5];
const RIR_POOL: unknown[] = [null, null, 0, 1, 2, 3, 4, 5, 1.5, 6, -1, "2", undefined];

/** 0-4 bench-press sessions within 0-30 days of NOW, with edits and tombstones; rir optional. */
function randomSessions(rand: () => number, withRir: boolean): HistorySet[] {
  const n = Math.floor(rand() * 5);
  const rows: HistorySet[] = [];
  for (let i = 0; i < n; i++) {
    const day = 27 - Math.floor(rand() * 30);
    const date = new Date(Date.UTC(2026, 8, day)).toISOString().slice(0, 10);
    const sets = 1 + Math.floor(rand() * 4);
    const w = WEIGHTS[Math.floor(rand() * WEIGHTS.length)] as number;
    const entries = Array.from({ length: sets }, () => {
      const weight = rand() < 0.15 ? WEIGHTS[Math.floor(rand() * WEIGHTS.length)] : w;
      const reps = rand() < 0.1 ? null : rand() < 0.5 ? 8 : 4 + Math.floor(rand() * 5);
      const rir = withRir ? RIR_POOL[Math.floor(rand() * RIR_POOL.length)] : undefined;
      return [weight as number, reps, rir] as const;
    });
    const session = rirSession(date, "bench-press", entries).map((s, k) => ({
      ...s,
      sessionId: `s${i}-${date}`,
      clientId: `c${i}-${k}-${date}`,
      isWarmup: rand() < 0.05,
      deletedAt: rand() < 0.05 ? s.completedAt : null,
    }));
    rows.push(...session);
  }
  return rows;
}

describe("rule 14 RIR properties (AC10, seeded mulberry32, 300 cases each)", () => {
  it("rule-14 (AC10) with every rir null or absent the output equals the pre-change rule", () => {
    let compared = 0;
    for (let seed = 0; seed < CASES; seed++) {
      const h = randomSessions(mulberry32(1000 + seed), false);
      const g = golden(ex("bench-press"), MAIN, h);
      if (g === null) continue;
      compared++;
      expect(prefill(ex("bench-press"), MAIN, h, LIBRARY, NOW, TZ, null), `seed ${seed}`).toEqual(
        g.result,
      );
      // Explicit nulls give the same as absent.
      const nulled = h.map((s) => ({ ...s, rir: null }));
      expect(
        prefill(ex("bench-press"), MAIN, nulled, LIBRARY, NOW, TZ, null),
        `seed ${seed}`,
      ).toEqual(g.result);
    }
    expect(compared).toBeGreaterThan(150);
  }, 30_000); // runtime budget only (sweep)

  it("rule-14 (AC10) is deterministic and never returns a weight below W except steps 2 and 5", () => {
    let holds = 0;
    for (let seed = 0; seed < CASES; seed++) {
      const h = randomSessions(mulberry32(5000 + seed), true);
      const g = golden(ex("bench-press"), MAIN, h);
      if (g === null || g.W === null) continue;
      const a = prefill(ex("bench-press"), MAIN, h, LIBRARY, NOW, TZ, null);
      const b = prefill(ex("bench-press"), MAIN, [...h].reverse(), LIBRARY, NOW, TZ, null);
      expect(a, `seed ${seed}`).toEqual(b);
      if (a.kind === "hold_effort") holds++;
      // RIR only ever changes `increase` into `hold_effort` (same W, high reps); never a drop.
      if (a.kind !== "reentry" && a.kind !== "deload") {
        expect(a.weightKg as number, `seed ${seed}`).toBeGreaterThanOrEqual(g.W);
      }
      if (a.kind === "hold_effort") {
        expect(g.result.kind, `seed ${seed}`).toBe("increase");
        expect(a).toEqual({ weightKg: g.W, reps: 8, durationS: null, kind: "hold_effort" });
      } else {
        expect(a, `seed ${seed}`).toEqual(g.result);
      }
    }
    expect(holds).toBeGreaterThan(5);
  }, 30_000); // runtime budget only (sweep)

  it("rule-14 (AC10) a user logging RIR <= 1 at top reps gets hold_effort at most once in a row", () => {
    let maxRun = 0;
    let steps = 0;
    for (let seed = 0; seed < CASES; seed++) {
      const rand = mulberry32(9000 + seed);
      let history: HistorySet[] = [];
      let w = 80;
      let reps = 8;
      let run = 0;
      const start = Date.UTC(2026, 7, 1);
      for (let i = 0; i < 8; i++) {
        const date = new Date(start + i * 3 * 86_400_000).toISOString().slice(0, 10);
        const rirs = [0, 1, 1].map((x) => (rand() < 0.5 ? x : rand() < 0.5 ? 0 : 1));
        history = [
          ...history,
          ...rirSession(
            date,
            "bench-press",
            rirs.map((rir) => [w, reps, rir] as const),
          ).map((s, k) => ({ ...s, sessionId: `s${i}`, clientId: `c${i}-${k}` })),
        ];
        const now =
          new Date(start + (i * 3 + 1) * 86_400_000).toISOString().slice(0, 10) + "T12:00:00+02:00";
        const p = prefill(ex("bench-press"), MAIN, history, LIBRARY, now, TZ, null);
        steps++;
        run = p.kind === "hold_effort" ? run + 1 : 0;
        maxRun = Math.max(maxRun, run);
        expect(run, `seed ${seed} session ${i}`).toBeLessThanOrEqual(1);
        // The user lifts what is prefilled, at the top of the range.
        w = p.weightKg as number;
        reps = 8;
      }
    }
    expect(steps).toBe(CASES * 8);
    expect(maxRun).toBe(1);
  }, 30_000); // runtime budget only (sweep)

  it("rule-14 (AC10) invalid rir values behave as null over random histories", () => {
    const INVALID: unknown[] = [1.5, 6, -1, Number.NaN, "2", 2.5, 10, -0.5, null, undefined];
    for (let seed = 0; seed < CASES; seed++) {
      const rand = mulberry32(13000 + seed);
      const base = randomSessions(rand, false);
      const bad = base.map((s) => ({
        ...s,
        rir: INVALID[Math.floor(rand() * INVALID.length)] as number,
      }));
      expect(prefill(ex("bench-press"), MAIN, bad, LIBRARY, NOW, TZ, null), `seed ${seed}`).toEqual(
        prefill(ex("bench-press"), MAIN, base, LIBRARY, NOW, TZ, null),
      );
    }
  }, 30_000); // runtime budget only (sweep)
});
