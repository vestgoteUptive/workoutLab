// UF-02.1 latest PR (T-0636, D-0219): the newest `records()` entry (engine rule 15) whose local
// completion date is within the last 14 local days. The engine decides what a record is; this
// only picks the newest and finds its library name. Dates come from `week.ts`'s Intl helper, so a
// DST change inside the window is right.
import { records } from "@workoutlab/engine";
import type { HistorySet, LibraryExercise } from "@workoutlab/shared";
import { DAY_MS, localDay } from "./week.js";

export interface LatestPr {
  name: string;
  weightKg: number | null;
  reps: number | null;
  durationS: number | null;
  timed: boolean;
}

/** Local days back (today included) the line looks: today − 13 … today. */
const WINDOW_DAYS = 14;

export function latestPr(
  history: readonly HistorySet[],
  library: readonly LibraryExercise[],
  now: Date,
  timeZone: string,
): LatestPr | null {
  const from = localDay(now, timeZone) - (WINDOW_DAYS - 1) * DAY_MS;
  const all = records(history, library);
  // `records()` is sorted by completedAt, then clientId: the last element in the window is newest.
  for (let i = all.length - 1; i >= 0; i -= 1) {
    const record = all[i]!;
    if (localDay(new Date(record.completedAt), timeZone) < from) continue;
    const exercise = library.find((e) => e.id === record.exerciseId);
    if (exercise === undefined) continue;
    return {
      name: exercise.name,
      weightKg: record.weightKg,
      reps: record.reps,
      durationS: record.durationS,
      timed: exercise.timed,
    };
  }
  return null;
}
