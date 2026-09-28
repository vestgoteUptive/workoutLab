// Simulated 14-day histories through balance() (UF-10.1, UF-10.2). AC29–AC33, plus seeded
// property tests for the invariants (never a negative deficit, same input → same output).
import { describe, expect, it } from "vitest";
import { AREAS, balance, type Area, type BalanceResult, type HistorySet } from "../src/index.js";
import {
  F_TARGETS,
  L1,
  LIBRARY,
  NOW,
  NOW_MIDNIGHT_28,
  NOW_OCT_01,
  TZ,
  WARMUPS,
} from "./fixtures/common.js";
import {
  SIMULATED_HISTORIES,
  allChestNoLegsHistory,
  balancedHistory,
  offlineMergedHistory,
  returningAfter10DaysHistory,
} from "./fixtures/histories.js";
import { areaOf, orderOf } from "./helpers.js";

const run = (history: HistorySet[], now = NOW) => balance(history, F_TARGETS, LIBRARY, now, TZ);

function loads(r: BalanceResult): Record<Area, number> {
  const out = {} as Record<Area, number>;
  for (const a of AREAS) out[a] = areaOf(r, a).load;
  return out;
}

function recovering(r: BalanceResult): Area[] {
  return AREAS.filter((a) => areaOf(r, a).recovering);
}

describe("simulated 14-day histories", () => {
  it("rule-11 (AC29) balanced: every area covered, only arms recovering", () => {
    const r = run(balancedHistory);
    expect(loads(r)).toEqual({
      chest: 21,
      back: 21,
      shoulders: 24.5,
      arms: 42,
      core: 31.5,
      glutes: 28,
      quads: 21,
      hamstrings: 24.5,
      calves: 14,
    });
    for (const a of r.areas) {
      expect(a.deficit).toBe(0);
      expect(a.coverageStep).toBe(4);
      expect(a.needsAttention).toBe(false);
      expect(a.lastTrainedDate).toBe("2026-09-27");
    }
    expect(orderOf(r)).toEqual([...AREAS]);
    expect(recovering(r)).toEqual(["arms"]);
    expect(areaOf(r, "arms").contributors.map((c) => [c.exerciseId, c.weightedSets])).toEqual([
      ["biceps-curl", 14],
      ["barbell-row", 10.5],
      ["bench-press", 10.5],
      ["overhead-press", 7],
    ]);
  });

  it("rule-5 (AC30) all chest, no legs: legs and back need attention", () => {
    const r = run(allChestNoLegsHistory);
    expect(loads(r)).toEqual({
      chest: 60,
      back: 0,
      shoulders: 21,
      arms: 30,
      core: 9,
      glutes: 0,
      quads: 0,
      hamstrings: 0,
      calves: 0,
    });
    for (const area of ["back", "glutes", "quads", "hamstrings", "calves"] as const) {
      const a = areaOf(r, area);
      expect(a.deficit).toBe(1);
      expect(a.lastTrainedDate).toBeNull();
      expect(a.needsAttention).toBe(true);
      expect(a.coverageStep).toBe(0);
    }
    expect(areaOf(r, "core").deficit).toBe(0.25);
    expect(areaOf(r, "core").needsAttention).toBe(false);
    expect(areaOf(r, "core").coverageStep).toBe(3);
    for (const area of ["chest", "shoulders", "arms"] as const)
      expect(areaOf(r, area).coverageStep).toBe(4);
    expect(orderOf(r)).toEqual([
      "back",
      "glutes",
      "quads",
      "hamstrings",
      "calves",
      "core",
      "chest",
      "shoulders",
      "arms",
    ]);
    expect(recovering(r)).toEqual(["chest"]);
  });

  it("R5-E1 (AC31) returning after 10 days off: everything needs attention; lastTrainedDate reaches before the window", () => {
    const r = run(returningAfter10DaysHistory);
    expect(loads(r)).toEqual({
      chest: 0,
      back: 0,
      shoulders: 0,
      arms: 0,
      core: 1.5,
      glutes: 5,
      quads: 3,
      hamstrings: 5.5,
      calves: 0,
    });
    const last: Record<Area, string> = {
      chest: "2026-09-12",
      back: "2026-09-12",
      shoulders: "2026-09-12",
      arms: "2026-09-12",
      calves: "2026-09-12",
      quads: "2026-09-15",
      core: "2026-09-15",
      glutes: "2026-09-17",
      hamstrings: "2026-09-17",
    };
    for (const a of AREAS) expect(areaOf(r, a).lastTrainedDate).toBe(last[a]);
    expect(r.areas.every((a) => a.needsAttention)).toBe(true);
    expect(orderOf(r)).toEqual([
      "chest",
      "back",
      "shoulders",
      "arms",
      "calves",
      "core",
      "quads",
      "glutes",
      "hamstrings",
    ]);
    const ham = areaOf(r, "hamstrings");
    expect(ham.days[1]).toBe(1.5);
    expect(ham.days[3]).toBe(4);
    expect(ham.coverageStep).toBe(2);

    const later = run(returningAfter10DaysHistory, NOW_OCT_01);
    for (const a of later.areas) {
      expect(a.load).toBe(0);
      expect(a.needsAttention).toBe(false);
    }
    expect(orderOf(later)).toEqual([...AREAS]);
    expect(areaOf(later, "hamstrings").lastTrainedDate).toBe("2026-09-17");
    expect(areaOf(later, "quads").lastTrainedDate).toBe("2026-09-15");
    expect(areaOf(later, "chest").lastTrainedDate).toBe("2026-09-12");
  });

  it("R0-E2, R11-E4 (AC32) offline-merged: queued sets, a tombstone and a replay", () => {
    const r = run(offlineMergedHistory);
    const l = loads(r);
    expect([l.chest, l.shoulders, l.arms, l.core, l.hamstrings, l.glutes]).toEqual([
      59, 20.5, 29.5, 9, 3, 1.5,
    ]);
    expect(areaOf(r, "chest").days[12]).toBe(9);
    expect(areaOf(r, "chest").recovering).toBe(true);
    expect(orderOf(r)).toEqual([
      "back",
      "quads",
      "calves",
      "glutes",
      "hamstrings",
      "core",
      "chest",
      "shoulders",
      "arms",
    ]);
  });

  const cases: Array<[string, HistorySet[]]> = [
    ...Object.entries(SIMULATED_HISTORIES).map(([k, v]) => [k, v] as [string, HistorySet[]]),
    ["empty", []],
  ];
  const nows = [NOW, NOW_MIDNIGHT_28, NOW_OCT_01];

  for (const [name, history] of cases) {
    for (const now of nows) {
      it(`rule-11 (AC33) invariants hold for ${name} at ${now}`, () => {
        const r = run(history, now);
        expect(run(history, now)).toEqual(r);
        expect(r.areas).toHaveLength(9);
        for (const a of r.areas) assertAreaInvariants(a);
      });
    }
  }
});

