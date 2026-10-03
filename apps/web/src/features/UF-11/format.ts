// Date and time-zone helpers for UF-11. Dates are built from `YYYY-MM-DD` parts, never with
// `new Date("YYYY-MM-DD")`, which is UTC midnight and reads a day early west of UTC.
import { localDate } from "../../lib/format/intl.js";
import { en } from "../../lib/i18n/en.js";

export function resolveTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** `2026-12-24` -> `24 Dec`. A local calendar date, so no time zone is involved. */
export function formatLocalDay(ymd: string): string {
  const [, month, day] = ymd.split("-");
  return en.uf11.day(Number(day), en.uf11.months[Number(month) - 1] ?? "");
}

/** The local `d MMM` of an instant, in `tz`. */
export function formatInstantDay(iso: string, tz: string): string {
  return formatLocalDay(localDate(iso, tz));
}
