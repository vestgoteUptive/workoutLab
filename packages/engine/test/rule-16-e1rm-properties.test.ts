// T-0961 UF-06.2: rule 16 seeded properties (D-0258 §13): inline mulberry32, no fast-check,
// >= 200 cases each, fixed seeds. Also R16-E10, agreement with rule 15's session best (AC6).
import { describe, expect, it } from "vitest";
import {
  estimatedOneRepMax,
  isHardSet,
  normalizeHistory,
  recordKey,
  type HistorySet,
  type LibraryExercise,
} from "../src/index.js";
import { LIBRARY } from "./fixtures/common.js";
import { mk, mulberry32 } from "./fixtures/e1rm.js";

const CASES = 300;
const LIFTS = ["back-squat", "bench-press", "barbell-row"];
const ex = (id: string): LibraryExercise => LIBRARY.find((e) => e.id === id) as LibraryExercise;

/** A random history of 1..6 sessions x 0..6 sets, mixed with junk (warm-ups, tombstones, bad loads). */
function randomHistory(rnd: () => number): HistorySet[] {
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T;
  const out: HistorySet[] = [];
  const sessions = 1 + Math.floor(rnd() * 6);
  let n = 0;
  for (let s = 0; s < sessions; s++) {
    const day = 1 + Math.floor(rnd() * 28);
    const sets = Math.floor(rnd() * 7);
    for (let i = 0; i < sets; i++) {
      const at = `2026-09-${String(day).padStart(2, "0")}T${String(8 + Math.floor(rnd() * 3)).padStart(2, "0")}:${String(Math.floor(rnd() * 4) * 5).padStart(2, "0")}:00+02:00`;
      const kind = rnd();
      const weight = kind < 0.05 ? pick([0, -5, null]) : 20 + Math.floor(rnd() * 14) * 5;
      const reps = kind > 0.95 ? pick([0, null, 7.5]) : 1 + Math.floor(rnd() * 15);
      out.push(
        mk(pick(LIFTS), `S${s}`, at, weight, reps, {
          clientId: `c${n++}`,
          isWarmup: rnd() < 0.1,
          deletedAt: rnd() < 0.08 ? at : null,
        }),
      );
    }
  }
  return out;
}

