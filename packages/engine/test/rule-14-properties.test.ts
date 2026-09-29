// T-0205 rule 14 UF-09.3 UF-09.4: seeded property tests for `prefill` (fast-check is not in
// the lockfile, D-0036 §5). An independent oracle written from docs/engine-rules.md rule 14
// and D-0057 §2–§6/§9 (and D-0060 §1–§4) is compared against the engine on random
// histories built around the gap and rep boundaries. AC19, AC21, AC23.
import { describe, expect, it } from "vitest";
import {
  normalizeHistory,
  prefill,
  type HistorySet,
  type LibraryExercise,
  type PrefillPrevious,
  type PrefillResult,
  type PrefillSlot,
} from "../src/index.js";
import { LIBRARY, NOW, TZ } from "./fixtures/common.js";
import { mulberry32 } from "./fixtures/random.js";

const lib = new Map(LIBRARY.map((e) => [e.id, e]));
const get = (id: string): LibraryExercise => lib.get(id) as LibraryExercise;

// ---- The oracle ----

const r3 = (v: number): number => Math.round(v * 1000) / 1000;
const flo = (v: number, step: number): number => r3(Math.floor(r3(v) / step + 1e-9) * step);

/** Stockholm local date of an instant: CEST (+2) until 2026-10-25 01:00Z, CET (+1) after. */
function stockholmDate(instant: string): string {
  const ms = Date.parse(instant);
  const offsetH =
    ms >= Date.parse("2026-10-25T01:00:00Z") || ms < Date.parse("2026-03-29T01:00:00Z") ? 1 : 2;
  return new Date(ms + offsetH * 3_600_000).toISOString().slice(0, 10);
}
const daysBetween = (a: string, b: string): number =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

function oracle(
  ex: LibraryExercise,
  slot: PrefillSlot,
  history: readonly HistorySet[],
  now: string,
  previous: PrefillPrevious | null,
): PrefillResult {
  const known = lib.get(ex.id);
  const mine = normalizeHistory(history).filter(
    (s) =>
      s.exerciseId === ex.id && !s.isWarmup && known !== undefined && known.kind === "exercise",
  );
  const sessions: Array<{ id: string; last: string; sets: HistorySet[] }> = [];
  for (const s of mine) {
    let g = sessions.find((x) => x.id === s.sessionId);
    if (g === undefined) sessions.push((g = { id: s.sessionId, last: s.completedAt, sets: [] }));
    g.sets.push(s);
    if (Date.parse(s.completedAt) > Date.parse(g.last)) g.last = s.completedAt;
  }
  sessions.sort((a, b) => Date.parse(b.last) - Date.parse(a.last) || (a.id < b.id ? -1 : 1));

  const low = slot.repsMin;
  const high = slot.repsMax;
  const first = (): PrefillResult => {
    if (ex.timed)
      return { weightKg: null, reps: null, durationS: ex.defaultDurationS, kind: "first_time" };
    const p = previous === null ? undefined : lib.get(previous.exerciseId);
    const eq = (e: LibraryExercise): string[] =>
      e.equipment.length === 0 ? ["none"] : [...e.equipment];
    const prim = (e: LibraryExercise): string[] =>
      Object.keys(e.areas).filter((a) => e.areas[a as keyof typeof e.areas] === 1);
    if (
      previous !== null &&
      previous.weightKg !== null &&
      previous.weightKg > 0 &&
      ex.externalLoad &&
      p !== undefined &&
      p.kind === "exercise" &&
      prim(p).some((a) => prim(ex).includes(a)) &&
      eq(p).some((q) => eq(ex).includes(q))
    ) {
      return { weightKg: r3(previous.weightKg), reps: low, durationS: null, kind: "carry" };
    }
    return { weightKg: ex.externalLoad ? null : 0, reps: low, durationS: null, kind: "first_time" };
  };

  const last = sessions[0];
  if (last === undefined) return first();
  const gap = Math.max(0, daysBetween(stockholmDate(last.last), stockholmDate(now)));

  if (ex.timed) {
    const ds = last.sets.flatMap((s) => (s.durationS === null ? [] : [s.durationS]));
    if (ds.length === 0) return first();
    const m = Math.min(...ds);
    const c = (d: number): number => Math.max(15, Math.min(120, d));
    const t = (d: number, kind: PrefillResult["kind"]): PrefillResult => ({
      weightKg: null,
      reps: null,
      durationS: d,
      kind,
    });
    if (gap >= 21) return t(c(Math.floor(r3(0.9 * m) / 5 + 1e-9) * 5), "reentry");
    if (gap >= 10) return t(c(m), "hold_after_break");
    const d = c(m + 5);
    return t(d, d > m ? "add_rep" : "hold");
  }

  const wOf = (sets: HistorySet[]): { w: number; reps: number[] } | null => {
    let w = 0;
    if (ex.externalLoad) {
      const ws = sets.flatMap((s) => (s.weightKg === null ? [] : [s.weightKg]));
      if (ws.length === 0) return null;
      w = Math.max(...ws);
    }
    const reps = sets.flatMap((s) =>
      s.reps !== null && (!ex.externalLoad || s.weightKg === w) ? [s.reps] : [],
    );
    return reps.length === 0 ? null : { w, reps };
  };
  const cur = wOf(last.sets);
  if (cur === null) return first();
  const lo = low as number;
  const hi = high as number;
  const inc = ex.incrementKg ?? 2.5;
  const out = (w: number, reps: number, kind: PrefillResult["kind"]): PrefillResult => ({
    weightKg: r3(w),
    reps,
    durationS: null,
    kind,
  });
  const drop = ex.externalLoad && cur.w > 0 ? Math.max(inc, flo(0.9 * cur.w, inc)) : 0;
  const minR = Math.min(...cur.reps);
  if (gap >= 21) return out(drop, lo, "reentry");
  if (gap >= 10) return out(cur.w, lo, "hold_after_break");
  if (minR >= hi)
    return ex.externalLoad ? out(cur.w + inc, lo, "increase") : out(0, hi, "increase");
  const prev = sessions[1] === undefined ? null : wOf(sessions[1].sets);
  if (minR < lo && prev !== null && prev.w === cur.w && Math.min(...prev.reps) < lo) {
    return out(drop, lo, "deload");
  }
  if (minR < lo) return out(cur.w, lo, "hold");
  return out(cur.w, Math.min(hi, minR + 1), "add_rep");
}