function assertAreaInvariants(a: BalanceResult["areas"][number]): void {
  const sumDays = a.days.reduce((s, v) => s + v, 0);
  const sumContrib = a.contributors.reduce((s, c) => s + c.weightedSets, 0);
  expect(a.days).toHaveLength(14);
  expect(Math.abs(sumDays - a.load)).toBeLessThanOrEqual(1e-9);
  expect(Math.abs(sumContrib - a.load)).toBeLessThanOrEqual(1e-9);
  expect(a.deficit).toBe(Math.max(0, a.target - a.load) / a.target);
  expect(a.deficit).toBeGreaterThanOrEqual(0);
  expect(a.deficit).toBeLessThanOrEqual(1);
  const r = a.load / a.target;
  const step = a.load === 0 ? 0 : r < 0.33 ? 1 : r < 0.66 ? 2 : r < 1 ? 3 : 4;
  expect(a.coverageStep).toBe(step);
  for (const d of a.days) expect(d).toBeGreaterThanOrEqual(0);
}

// Seeded property tests. fast-check isn't in the workspace lockfile (follow-up to infra), so
// a small deterministic PRNG (mulberry32) generates the cases; a failure prints its seed.
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

function randomHistory(rand: () => number): HistorySet[] {
  const ids = [...L1, ...WARMUPS].map((e) => e.id).concat(["not-in-library"]);
  const n = Math.floor(rand() * 120);
  const baseMs = new Date("2026-08-01T00:00:00Z").getTime();
  const spanMs = 70 * 86_400_000; // 2026-08-01 … 2026-10-10: before, inside and after the window
  const rows: HistorySet[] = [];
  for (let i = 0; i < n; i++) {
    const clientId = `c${Math.floor(rand() * Math.max(1, n * 0.8))}`; // some ids repeat (edits)
    const completed = new Date(baseMs + Math.floor(rand() * spanMs)).toISOString();
    const edited = new Date(baseMs + Math.floor(rand() * spanMs)).toISOString();
    rows.push({
      clientId,
      sessionId: `s${i % 7}`,
      exerciseId: ids[Math.floor(rand() * ids.length)]!,
      isWarmup: rand() < 0.1,
      completedAt: completed,
      editedAt: edited,
      deletedAt: rand() < 0.15 ? edited : null,
      pending: rand() < 0.3,
      reps: 8,
      weightKg: 40,
      durationS: null,
    });
  }
  return rows;
}

describe("seeded properties of balance()", () => {
  it("rule-5 never negative deficit, rule-11 invariants hold, and rule-0 same input gives the same output (300 seeds)", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const rand = mulberry32(seed);
      const history = randomHistory(rand);
      const now = new Date(
        new Date("2026-09-01T00:00:00Z").getTime() + Math.floor(rand() * 40 * 86_400_000),
      ).toISOString();
      const r = balance(history, F_TARGETS, LIBRARY, now, TZ);
      try {
        expect(balance(structuredClone(history), F_TARGETS, LIBRARY, now, TZ)).toEqual(r);
        for (const a of r.areas) assertAreaInvariants(a);
        expect(new Set(r.areas.map((a) => a.area)).size).toBe(9);
        // Needs attention implies deficit ≥ 0.5 and some hard set in the window.
        const anyLoad = r.areas.some((a) => a.load > 0);
        for (const a of r.areas)
          if (a.needsAttention) expect(a.deficit >= 0.5 && anyLoad).toBe(true);
      } catch (err) {
        throw new Error(`seed ${seed}: ${(err as Error).message}`);
      }
    }
  });

  it("rule-0 history order never changes balance() for distinct edited_at values (200 seeds)", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rand = mulberry32(10_000 + seed);
      // Make edited_at unique per row so the input-order tie-break never applies.
      const history = randomHistory(rand).map((row, i) => ({
        ...row,
        editedAt: new Date(new Date(row.editedAt).getTime() + i).toISOString(),
      }));
      const reversed = [...history].reverse();
      expect(balance(reversed, F_TARGETS, LIBRARY, NOW, TZ), `seed ${seed}`).toEqual(
        balance(history, F_TARGETS, LIBRARY, NOW, TZ),
      );
    }
  });
});
