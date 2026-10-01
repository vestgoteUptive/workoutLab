// Rule 14: progression and pre-fill (UF-09.3, UF-09.4, UF-08.2; D-0026, D-0057, D-0062).
// Pure: `now` and `tz` are inputs, and the history is normalised per rule 0 before use.
import { DEFAULT_INCREMENT_KG, floorInc } from "./energy.js";
import { indexLibrary, isHardSet, normalizeHistory, primaryAreas } from "./history.js";
import { dayDiff, instantMs, localDate } from "./time.js";
import type {
  HistorySet,
  Instant,
  LibraryExercise,
  LocalDate,
  PrefillResult,
  TimeZone,
} from "./types.js";

/** Rule 14 step 2: `gap ≥ 21` days is a re-entry. */
export const REENTRY_GAP_DAYS = 21;
/** Rule 14 step 3: `gap ≥ 10` days holds the last weight (or duration). */
export const HOLD_GAP_DAYS = 10;
/** Rule 14 timed branch: `+ 5 s` per session … */
export const TIMED_STEP_S = 5;
/** … capped at 120 s … */
export const TIMED_MAX_S = 120;
/** … and never below 15 s. */
export const TIMED_MIN_S = 15;
/** Rule 14 steps 2 and 5 take `floorInc(0.9 × W)` (the same factor as the rule 7.4 back-off). */
const DROP_FACTOR = 0.9;

/** The rule 7.2 rep range of one slot; both null for a timed exercise (D-0057 §1). */
export interface PrefillSlot {
  repsMin: number | null;
  repsMax: number | null;
}

/** The slot's previous exercise and its pre-fill weight, for step 1's `carry` (D-0057 §1). */
export interface PrefillPrevious {
  exerciseId: string;
  weightKg: number | null;
}

const round3 = (x: number): number => Math.round(x * 1000) / 1000;

/** `floor5(x) = floor(round3(x) / 5) × 5` (D-0057 §6), with floorInc's float guard. */
export function floor5(x: number): number {
  if (!Number.isFinite(x)) throw new RangeError(`floor5 needs a finite x, got ${x}`);
  return Math.floor(round3(x) / 5 + 1e-9) * 5;
}

function assertSlot(exercise: LibraryExercise, slot: PrefillSlot): void {
  const { repsMin, repsMax } = slot;
  if ((repsMin === null) !== (repsMax === null)) {
    throw new RangeError(`repsMin and repsMax must both be null or both set (${exercise.id})`);
  }
  if (exercise.timed) {
    if (repsMin !== null) throw new RangeError(`timed ${exercise.id} takes a null rep range`);
    return;
  }
  if (repsMin === null || repsMax === null) {
    throw new RangeError(`non-timed ${exercise.id} needs a rep range`);
  }
  if (!Number.isInteger(repsMin) || !Number.isInteger(repsMax) || repsMin < 1) {
    throw new RangeError(`rep range must be integers ≥ 1, got ${repsMin}–${repsMax}`);
  }
  if (repsMin > repsMax) throw new RangeError(`repsMin ${repsMin} > repsMax ${repsMax}`);
}

function assertPrevious(previous: PrefillPrevious | null): void {
  if (previous === null) return;
  const w = previous.weightKg;
  if (w !== null && (!Number.isFinite(w) || w < 0)) {
    throw new RangeError(`previous.weightKg must be null or a finite number ≥ 0, got ${w}`);
  }
}

/** One session's hard sets of the exercise, with its recency key (D-0040 §9, D-0057 §5). */
interface SessionSets {
  sessionId: string;
  lastMs: number;
  lastInstant: Instant;
  sets: HistorySet[];
}

/** Sessions containing hard sets of `exerciseId`, most recent first (ties: smaller id). */
function sessionsOf(
  exerciseId: string,
  hard: readonly HistorySet[],
  lib: ReadonlyMap<string, LibraryExercise>,
): SessionSets[] {
  const bySession = new Map<string, SessionSets>();
  for (const s of hard) {
    if (s.exerciseId !== exerciseId || !isHardSet(s, lib.get(s.exerciseId))) continue;
    const ms = instantMs(s.completedAt);
    const cur = bySession.get(s.sessionId);
    if (cur === undefined) {
      bySession.set(s.sessionId, {
        sessionId: s.sessionId,
        lastMs: ms,
        lastInstant: s.completedAt,
        sets: [s],
      });
    } else {
      cur.sets.push(s);
      if (ms > cur.lastMs) {
        cur.lastMs = ms;
        cur.lastInstant = s.completedAt;
      }
    }
  }
  return [...bySession.values()].sort(
    (a, b) =>
      b.lastMs - a.lastMs || (a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0),
  );
}