// ---- Random cases ----

const TARGETS = [
  "back-squat",
  "biceps-curl",
  "leg-curl",
  "push-up",
  "plank",
  "seated-cable-row",
  "db-row",
];
const OTHERS = ["lat-pulldown", "hip-thrust", "dead-bug", "ghost-lift"];
// Day offsets from D = 2026-09-27 around every boundary (negative = future).
const OFFSETS = [-3, -1, 0, 0, 1, 2, 3, 9, 10, 11, 20, 21, 22, 30];
const WEIGHTS = [null, 0, 2, 2.5, 20, 20.1, 47.5, 100, 100, 100];
const REPS = [null, 1, 4, 5, 6, 7, 8, 8, 9, 10, 11, 12, 14, 15, 16];
const DURATIONS = [null, 5, 10, 12, 40, 45, 45, 116, 118, 120, 130];
const TIMES = ["00:10", "09:00", "10:00", "10:00", "23:45"];

function pick<T>(rand: () => number, xs: readonly T[]): T {
  return xs[Math.floor(rand() * xs.length)] as T;
}

function dateMinus(days: number): string {
  return new Date(Date.parse("2026-09-27T00:00:00Z") - days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function randomCase(seed: number): {
  ex: LibraryExercise;
  slot: PrefillSlot;
  history: HistorySet[];
  previous: PrefillPrevious | null;
} {
  const rand = mulberry32(seed);
  const ex = get(pick(rand, TARGETS));
  const slot: PrefillSlot = ex.timed
    ? { repsMin: null, repsMax: null }
    : pick(rand, [
        { repsMin: 6, repsMax: 8 },
        { repsMin: 8, repsMax: 12 },
        { repsMin: 10, repsMax: 15 },
      ]);
  const history: HistorySet[] = [];
  const nSessions = Math.floor(rand() * 4);
  for (let k = 0; k < nSessions; k++) {
    const day = dateMinus(pick(rand, OFFSETS));
    const sessionId = pick(rand, ["s-a", "s-b", "s-c", `s-${k}`]);
    const nSets = 1 + Math.floor(rand() * 4);
    for (let i = 0; i < nSets; i++) {
      const at = `${day}T${pick(rand, TIMES)}:00+02:00`;
      const exerciseId = rand() < 0.8 ? ex.id : pick(rand, OTHERS);
      const sameW = rand() < 0.6;
      const row: HistorySet = {
        clientId: `c${seed}-${k}-${i}`,
        sessionId,
        exerciseId,
        isWarmup: rand() < 0.08,
        completedAt: at,
        editedAt: at,
        deletedAt: rand() < 0.08 ? at : null,
        reps: pick(rand, REPS),
        weightKg: sameW ? 100 : pick(rand, WEIGHTS),
        durationS: pick(rand, DURATIONS),
      };
      if (rand() < 0.2) row.pending = true;
      history.push(row);
      if (rand() < 0.15) {
        // A queued edit or tombstone of the same clientId, later.
        const later = `${day}T23:59:00+02:00`;
        history.push({
          ...row,
          pending: true,
          editedAt: later,
          reps: pick(rand, REPS),
          deletedAt: rand() < 0.4 ? later : null,
        });
      }
    }
  }
  const previous =
    rand() < 0.5
      ? null
      : {
          exerciseId: pick(rand, [...OTHERS, "barbell-row", "plank"]),
          weightKg: pick(rand, [null, 0, 50, 62.5]),
        };
  return { ex, slot, history, previous };
}

const N = 4000;
const NOWS = [NOW, "2026-09-26T22:30:00Z", "2026-11-06T12:00:00+01:00"];

describe("rule 14 prefill properties (seeded)", () => {
  it("rule-14 (AC19) (AC21) prefill equals the independent rule 14 oracle on random boundary histories", () => {
    const kinds = new Map<string, number>();
    for (let seed = 1; seed <= N; seed++) {
      const { ex, slot, history, previous } = randomCase(seed);
      const now = NOWS[seed % NOWS.length] as string;
      const got = prefill(ex, slot, history, LIBRARY, now, TZ, previous);
      const want = oracle(ex, slot, history, now, previous);
      expect(got, `seed ${seed} ${ex.id} now ${now}`).toEqual(want);
      kinds.set(got.kind, (kinds.get(got.kind) ?? 0) + 1);
    }
    // Every kind is reached, so the oracle comparison covers every branch.
    for (const k of [
      "first_time",
      "carry",
      "reentry",
      "hold_after_break",
      "increase",
      "deload",
      "hold",
      "add_rep",
    ]) {
      expect(kinds.get(k) ?? 0, k).toBeGreaterThan(10);
    }
  });

  it("rule-14 (AC19) same input → same output; history order and library order don't matter; inputs unchanged", () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const { ex, slot, history, previous } = randomCase(seed);
      const snapshot = structuredClone(history);
      const a = prefill(ex, slot, history, LIBRARY, NOW, TZ, previous);
      expect(prefill(ex, slot, history, LIBRARY, NOW, TZ, previous), `seed ${seed}`).toEqual(a);
      // Reversal is safe here: every (clientId, editedAt) pair is unique in randomCase.
      expect(
        prefill(ex, slot, [...history].reverse(), [...LIBRARY].reverse(), NOW, TZ, previous),
        `seed ${seed}`,
      ).toEqual(a);
      expect(history).toEqual(snapshot);
    }
  });

  it("rule-14 (AC21) invariants: shape, bounds, bodyweight 0, carry only with a previous, reps in range", () => {
    for (let seed = 1; seed <= N; seed++) {
      const { ex, slot, history, previous } = randomCase(seed);
      const p = prefill(ex, slot, history, LIBRARY, NOW, TZ, previous);
      const l = `seed ${seed}`;
      expect(Object.keys(p).sort(), l).toEqual(["durationS", "kind", "reps", "weightKg"]);
      if (p.kind === "carry") expect(previous, l).not.toBeNull();
      if (ex.timed) {
        expect([p.weightKg, p.reps], l).toEqual([null, null]);
        expect(p.durationS, l).toBeGreaterThanOrEqual(15);
        expect(p.durationS, l).toBeLessThanOrEqual(120);
        expect(Number.isInteger(p.durationS), l).toBe(true);
      } else {
        expect(p.durationS, l).toBeNull();
        expect(p.reps, l).toBeGreaterThanOrEqual(slot.repsMin as number);
        expect(p.reps, l).toBeLessThanOrEqual(slot.repsMax as number);
        if (!ex.externalLoad) expect(p.weightKg, l).toBe(0);
        if (ex.externalLoad && p.weightKg !== null) {
          // Never a 0 kg loaded pre-fill except when 0 kg was logged (D-0057 §4), 3-decimal rounded.
          expect(p.weightKg, l).toBeGreaterThanOrEqual(0);
          expect(r3(p.weightKg), l).toBe(p.weightKg);
        }
        if (ex.externalLoad && p.kind === "first_time") expect(p.weightKg, l).toBeNull();
        if (p.kind !== "add_rep" && p.kind !== "increase") expect(p.reps, l).toBe(slot.repsMin);
      }
    }
  });
});
