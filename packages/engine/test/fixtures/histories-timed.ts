// T-0219 UF-08.2 UF-09.5: a simulated 14-day history with a progressing timed exercise
// (engine-rules §Required tests, D-0092). At F-tz (Europe/Stockholm, now
// 2026-09-27T12:00:00+02:00, window 09-14…09-27).
import type { HistorySet } from "../../src/index.js";
import { setsOn, setsWithReps } from "./common.js";

/** The plank duration logged in each `timedCoreHistory` session (every set, 3 per session). */
export const TIMED_CORE_DURATIONS = {
  "2026-09-20": 100,
  "2026-09-22": 105,
  "2026-09-24": 110,
  "2026-09-26": 115,
} as const;

/** One session at 18:00: 3 × bench-press 50 × 8, 3 × barbell-row 50 × 8, 3 × plank at `d` s. */
export function timedCoreSession(date: string, d: number): HistorySet[] {
  const o = { time: "18:00" };
  return [
    ...setsOn(3, "bench-press", date, o),
    ...setsOn(3, "barbell-row", date, o),
    ...setsWithReps(date, "plank", [{ durationS: d }, { durationS: d }, { durationS: d }], o),
  ];
}

/** T-0219 AC9: 4 sessions, 09-20 … 09-26; the last plank session's `min` is 115 s. */
export const timedCoreHistory: HistorySet[] = Object.entries(TIMED_CORE_DURATIONS).flatMap(
  ([date, d]) => timedCoreSession(date, d),
);