/** `W` and the reps of the usable sets at `W` for one session (D-0057 §2–§3). */
interface AtW {
  w: number;
  reps: number[];
}

function atW(exercise: LibraryExercise, sets: readonly HistorySet[]): AtW | null {
  let w: number;
  if (exercise.externalLoad) {
    const weights = sets.map((s) => s.weightKg).filter((x): x is number => x !== null);
    if (weights.length === 0) return null;
    w = Math.max(...weights);
  } else {
    w = 0;
  }
  const reps = sets
    .filter((s) => s.reps !== null && (!exercise.externalLoad || s.weightKg === w))
    .map((s) => s.reps as number);
  return reps.length === 0 ? null : { w, reps };
}

/** Step 1: `carry` when the previous exercise qualifies, otherwise `first_time`. */
function stepOne(
  exercise: LibraryExercise,
  slot: PrefillSlot,
  lib: ReadonlyMap<string, LibraryExercise>,
  previous: PrefillPrevious | null,
): PrefillResult {
  if (exercise.timed) {
    return { weightKg: null, reps: null, durationS: exercise.defaultDurationS, kind: "first_time" };
  }
  const carried = carryWeight(exercise, lib, previous);
  if (carried !== null) {
    return { weightKg: carried, reps: slot.repsMin, durationS: null, kind: "carry" };
  }
  return {
    weightKg: exercise.externalLoad ? null : 0,
    reps: slot.repsMin,
    durationS: null,
    kind: "first_time",
  };
}

/**
 * Rule 14 step 1 carry (D-0057 §1, D-0062 §1): the previous exercise is a known library
 * exercise sharing a weight-1.0 area and an equipment item (`[]` ≡ `["none"]`, D-0040 §1),
 * its pre-fill weight is > 0, and this exercise takes an external load.
 */
function carryWeight(
  exercise: LibraryExercise,
  lib: ReadonlyMap<string, LibraryExercise>,
  previous: PrefillPrevious | null,
): number | null {
  if (previous === null || previous.weightKg === null || previous.weightKg <= 0) return null;
  if (!exercise.externalLoad) return null;
  const prev = lib.get(previous.exerciseId);
  if (prev === undefined || prev.kind !== "exercise") return null;
  const mine = primaryAreas(exercise);
  if (!primaryAreas(prev).some((a) => mine.includes(a))) return null;
  const eq = (e: LibraryExercise): readonly string[] =>
    e.equipment.length ? e.equipment : ["none"];
  const myEq = eq(exercise);
  if (!eq(prev).some((x) => myEq.includes(x))) return null;
  return round3(previous.weightKg);
}

function timedPrefill(
  exercise: LibraryExercise,
  last: SessionSets,
  gap: number,
  slot: PrefillSlot,
  lib: ReadonlyMap<string, LibraryExercise>,
  previous: PrefillPrevious | null,
): PrefillResult {
  const durations = last.sets.map((s) => s.durationS).filter((d): d is number => d !== null);
  if (durations.length === 0) return stepOne(exercise, slot, lib, previous);
  const min = Math.min(...durations);
  const clamp = (d: number): number => Math.min(TIMED_MAX_S, Math.max(TIMED_MIN_S, d));
  const out = (durationS: number, kind: PrefillResult["kind"]): PrefillResult => ({
    weightKg: null,
    reps: null,
    durationS,
    kind,
  });
  if (gap >= REENTRY_GAP_DAYS) return out(clamp(floor5(DROP_FACTOR * min)), "reentry");
  if (gap >= HOLD_GAP_DAYS) return out(clamp(min), "hold_after_break");
  const next = clamp(min + TIMED_STEP_S);
  return out(next, next > min ? "add_rep" : "hold");
}

