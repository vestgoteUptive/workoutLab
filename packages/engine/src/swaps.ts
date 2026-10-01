// Rule 12 swap ranking (UF-08.3, UF-05.1; D-0025, D-0037 §2, D-0056 §1–§7). Pure: one
// ranked list the UI renders without re-sorting. Rule 13's shuffle (session.ts) reuses the
// `variety` ranking through `rankAgainst`.
import { availableS, isEligible, itemCostS, realEquipment } from "./cost.js";
import {
  indexLibrary,
  isHardSet,
  normalizeHistory,
  primaryAreas,
  recentSessionIds,
  weightsOf,
} from "./history.js";
import { recoveringAreas } from "./load.js";
import { plannedDurationFrom } from "./prefill.js";
import { localDate } from "./time.js";
import type {
  Area,
  EngineProfile,
  HistorySet,
  Instant,
  LibraryExercise,
  LocalDate,
  SwapCandidate,
  SwapReason,
  TimeZone,
  Workout,
} from "./types.js";

/** The `SwapReason` values (D-0037 §2). */
export const SWAP_REASONS: readonly SwapReason[] = [
  "equipment_taken",
  "discomfort",
  "variety",
  "short_on_time",
];

const round3 = (x: number): number => Math.round(x * 1000) / 1000;

/**
 * Rule 12: `Σ min(w_cur, w_alt) / Σ w_cur` over the current exercise's areas, rounded to 3
 * decimals so equal matches tie exactly (D-0056 §1). In [0, 1]; 0 when `cur` has no areas.
 */
export function muscleMatch(cur: LibraryExercise, alt: LibraryExercise): number {
  let num = 0;
  let den = 0;
  for (const [a, w] of weightsOf(cur)) {
    den += w;
    num += Math.min(w, Math.max(0, alt.areas[a] ?? 0));
  }
  return den === 0 ? 0 : round3(num / den);
}

/** What ranking needs from history and profile, computed once per call (or per `suggest`). */
export interface SwapContext {
  lib: Map<string, LibraryExercise>;
  /** Eligible exercises, id-sorted. `suggest` passes its own pool (with `excludeIds`). */
  pool: readonly LibraryExercise[];
  recovering: ReadonlySet<Area>;
  /** Exercise ids in the most recent session (D-0040 §9, D-0056 §7). */
  recentIds: ReadonlySet<string>;
  /** Latest local date of a hard set per exercise, over the whole passed history (D-0056 §6). */
  lastDone: ReadonlyMap<string, LocalDate>;
  /** A timed exercise's planned duration (D-0092 §1), so `timeCostS` uses it (D-0092 §2). */
  durationOf: (ex: LibraryExercise) => number | null;
}

/** The slot being replaced (D-0056 §2). */
export interface SwapSlot {
  sets: number;
  isMain: boolean;
}

function byIdStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Latest hard-set local date per exercise, anywhere in `history` (D-0056 §6). */
export function lastDoneDates(
  history: readonly HistorySet[],
  lib: ReadonlyMap<string, LibraryExercise>,
  tz: TimeZone,
): Map<string, LocalDate> {
  const out = new Map<string, LocalDate>();
  for (const s of normalizeHistory(history)) {
    if (!isHardSet(s, lib.get(s.exerciseId))) continue;
    const d = localDate(s.completedAt, tz);
    const prev = out.get(s.exerciseId);
    if (prev === undefined || d > prev) out.set(s.exerciseId, d);
  }
  return out;
}

function sharedCount(a: readonly string[], b: ReadonlySet<string>): number {
  return realEquipment(a).filter((e) => b.has(e)).length;
}

const isGuided = (ex: LibraryExercise): boolean =>
  realEquipment(ex.equipment).some((e) => e === "machine" || e === "cable");

interface Row {
  ex: LibraryExercise;
  mm: number;
  timeCostS: number;
  shared: number;
}

/**
 * Rule 12 candidates and sort for replacing `cur` at `slot`, given the ids already in the
 * session (`planIds`, which includes `cur`). Returns the rows in rank order; `fits` decides
 * `fitsBudget` from a candidate's `timeCostS`.
 */
