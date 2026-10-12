// UF-02.1 week row (T-0623, D-0212 §1.1): which days of the current Monday-first week have a
// logged working set, and how many sessions they hold. Pure: it reads no clock, `now` and the
// time zone are arguments. Local dates come from Intl (so DST weeks are right); day arithmetic is
// on calendar dates in UTC, which has no DST.
import type { HistorySet } from "@workoutlab/shared";

/** done: a counted set that day. rest: a past day without one. upcoming: a later day. */
export type WeekDayStatus = "done" | "rest" | "upcoming";

export interface WeekDay {
  /** Today is `done` or `null`, never `rest`. */
  status: WeekDayStatus | null;
  isToday: boolean;
  /** Local calendar date, `YYYY-MM-DD`. */
  date: string;
}

export interface WeekRow {
  /** Monday first. */
  days: WeekDay[];
  /** Distinct `sessionId`s among the done days' sets. */
  count: number;
}

export const DAY_MS = 86_400_000;

function dateKey(utcMs: number): string {
  return new Date(utcMs).toISOString().slice(0, 10);
}

/** The local calendar date of `instant` in `timeZone`, as UTC midnight milliseconds. */
export function localDay(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day"));
}

export function weekRow(history: readonly HistorySet[], now: Date, timeZone: string): WeekRow {
  const today = localDay(now, timeZone);
  const monday = today - ((new Date(today).getUTCDay() + 6) % 7) * DAY_MS;
  const dayMs = Array.from({ length: 7 }, (_, i) => monday + i * DAY_MS);
  const keys = dayMs.map(dateKey);
  const doneKeys = new Set<string>();
  const sessions = new Set<string>();
  for (const set of history) {
    if (set.isWarmup || set.deletedAt !== null) continue;
    const at = new Date(set.completedAt);
    if (Number.isNaN(at.getTime())) continue;
    const ms = localDay(at, timeZone);
    if (ms < monday || ms > today) continue;
    doneKeys.add(dateKey(ms));
    sessions.add(set.sessionId);
  }
  const days = dayMs.map<WeekDay>((ms, i) => {
    const isToday = ms === today;
    const done = doneKeys.has(keys[i]!);
    const status: WeekDayStatus | null = done
      ? "done"
      : isToday
        ? null
        : ms < today
          ? "rest"
          : "upcoming";
    return { status, isToday, date: keys[i]! };
  });
  return { days, count: sessions.size };
}

/** The long weekday names of `days`, in `locale` (a calendar date has no zone: UTC). */
export function weekdayNames(days: readonly WeekDay[], locale: string): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" });
  return days.map((d) => fmt.format(new Date(`${d.date}T12:00:00Z`)));
}
