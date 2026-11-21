// T-0952 rule 14 AC11 UF-09.3 UF-09.4: three simulated 14-day histories replayed through
// `prefill` and `suggest` (D-0250, D-0252, D-0259). Each table is the expected output after
// every session; the existing simulated histories are tested unedited elsewhere.
import { describe, expect, it } from "vitest";
import {
  prefill,
  suggest,
  type HistorySet,
  type LibraryExercise,
  type PrefillResult,
  type PrefillSlot,
} from "../src/index.js";
import { F_PROFILE, F_TARGETS, LIBRARY, TZ, input } from "./fixtures/common.js";
import { rirSession, top, withSteps, type RirEntry } from "./fixtures/rir.js";

const MAIN: PrefillSlot = { repsMin: 6, repsMax: 8 };
const ISOLATION: PrefillSlot = { repsMin: 10, repsMax: 15 };
const at = (date: string): string => `${date}T12:00:00+02:00`;
const lib = (l: readonly LibraryExercise[], id: string): LibraryExercise =>
  l.find((e) => e.id === id) as LibraryExercise;

interface Step {
  /** Local date of the session the user logs. */
  date: string;
  entries: readonly RirEntry[];
  /** Expected pre-fill the day after, `[weightKg, reps, kind]`. */
  next: readonly [number, number, PrefillResult["kind"]];
}

/** Replays the sessions in order: after each one, prefill at noon the next day must match. */
function replay(
  id: string,
  slot: PrefillSlot,
  library: readonly LibraryExercise[],
  steps: readonly Step[],
): HistorySet[] {
  let history: HistorySet[] = [];
  const got: Array<[number | null, number | null, string]> = [];
  for (const [i, s] of steps.entries()) {
    history = [
      ...history,
      ...rirSession(s.date, id, s.entries).map((row, k) => ({
        ...row,
        sessionId: `s${i}`,
        clientId: `c${i}-${k}`,
      })),
    ];
    const nextDay = new Date(Date.parse(`${s.date}T00:00:00Z`) + 86_400_000)
      .toISOString()
      .slice(0, 10);
    const p = prefill(lib(library, id), slot, history, library, at(nextDay), TZ, null);
    got.push([p.weightKg, p.reps, p.kind]);
  }
  expect(got).toEqual(steps.map((s) => [...s.next]));
  return history;
}

function suggestedItem(
  history: HistorySet[],
  library: readonly LibraryExercise[],
  id: string,
  now: string,
) {
  const w = suggest(
    history,
    F_TARGETS,
    F_PROFILE,
    library,
    input({ budgetMin: 60, pinnedIds: [id], mainLiftId: id }),
    now,
    TZ,
  );
  const found = w.plan.items.find((i) => i.exerciseId === id);
  if (found === undefined) throw new Error(`no ${id} in the plan`);
  return found;
}

