// UF-06 display aggregations (D-0068 §5, D-0079 §7–§9). Pure and clock-free: every function
// takes `now` and `tz`, none reads the clock or any entropy source. Which sets are "hard",
// which rows survive dedupe and which sessions are "completed" is the engine's call
// (`normalizeHistory`, `isHardSet`, `checkinSessions`); this module only groups and formats.
import {
  addDays,
  estimatedOneRepMax,
  isHardSet,
  localDate,
  normalizeHistory,
  type CheckinSession,
  type HistorySet,
  type LibraryExercise,
} from "@workoutlab/engine";
import { en } from "../../lib/i18n/en.js";
import { perSide, type PerSideWord } from "../../lib/i18n/per-side.js";

/** The cached window is 56 local days: today − 55 … today (D-0034 §3). */
export const WINDOW_DAYS = 56;

export type SetKind = "weighted" | "reps" | "timed";

export interface BestSet {
  kind: SetKind;
  weightKg: number | null;
  reps: number | null;
  durationS: number | null;
  /** The "Best set" label, always with its unit (D-0079 §8). */
  label: string;
}

export interface RecentExercise {
  exerciseId: string;
  name: string;
  /** Local date (YYYY-MM-DD) of the exercise's latest hard set. */
  lastDate: string;
  best: BestSet;
}

export interface HistoryRow {
  sessionId: string;
  /** Local date (YYYY-MM-DD) of the row's first hard set. */
  date: string;
  /** The row's sets as bare text ("102.5 × 5"), in `completedAt` order. */
  sets: string[];
}

export interface ExerciseHistory {
  exercise: LibraryExercise;
  kind: SetKind;
  rows: HistoryRow[];
  best: BestSet | null;
  heaviestKg: number | null;
  sessions: number;
}

export interface MonthCalendar {
  year: number;
  /** 1–12. */
  month: number;
  /** Monday-first weeks of 7 cells: the day of the month, or `null` outside the month. */
  weeks: Array<Array<number | null>>;
  /** Days of the month that hold a completed session, ascending. */
  marked: number[];
  /** The day of the month that is today. */
  today: number;
  /** Completed sessions (rule 9) that started this local month. */
  count: number;
}

function formatNumber(value: number, locale?: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2, useGrouping: false }).format(
    value,
  );
}

function byCompletedAt(a: HistorySet, b: HistorySet): number {
  return (
    (a.completedAt < b.completedAt ? -1 : a.completedAt > b.completedAt ? 1 : 0) ||
    (a.clientId < b.clientId ? -1 : a.clientId > b.clientId ? 1 : 0)
  );
}

/** Every hard set of the window, deduped by the engine, oldest first. */
function windowSets(
  history: readonly HistorySet[],
  library: readonly LibraryExercise[],
  now: Date,
  tz: string,
): HistorySet[] {
  const byId = new Map<string, LibraryExercise>();
  for (const ex of library) if (!byId.has(ex.id)) byId.set(ex.id, ex);
  const first = addDays(localDate(now.toISOString(), tz), -(WINDOW_DAYS - 1));
  return normalizeHistory(history)
    .filter((s) => isHardSet(s, byId.get(s.exerciseId)) && localDate(s.completedAt, tz) >= first)
    .sort(byCompletedAt);
}

/** D-0079 §8: `timed` from the library, else `weighted` if any set has a load, else `reps`. */
function kindOf(sets: readonly HistorySet[], exercise: LibraryExercise): SetKind {
  if (exercise.timed) return "timed";
  return sets.some((s) => (s.weightKg ?? 0) > 0) ? "weighted" : "reps";
}

/** T-0975 (D-0263 §6): the one-side word is appended to each existing format; null adds nothing. */
function formatSet(
  set: HistorySet,
  kind: SetKind,
  locale?: string,
  word?: PerSideWord | null,
): string {
  if (kind === "timed") return en.uf06.seconds(formatNumber(set.durationS ?? 0, locale), word);
  const reps = formatNumber(set.reps ?? 0, locale);
  if (kind === "reps") return reps + perSide(word);
  return en.uf06.weightedSet(formatNumber(set.weightKg ?? 0, locale), reps, word);
}

