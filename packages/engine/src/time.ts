// Time helpers (rule 3, D-0034 §2). Built-in Intl only; never reads the clock.
import type { Instant, LocalDate, TimeZone, Window } from "./types.js";

/** Rolling window length in local days (rule 3). */
export const WINDOW_DAYS = 14;

const DAY_MS = 86_400_000;
const INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Epoch milliseconds for an ISO instant. An offset or `Z` is required, because a bare
 * local time would be parsed in the host's zone and break determinism.
 */
export function instantMs(instant: Instant): number {
  if (!INSTANT_RE.test(instant)) {
    throw new RangeError(`Not an ISO-8601 instant with an offset: ${instant}`);
  }
  const ms = new Date(instant).getTime();
  if (Number.isNaN(ms)) throw new RangeError(`Invalid instant: ${instant}`);
  return ms;
}

// A memo of immutable formatters. It never changes a result, only avoids rebuilding them.
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: TimeZone): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      calendar: "gregory",
      numberingSystem: "latn",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    formatters.set(tz, f);
  }
  return f;
}

/** The local calendar date of `instant` in `tz` (rule 3). */
export function localDate(instant: Instant, tz: TimeZone): LocalDate {
  const parts = formatterFor(tz).formatToParts(instantMs(instant));
  let y = "";
  let m = "";
  let d = "";
  for (const p of parts) {
    if (p.type === "year") y = p.value;
    else if (p.type === "month") m = p.value;
    else if (p.type === "day") d = p.value;
  }
  return `${y.padStart(4, "0")}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function dateUtcMs(date: LocalDate): number {
  const m = DATE_RE.exec(date);
  if (!m) throw new RangeError(`Not a YYYY-MM-DD date: ${date}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** `date` plus `n` calendar days. */
export function addDays(date: LocalDate, n: number): LocalDate {
  const d = new Date(dateUtcMs(date) + n * DAY_MS);
  const y = String(d.getUTCFullYear()).padStart(4, "0");
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

/** Whole calendar days from `from` to `to` (positive when `to` is later). */
export function dayDiff(from: LocalDate, to: LocalDate): number {
  return Math.round((dateUtcMs(to) - dateUtcMs(from)) / DAY_MS);
}

/** The rule-3 window: D−13 … D, where D is the local date of `now` in `tz`. */
export function windowOf(now: Instant, tz: TimeZone): Window {
  const windowEnd = localDate(now, tz);
  return { windowStart: addDays(windowEnd, -(WINDOW_DAYS - 1)), windowEnd };
}