describe("simulated 14-day histories with rir (T-0952 AC11)", () => {
  it("rule-14 (AC11) (1) RIR 2 on every session: the weight rises each session", () => {
    const history = replay("bench-press", MAIN, LIBRARY, [
      { date: "2026-09-14", entries: top(80, 8, [2, 3, 2]), next: [82.5, 6, "increase"] },
      { date: "2026-09-17", entries: top(82.5, 8, [2, 2, 3]), next: [85, 6, "increase"] },
      { date: "2026-09-20", entries: top(85, 8, [3, 2, 2]), next: [87.5, 6, "increase"] },
      { date: "2026-09-23", entries: top(87.5, 8, [2, 2, 2]), next: [90, 6, "increase"] },
    ]);
    const item = suggestedItem(history, LIBRARY, "bench-press", at("2026-09-24"));
    expect(item.prefill).toEqual({ weightKg: 90, reps: 6, durationS: null, kind: "increase" });
    expect(item.reasons).toContainEqual({ code: "prefill", kind: "increase" });
  });

  it("rule-14 (AC11) (2) RIR 0 at top reps: hold once, then step up, then RIR 0 again holds", () => {
    const history = replay("bench-press", MAIN, LIBRARY, [
      { date: "2026-09-14", entries: top(80, 8, [0, 1, 0]), next: [80, 8, "hold_effort"] },
      { date: "2026-09-17", entries: top(80, 8, [0, 0, 0]), next: [82.5, 6, "increase"] },
      // The user lifts 82.5 for 8 (top reps) at RIR 0: a new W, so a new hold.
      { date: "2026-09-20", entries: top(82.5, 8, [0, 0, 0]), next: [82.5, 8, "hold_effort"] },
      { date: "2026-09-23", entries: top(82.5, 8, [1, 0, 1]), next: [85, 6, "increase"] },
    ]);
    const item = suggestedItem(history, LIBRARY, "bench-press", at("2026-09-24"));
    expect(item.prefill).toEqual({ weightKg: 85, reps: 6, durationS: null, kind: "increase" });
    // After the first hold session alone, suggest shows the hold with its reason kind.
    const early = history.filter((s) => s.sessionId === "s0");
    const held = suggestedItem(early, LIBRARY, "bench-press", at("2026-09-15"));
    expect(held.prefill).toEqual({ weightKg: 80, reps: 8, durationS: null, kind: "hold_effort" });
    expect(held.reasons).toContainEqual({ code: "prefill", kind: "hold_effort" });
  });

  it("rule-14 (AC11) (3) a step change from 2.5 to 1.25 mid-history, then a 10-day break beats RIR", () => {
    const steps25 = withSteps({ "lateral-raise": 2.5 });
    const steps125 = withSteps({ "lateral-raise": 1.25 });
    const s = (date: string, w: number, rir: unknown): { date: string; entries: RirEntry[] } => ({
      date,
      entries: top(w, 15, [rir, rir, rir]),
    });
    // Session 1 under 2.5: next is W + 2.5. The step then changes to 1.25: W is the weight
    // actually lifted (22.5, off the new grid is fine), the next pre-fill is W + 1.25.
    const first = s("2026-09-12", 20, null);
    const h1 = replay("lateral-raise", ISOLATION, steps25, [
      { ...first, next: [22.5, 10, "increase"] },
    ]);
    const p = (h: HistorySet[], now: string, l = steps125): PrefillResult =>
      prefill(lib(l, "lateral-raise"), ISOLATION, h, l, at(now), TZ, null);
    expect(p(h1, "2026-09-13")).toEqual({
      weightKg: 21.25,
      reps: 10,
      durationS: null,
      kind: "increase",
    });
    const h2 = [
      ...h1,
      ...rirSession("2026-09-15", "lateral-raise", s("2026-09-15", 22.5, 3).entries).map(
        (r, k) => ({
          ...r,
          sessionId: "s1",
          clientId: `x1-${k}`,
        }),
      ),
    ];
    expect(p(h2, "2026-09-16")).toEqual({
      weightKg: 23.75,
      reps: 10,
      durationS: null,
      kind: "increase",
    });
    const h3 = [
      ...h2,
      ...rirSession("2026-09-18", "lateral-raise", s("2026-09-18", 23.75, 0).entries).map(
        (r, k) => ({
          ...r,
          sessionId: "s2",
          clientId: `x2-${k}`,
        }),
      ),
    ];
    // RIR 0 at top reps, one day later: hold_effort at the new step.
    expect(p(h3, "2026-09-19")).toEqual({
      weightKg: 23.75,
      reps: 15,
      durationS: null,
      kind: "hold_effort",
    });
    // 10 days off (09-28): steps 2-3 win, RIR is not read.
    expect(p(h3, "2026-09-28")).toEqual({
      weightKg: 23.75,
      reps: 10,
      durationS: null,
      kind: "hold_after_break",
    });
    // 21 days off: reentry on the grid of the new step: floorInc(0.9 × 23.75 = 21.375, 1.25) = 21.25.
    expect(p(h3, "2026-10-09")).toEqual({
      weightKg: 21.25,
      reps: 10,
      durationS: null,
      kind: "reentry",
    });
    // suggest agrees with prefill (same effective library) for the break.
    const item = suggestedItem(h3, steps125, "lateral-raise", at("2026-09-28"));
    expect(item.prefill).toEqual({
      weightKg: 23.75,
      reps: 10,
      durationS: null,
      kind: "hold_after_break",
    });
  });
});