function labelOf(
  set: HistorySet,
  kind: SetKind,
  locale?: string,
  word?: PerSideWord | null,
): string {
  const reps = formatNumber(set.reps ?? 0, locale);
  if (kind === "timed") return en.uf06.seconds(formatNumber(set.durationS ?? 0, locale), word);
  if (kind === "reps") return en.uf06.repsBest(reps, word);
  return en.uf06.weightedBest(formatNumber(set.weightKg ?? 0, locale), reps, word);
}

/**
 * D-0068 §5: the highest `weightKg`, then the most reps at that weight; bodyweight is the most
 * reps; timed is the longest `durationS`. Warm-up, tombstoned and unknown-exercise rows are
 * ignored (via `normalizeHistory` + `isHardSet`); `null` when no hard set is left.
 * `options.kind` lets a caller fix the format when `sets` is only part of the exercise's window.
 */
export function bestSet(
  sets: readonly HistorySet[],
  exercise: LibraryExercise,
  options: {
    kind?: SetKind;
    locale?: string | undefined;
    unilateral?: PerSideWord | null | undefined;
  } = {},
): BestSet | null {
  const hard = normalizeHistory(sets).filter((s) => isHardSet(s, exercise));
  if (hard.length === 0) return null;
  const kind = options.kind ?? kindOf(hard, exercise);
  let best = hard[0]!;
  for (const s of hard.slice(1)) {
    const better =
      kind === "timed"
        ? (s.durationS ?? 0) > (best.durationS ?? 0)
        : kind === "reps"
          ? (s.reps ?? 0) > (best.reps ?? 0)
          : (s.weightKg ?? 0) > (best.weightKg ?? 0) ||
            ((s.weightKg ?? 0) === (best.weightKg ?? 0) && (s.reps ?? 0) > (best.reps ?? 0));
    if (better) best = s;
  }
  return {
    kind,
    weightKg: best.weightKg,
    reps: best.reps,
    durationS: best.durationS,
    label: labelOf(best, kind, options.locale, options.unilateral),
  };
}

/** The current local month of `now`: Monday-first weeks, marked days and the workout count. */
export function monthCalendar(
  checkinSessions: readonly CheckinSession[],
  now: Date,
  tz: string,
): MonthCalendar {
  const today = localDate(now.toISOString(), tz);
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const prefix = today.slice(0, 7);
  const marked = new Set<number>();
  let count = 0;
  for (const s of checkinSessions) {
    if (s.hardSetCount < 1) continue;
    const date = localDate(s.startedAt, tz);
    if (!date.startsWith(prefix)) continue;
    count += 1;
    marked.add(Number(date.slice(8, 10)));
  }
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const cells: Array<number | null> = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: Array<Array<number | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return {
    year,
    month,
    weeks,
    marked: [...marked].sort((a, b) => a - b),
    today: Number(today.slice(8, 10)),
    count,
  };
}