export function rankAgainst(
  ctx: SwapContext,
  cur: LibraryExercise,
  slot: SwapSlot,
  planIds: ReadonlySet<string>,
  reason: SwapReason | null,
  fits: (timeCostS: number) => boolean,
): SwapCandidate[] {
  const curPrimary = new Set(primaryAreas(cur));
  const curEquipment = new Set(realEquipment(cur.equipment));
  let rows: Row[] = ctx.pool
    .filter(
      (e) =>
        e.kind === "exercise" &&
        !planIds.has(e.id) &&
        e.id !== cur.id &&
        (!slot.isMain || e.type === "compound") &&
        primaryAreas(e).some((a) => curPrimary.has(a)) &&
        // Rule 6 is absolute: no recovering area at weight 1.0 (D-0056 §9).
        !primaryAreas(e).some((a) => ctx.recovering.has(a)),
    )
    .map((ex) => ({
      ex,
      mm: muscleMatch(cur, ex),
      timeCostS: itemCostS(ex, slot.sets, ctx.durationOf(ex)),
      shared: sharedCount(ex.equipment, curEquipment),
    }));

  const mmThenId = (x: Row, y: Row): number => y.mm - x.mm || byIdStr(x.ex.id, y.ex.id);
  let cmp: (x: Row, y: Row) => number;
  switch (reason) {
    case null: {
      const sameType = (r: Row): number => (r.ex.type === cur.type ? 0 : 1);
      const recent = (r: Row): number => (ctx.recentIds.has(r.ex.id) ? 1 : 0);
      cmp = (x, y) =>
        y.mm - x.mm ||
        sameType(x) - sameType(y) ||
        recent(x) - recent(y) ||
        byIdStr(x.ex.id, y.ex.id);
      break;
    }
    case "equipment_taken": {
      const free = rows.filter((r) => r.shared === 0);
      // If dropping the sharers drops everything, keep all and sort by fewest shared.
      if (free.length > 0) rows = free;
      cmp = (x, y) => x.shared - y.shared || mmThenId(x, y);
      break;
    }
    case "discomfort": {
      const sharesAny = (r: Row): number => (r.shared > 0 ? 1 : 0);
      const guided = (r: Row): number => (isGuided(r.ex) ? 0 : 1);
      cmp = (x, y) => sharesAny(x) - sharesAny(y) || guided(x) - guided(y) || mmThenId(x, y);
      break;
    }
    case "variety": {
      cmp = (x, y) => {
        const dx = ctx.lastDone.get(x.ex.id);
        const dy = ctx.lastDone.get(y.ex.id);
        if (dx === undefined && dy !== undefined) return -1;
        if (dx !== undefined && dy === undefined) return 1;
        if (dx !== undefined && dy !== undefined && dx !== dy) return dx < dy ? -1 : 1;
        return mmThenId(x, y);
      };
      break;
    }
    case "short_on_time": {
      cmp = (x, y) => x.timeCostS - y.timeCostS || mmThenId(x, y);
      break;
    }
    default:
      throw new RangeError(`Unknown swap reason: ${String(reason)}`);
  }

  return [...rows].sort(cmp).map((r, i) => ({
    exerciseId: r.ex.id,
    muscleMatch: r.mm,
    timeCostS: r.timeCostS,
    equipment: [...r.ex.equipment],
    fitsBudget: fits(r.timeCostS),
    bestMatch: i === 0,
  }));
}

/**
 * Rule 12 (UF-08.3, UF-05.1): the ranked alternatives for the item `currentExerciseId` in
 * `session` (D-0056 §2). Throws `RangeError` when that id isn't an item of the plan or isn't
 * in `library`, or when `reason` isn't a `SwapReason` or null. `excludeIds` is the caller's.
 */
export function rankSwaps(
  currentExerciseId: string,
  reason: SwapReason | null,
  session: Workout,
  profile: Pick<EngineProfile, "level" | "equipment">,
  library: readonly LibraryExercise[],
  history: readonly HistorySet[],
  now: Instant,
  tz: TimeZone,
): SwapCandidate[] {
  if (reason !== null && !SWAP_REASONS.includes(reason)) {
    throw new RangeError(`Unknown swap reason: ${String(reason)}`);
  }
  const slot = session.plan.items.find((i) => i.exerciseId === currentExerciseId);
  if (slot === undefined) {
    throw new RangeError(`${currentExerciseId} is not an item of the session`);
  }
  const lib = indexLibrary(library);
  const cur = lib.get(currentExerciseId);
  if (cur === undefined) throw new RangeError(`${currentExerciseId} is not in the library`);

  const hard = normalizeHistory(history);
  const today = localDate(now, tz);
  const ctx: SwapContext = {
    lib,
    pool: [...lib.values()]
      .filter((e) => isEligible(e, profile))
      .sort((a, b) => byIdStr(a.id, b.id)),
    recovering: new Set(recoveringAreas(history, library, now)),
    recentIds: recentSessionIds(history, library, today, tz),
    lastDone: lastDoneDates(history, lib, tz),
    durationOf: (ex) => plannedDurationFrom(ex, hard, lib, today, tz),
  };
  const planIds = new Set(session.plan.items.map((i) => i.exerciseId));
  const available = availableS(session.budgetMin, session.warmupInBudget);
  return rankAgainst(
    ctx,
    cur,
    { sets: slot.sets, isMain: slot.isMain },
    planIds,
    reason,
    (cost) => session.itemsTotalS - slot.costS + cost <= available,
  );
}
