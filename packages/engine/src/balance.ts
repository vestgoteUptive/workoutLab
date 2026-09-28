// Rule 5 (deficit and attention) and rule 11 (balance output) for UF-10.1, UF-10.2 and
// the C-01 body map on UF-02.1.
import { indexLibrary } from "./history.js";
import { aggregateWindow, recoveringAreas, sumDays } from "./load.js";
import { dayDiff } from "./time.js";
import {
  AREAS,
  type Area,
  type AreaBalance,
  type AreaTarget,
  type BalanceResult,
  type Contributor,
  type CoverageStep,
  type HistorySet,
  type Instant,
  type LibraryExercise,
  type LocalDate,
  type TimeZone,
} from "./types.js";

/** Rule 5 thresholds. */
export const ATTENTION_DEFICIT = 0.5;
export const ATTENTION_DAYS = 6;

/** Rule 5: `max(0, target − load) / target`, unrounded. */
export function deficitOf(load: number, target: number): number {
  return Math.max(0, target - load) / target;
}

/** Rule 11 coverage step. */
export function coverageStepOf(load: number, target: number): CoverageStep {
  if (load === 0) return 0;
  const r = load / target;
  if (r < 0.33) return 1;
  if (r < 0.66) return 2;
  if (r < 1) return 3;
  return 4;
}

/** Rule 5 attention, given whether the window holds any hard set. */
export function needsAttentionOf(
  deficit: number,
  lastTrainedDate: LocalDate | null,
  today: LocalDate,
  windowHasHardSets: boolean,
): boolean {
  if (!windowHasHardSets) return false;
  if (deficit < ATTENTION_DEFICIT) return false;
  return lastTrainedDate === null || dayDiff(lastTrainedDate, today) >= ATTENTION_DAYS;
}

/** D-0034 §6: all 9 areas, each once, with a positive integer `setsPer14d`. */
function indexTargets(targets: readonly AreaTarget[]): Record<Area, AreaTarget> {
  const byArea = new Map<Area, AreaTarget>();
  for (const t of targets) {
    if (!(AREAS as readonly string[]).includes(t.area)) {
      throw new RangeError(`Unknown target area: ${String(t.area)}`);
    }
    if (byArea.has(t.area)) throw new RangeError(`Duplicate target for ${t.area}`);
    if (!Number.isInteger(t.setsPer14d) || t.setsPer14d <= 0) {
      throw new RangeError(`Target for ${t.area} must be a positive integer, got ${t.setsPer14d}`);
    }
    byArea.set(t.area, t);
  }
  const out = {} as Record<Area, AreaTarget>;
  for (const a of AREAS) {
    const t = byArea.get(a);
    if (t === undefined) throw new RangeError(`Missing target for ${a}`);
    out[a] = t;
  }
  return out;
}

/** UTF-16 code-unit comparison (D-0034 §5); never locale-dependent. */
function codeUnitCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Rule 11: `{windowStart, windowEnd, computedAt, areas[9]}`. Pure: the same inputs give a
 * deep-equal result, and inputs are never mutated.
 */
export function balance(
  history: readonly HistorySet[],
  targets: readonly AreaTarget[],
  library: readonly LibraryExercise[],
  now: Instant,
  tz: TimeZone,
): BalanceResult {
  const targetByArea = indexTargets(targets);
  const agg = aggregateWindow(history, library, now, tz);
  const recovering = new Set(recoveringAreas(history, library, now));
  const lib = indexLibrary(library);
  const nameOf = (id: string): string => lib.get(id)?.name ?? id;

  const areas: AreaBalance[] = AREAS.map((area) => {
    const t = targetByArea[area];
    const days = agg.days[area].slice();
    const load = sumDays(days);
    const deficit = deficitOf(load, t.setsPer14d);
    const lastTrainedDate = agg.lastTrainedDate[area];
    const contributors: Contributor[] = [...agg.contributors[area].entries()]
      .map(([exerciseId, acc]) => ({
        exerciseId,
        weightedSets: acc.weightedSets,
        lastDate: acc.lastDate,
      }))
      .sort(
        (a, b) =>
          b.weightedSets - a.weightedSets ||
          codeUnitCompare(nameOf(a.exerciseId), nameOf(b.exerciseId)) ||
          codeUnitCompare(a.exerciseId, b.exerciseId),
      );
    return {
      area,
      load,
      target: t.setsPer14d,
      targetSource: t.source,
      targetUpdatedAt: t.updatedAt,
      deficit,
      coverageStep: coverageStepOf(load, t.setsPer14d),
      needsAttention: needsAttentionOf(
        deficit,
        lastTrainedDate,
        agg.windowEnd,
        agg.windowHasHardSets,
      ),
      recovering: recovering.has(area),
      lastTrainedDate,
      days,
      contributors,
    };
  });

  const order = (a: Area): number => AREAS.indexOf(a);
  areas.sort(
    (a, b) =>
      Number(b.needsAttention) - Number(a.needsAttention) ||
      b.deficit - a.deficit ||
      order(a.area) - order(b.area),
  );

  return { windowStart: agg.windowStart, windowEnd: agg.windowEnd, computedAt: now, areas };
}