function shuffled<T>(xs: readonly T[], rnd: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

/** All valid sets (reps 1..10) of one exercise grouped by session, via the public helpers. */
function validBySession(h: HistorySet[], id: string): Map<string, HistorySet[]> {
  const out = new Map<string, HistorySet[]>();
  for (const s of normalizeHistory(h)) {
    if (s.exerciseId !== id || !isHardSet(s, ex(id))) continue;
    if (s.weightKg === null || !(s.weightKg > 0) || s.reps === null) continue;
    if (!Number.isInteger(s.reps) || s.reps < 1 || s.reps > 10) continue;
    out.set(s.sessionId, [...(out.get(s.sessionId) ?? []), s]);
  }
  return out;
}

describe("rule-16 seeded properties", () => {
  it("rule-16 P1 output is sorted by completedAt then clientId, one point per session", () => {
    const rnd = mulberry32(1601);
    let nonEmpty = 0;
    for (let c = 0; c < CASES; c++) {
      const h = randomHistory(rnd);
      for (const id of LIFTS) {
        const p = estimatedOneRepMax(h, LIBRARY, id);
        if (p.length > 0) nonEmpty++;
        expect(new Set(p.map((x) => x.sessionId)).size).toBe(p.length);
        for (let i = 1; i < p.length; i++) {
          const a = p[i - 1] as (typeof p)[number];
          const b = p[i] as (typeof p)[number];
          const ta = Date.parse(a.completedAt);
          const tb = Date.parse(b.completedAt);
          expect(ta < tb || (ta === tb && a.clientId < b.clientId)).toBe(true);
        }
      }
    }
    expect(nonEmpty).toBeGreaterThan(CASES);
  }, 30_000);

  it("rule-16 P2 every point has reps 1..10, weight > 0 and e1rm = weight x (30 + reps) / 30", () => {
    const rnd = mulberry32(1602);
    for (let c = 0; c < CASES; c++) {
      for (const p of estimatedOneRepMax(randomHistory(rnd), LIBRARY, "back-squat")) {
        expect(Number.isInteger(p.reps) && p.reps >= 1 && p.reps <= 10).toBe(true);
        expect(p.weightKg).toBeGreaterThan(0);
        expect(p.e1rm).toBe((p.weightKg * (30 + p.reps)) / 30);
      }
    }
  }, 30_000);

  it("rule-16 P3 permuting the input never changes the output; adding a warm-up or tombstone never does either", () => {
    const rnd = mulberry32(1603);
    for (let c = 0; c < CASES; c++) {
      const h = randomHistory(rnd);
      const base = estimatedOneRepMax(h, LIBRARY, "back-squat");
      expect(estimatedOneRepMax(shuffled(h, rnd), LIBRARY, "back-squat")).toEqual(base);
      const sid = `S${Math.floor(rnd() * 6)}`;
      const at = "2026-09-15T09:00:00+02:00";
      const extra = [
        mk("back-squat", sid, at, 300, 1, { clientId: "xw", isWarmup: true }),
        mk("back-squat", sid, at, 300, 1, { clientId: "xt", deletedAt: at }),
      ];
      expect(estimatedOneRepMax([...h, ...extra], LIBRARY, "back-squat")).toEqual(base);
      expect(estimatedOneRepMax([...extra, ...h], LIBRARY, "back-squat")).toEqual(base);
    }
  }, 30_000);

  it("rule-16 P4 no point is below any other valid set of its session", () => {
    const rnd = mulberry32(1604);
    let checked = 0;
    for (let c = 0; c < CASES; c++) {
      const h = randomHistory(rnd);
      const bySession = validBySession(h, "back-squat");
      const p = estimatedOneRepMax(h, LIBRARY, "back-squat");
      expect(p.length).toBe(bySession.size);
      for (const pt of p) {
        for (const s of bySession.get(pt.sessionId) ?? []) {
          expect(pt.e1rm).toBeGreaterThanOrEqual(
            ((s.weightKg as number) * (30 + (s.reps as number))) / 30,
          );
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(CASES);
  }, 30_000);

  it("rule-16 P5 adding sets of other exercises changes nothing", () => {
    const rnd = mulberry32(1605);
    for (let c = 0; c < CASES; c++) {
      const h = randomHistory(rnd).map((s) => ({ ...s, exerciseId: "back-squat" }));
      const others = randomHistory(rnd).map((s, i) => ({
        ...s,
        clientId: `o${i}`,
        exerciseId: ["bench-press", "push-up", "plank", "wu-leg-swing"][i % 4] as string,
        sessionId: i % 2 === 0 ? s.sessionId : "S0",
      }));
      expect(estimatedOneRepMax([...h, ...others], LIBRARY, "back-squat")).toEqual(
        estimatedOneRepMax(h, LIBRARY, "back-squat"),
      );
    }
  }, 30_000);

  it("rule-16 R16-E10 (AC6) the best set per session is rule 15's session best at every rep count 1..10", () => {
    const rnd = mulberry32(1606);
    let compared = 0;
    for (let c = 0; c < CASES; c++) {
      // restrict reps to a single count per case so every count 1..10 is covered repeatedly
      const reps = 1 + (c % 10);
      const h = randomHistory(rnd).map((s) =>
        s.reps !== null && s.reps >= 1 && s.reps <= 10 && rnd() < 0.5 ? s : { ...s, reps },
      );
      const e = ex("back-squat");
      const p = estimatedOneRepMax(h, LIBRARY, "back-squat");
      for (const [sid, sets] of validBySession(h, "back-squat")) {
        // rule 15's session best: highest recordKey, then earlier completedAt, then smaller clientId
        const r15 = [...sets].sort((a, b) => {
          const ka = recordKey(a, e.timed);
          const kb = recordKey(b, e.timed);
          return (
            kb[1] - ka[1] ||
            Date.parse(a.completedAt) - Date.parse(b.completedAt) ||
            (a.clientId < b.clientId ? -1 : 1)
          );
        })[0] as HistorySet;
        const pt = p.find((x) => x.sessionId === sid);
        expect(pt?.clientId).toBe(r15.clientId);
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(CASES);
  }, 30_000);
});