/** Every exercise with a hard set in the window, most recent first, then by name (D-0079 §9). */
export function recentExercises(
  history: readonly HistorySet[],
  library: readonly LibraryExercise[],
  now: Date,
  tz: string,
  locale?: string,
): RecentExercise[] {
  const byId = new Map<string, LibraryExercise>();
  for (const ex of library) if (!byId.has(ex.id)) byId.set(ex.id, ex);
  const perExercise = new Map<string, HistorySet[]>();
  for (const s of windowSets(history, library, now, tz)) {
    const list = perExercise.get(s.exerciseId);
    if (list) list.push(s);
    else perExercise.set(s.exerciseId, [s]);
  }
  const out: RecentExercise[] = [];
  for (const [exerciseId, sets] of perExercise) {
    const exercise = byId.get(exerciseId)!;
    const kind = kindOf(sets, exercise);
    // The latest session: the one holding the greatest `completedAt`, ties to the smaller id.
    let latest = sets[0]!;
    for (const s of sets) {
      if (
        s.completedAt > latest.completedAt ||
        (s.completedAt === latest.completedAt && s.sessionId < latest.sessionId)
      ) {
        latest = s;
      }
    }
    const best = bestSet(
      sets.filter((s) => s.sessionId === latest.sessionId),
      exercise,
      { kind, locale },
    );
    if (best === null) continue;
    out.push({
      exerciseId,
      name: exercise.name,
      lastDate: localDate(latest.completedAt, tz),
      best,
    });
  }
  return out.sort(
    (a, b) =>
      (a.lastDate < b.lastDate ? 1 : a.lastDate > b.lastDate ? -1 : 0) ||
      a.name.localeCompare(b.name),
  );
}

/** One exercise's window: session rows newest first, plus Best set, Heaviest and Sessions.
 *  `null` for an id that isn't a known non-warm-up exercise. */
export function exerciseHistory(
  exerciseId: string,
  history: readonly HistorySet[],
  library: readonly LibraryExercise[],
  now: Date,
  tz: string,
  locale?: string,
  unilateral?: PerSideWord | null,
): ExerciseHistory | null {
  const exercise = library.find((ex) => ex.id === exerciseId);
  if (exercise === undefined || exercise.kind !== "exercise") return null;
  const sets = windowSets(history, library, now, tz).filter((s) => s.exerciseId === exerciseId);
  const kind = kindOf(sets, exercise);
  const perSession = new Map<string, HistorySet[]>();
  for (const s of sets) {
    const list = perSession.get(s.sessionId);
    if (list) list.push(s);
    else perSession.set(s.sessionId, [s]);
  }
  const groups = [...perSession.entries()]
    .map(([sessionId, list]) => ({ sessionId, list }))
    .sort(
      (a, b) =>
        (a.list[0]!.completedAt < b.list[0]!.completedAt
          ? 1
          : a.list[0]!.completedAt > b.list[0]!.completedAt
            ? -1
            : 0) || (a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0),
    );
  const rows: HistoryRow[] = groups.map(({ sessionId, list }) => ({
    sessionId,
    date: localDate(list[0]!.completedAt, tz),
    sets: list.map((s) => formatSet(s, kind, locale, unilateral)),
  }));
  const loads = sets.map((s) => s.weightKg ?? 0).filter((w) => w > 0);
  return {
    exercise,
    kind,
    rows,
    best: bestSet(sets, exercise, { kind, locale, unilateral }),
    heaviestKg: loads.length > 0 ? Math.max(...loads) : null,
    sessions: rows.length,
  };
}

/** A plain number the way the cards print it (at most 2 fraction digits, no grouping). */
export function formatWeight(value: number, locale?: string): string {
  return formatNumber(value, locale);
}

export interface E1rmChartPoint {
  /** Local date (YYYY-MM-DD) of the session's best set. */
  date: string;
  weightKg: number;
  reps: number;
  /** The engine's unrounded estimate (rule 16); rounded only for text. */
  e1rm: number;
}

/**
 * UF-06.2: the engine's rule-16 points of one exercise inside the 56-day window, oldest first,
 * each placed on the local date of its best set (D-0258). No formula here: values are the engine's.
 */
export function e1rmSeries(
  exerciseId: string,
  history: readonly HistorySet[],
  library: readonly LibraryExercise[],
  now: Date,
  tz: string,
): E1rmChartPoint[] {
  const first = addDays(localDate(now.toISOString(), tz), -(WINDOW_DAYS - 1));
  return estimatedOneRepMax(history, library, exerciseId)
    .map((p) => ({
      date: localDate(p.completedAt, tz),
      weightKg: p.weightKg,
      reps: p.reps,
      e1rm: p.e1rm,
    }))
    .filter((p) => p.date >= first);
}
