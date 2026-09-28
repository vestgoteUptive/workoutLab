// Rule 3 (window load) and rule 6 (recovery).
import { indexLibrary, isHardSet, normalizeHistory, weightsOf } from "./history.js";
import { dayDiff, instantMs, localDate, windowOf, WINDOW_DAYS } from "./time.js";
import {
  AREAS,
  type Area,
  type AreaNumbers,
  type HistorySet,
  type Instant,
  type LibraryExercise,
  type LocalDate,
  type TimeZone,
} from "./types.js";

/** Recovery: weighted hard sets in `(now − 48 h, now]` summing to ≥ 6 (rule 6). */
export const RECOVERY_WINDOW_MS = 48 * 3_600_000;
export const RECOVERY_THRESHOLD = 6;

interface ContributorAcc {
  weightedSets: number;
  lastDate: LocalDate;
}

/** Everything rules 3, 5 and 11 need from history, per area. */
export interface WindowAggregate {
  windowStart: LocalDate;
  windowEnd: LocalDate;
  days: Record<Area, number[]>;
  lastTrainedDate: Record<Area, LocalDate | null>;
  contributors: Record<Area, Map<string, ContributorAcc>>;
  /** True when at least one hard set lies in the window (rule 5 "no hard sets at all"). */
  windowHasHardSets: boolean;
}

function perArea<T>(make: () => T): Record<Area, T> {
  const out = {} as Record<Area, T>;
  for (const a of AREAS) out[a] = make();
  return out;
}

export function aggregateWindow(
  history: readonly HistorySet[],
  library: readonly LibraryExercise[],
  now: Instant,
  tz: TimeZone,
): WindowAggregate {
  const { windowStart, windowEnd } = windowOf(now, tz);
  const lib = indexLibrary(library);
  const days = perArea(() => new Array<number>(WINDOW_DAYS).fill(0));
  const lastTrainedDate = perArea<LocalDate | null>(() => null);
  const contributors = perArea(() => new Map<string, ContributorAcc>());
  let windowHasHardSets = false;

  for (const set of normalizeHistory(history)) {
    const exercise = lib.get(set.exerciseId);
    if (!isHardSet(set, exercise) || exercise === undefined) continue;
    const date = localDate(set.completedAt, tz);
    // Future local days never count (D-0036): not in load, days or lastTrainedDate.
    if (date > windowEnd) continue;
    const inWindow = date >= windowStart;
    if (inWindow) windowHasHardSets = true;
    const index = dayDiff(windowStart, date);
    for (const [area, w] of weightsOf(exercise)) {
      const last = lastTrainedDate[area];
      if (last === null || date > last) lastTrainedDate[area] = date;
      if (!inWindow) continue;
      days[area][index] = (days[area][index] ?? 0) + w;
      const acc = contributors[area].get(exercise.id);
      if (acc === undefined) {
        contributors[area].set(exercise.id, { weightedSets: w, lastDate: date });
      } else {
        acc.weightedSets += w;
        if (date > acc.lastDate) acc.lastDate = date;
      }
    }
  }
  return { windowStart, windowEnd, days, lastTrainedDate, contributors, windowHasHardSets };
}

export function sumDays(days: readonly number[]): number {
  let s = 0;
  for (const v of days) s += v;
  return s;
}

/** Rule 3: `load(area)` = Σ weighted hard sets in the window, for all 9 areas. */
export function areaLoads(
  history: readonly HistorySet[],
  library: readonly LibraryExercise[],
  now: Instant,
  tz: TimeZone,
): AreaNumbers {
  const agg = aggregateWindow(history, library, now, tz);
  const out = {} as AreaNumbers;
  for (const a of AREAS) out[a] = sumDays(agg.days[a]);
  return out;
}

/** Rule 6: the recovering areas, in the fixed order. Absolute time, so no `tz`. */
export function recoveringAreas(
  history: readonly HistorySet[],
  library: readonly LibraryExercise[],
  now: Instant,
): Area[] {
  const nowMs = instantMs(now);
  const lib = indexLibrary(library);
  const sums = perArea(() => 0);
  for (const set of normalizeHistory(history)) {
    const exercise = lib.get(set.exerciseId);
    if (!isHardSet(set, exercise) || exercise === undefined) continue;
    const t = instantMs(set.completedAt);
    if (t <= nowMs - RECOVERY_WINDOW_MS || t > nowMs) continue;
    for (const [area, w] of weightsOf(exercise)) sums[area] += w;
  }
  return AREAS.filter((a) => sums[a] >= RECOVERY_THRESHOLD);
}