/** Internal rule 14 over an already-normalised history and today's local date. */
export function prefillFrom(
  exercise: LibraryExercise,
  slot: PrefillSlot,
  hard: readonly HistorySet[],
  lib: ReadonlyMap<string, LibraryExercise>,
  today: LocalDate,
  tz: TimeZone,
  previous: PrefillPrevious | null,
): PrefillResult {
  const sessions = sessionsOf(exercise.id, hard, lib);
  const last = sessions[0];
  if (last === undefined) return stepOne(exercise, slot, lib, previous);
  // D-0057 §9: a future-dated session is still the last performance, at gap 0.
  const gap = Math.max(0, dayDiff(localDate(last.lastInstant, tz), today));
  if (exercise.timed) return timedPrefill(exercise, last, gap, slot, lib, previous);

  const low = slot.repsMin as number;
  const high = slot.repsMax as number;
  const cur = atW(exercise, last.sets);
  if (cur === null) return stepOne(exercise, slot, lib, previous);
  const loaded = exercise.externalLoad;
  const inc = exercise.incrementKg ?? DEFAULT_INCREMENT_KG;
  const W = cur.w;
  // D-0057 §4: one increment is the floor when W > 0; W = 0 stays 0 (and always for bodyweight).
  const dropped = loaded && W > 0 ? round3(Math.max(inc, floorInc(DROP_FACTOR * W, inc))) : 0;
  const res = (weightKg: number, reps: number, kind: PrefillResult["kind"]): PrefillResult => ({
    weightKg: round3(weightKg),
    reps,
    durationS: null,
    kind,
  });
  const minReps = Math.min(...cur.reps);

  if (gap >= REENTRY_GAP_DAYS) return res(dropped, low, "reentry");
  if (gap >= HOLD_GAP_DAYS) return res(W, low, "hold_after_break");
  if (cur.reps.every((r) => r >= high)) {
    return loaded ? res(W + inc, low, "increase") : res(0, high, "increase");
  }
  if (minReps < low) {
    const prior = sessions[1];
    const before = prior === undefined ? null : atW(exercise, prior.sets);
    if (before !== null && before.w === W && Math.min(...before.reps) < low) {
      return res(dropped, low, "deload");
    }
    return res(W, low, "hold");
  }
  return res(W, Math.min(high, minReps + 1), "add_rep");
}

/**
 * Rule 14 pre-fill (UF-09.3, UF-09.4, UF-08.2; D-0026, D-0057). The 7-step waterfall over
 * the last performance of `exercise` in `history` (rule 0 normalised), with the timed branch
 * and step 1's `carry` from `previous`. Throws `RangeError` on an invalid slot, `now` without
 * an offset, or a negative `previous.weightKg`.
 */
export function prefill(
  exercise: LibraryExercise,
  slot: PrefillSlot,
  history: readonly HistorySet[],
  library: readonly LibraryExercise[],
  now: Instant,
  tz: TimeZone,
  previous: PrefillPrevious | null,
): PrefillResult {
  assertSlot(exercise, slot);
  assertPrevious(previous);
  const today = localDate(now, tz);
  return prefillFrom(
    exercise,
    slot,
    normalizeHistory(history),
    indexLibrary(library),
    today,
    tz,
    previous,
  );
}

/** Internal `plannedDurationS` over an already-normalised history and today's local date. */
export function plannedDurationFrom(
  exercise: LibraryExercise,
  hard: readonly HistorySet[],
  lib: ReadonlyMap<string, LibraryExercise>,
  today: LocalDate,
  tz: TimeZone,
): number | null {
  if (!exercise.timed) return null;
  // Rule 14's timed branch never reads the slot or `previous` (D-0057 §6, D-0092 §1).
  return prefillFrom(exercise, { repsMin: null, repsMax: null }, hard, lib, today, tz, null)
    .durationS;
}

/**
 * Rule 7.1 planned duration (D-0092 §1): the work of one set of a timed `exercise`, which is
 * the rule 14 pre-fill `durationS` over the same `history`, `now` and `tz` (`defaultDurationS`
 * with no usable history). `null` for a non-timed exercise (or a timed one with no default and
 * no usable history; rule 7.1 then costs 45 s). Throws `RangeError` on `now` without an offset.
 */
export function plannedDurationS(
  exercise: LibraryExercise,
  history: readonly HistorySet[],
  library: readonly LibraryExercise[],
  now: Instant,
  tz: TimeZone,
): number | null {
  const today = localDate(now, tz);
  if (!exercise.timed) return null;
  return plannedDurationFrom(exercise, normalizeHistory(history), indexLibrary(library), today, tz);
}
