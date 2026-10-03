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

/** "Sept" -> "Sep"; "Sep", "May" and any non-Latin abbreviation are returned unchanged (CLDR's
 *  `en-GB` `month: "short"` is "Sept" for September only; UF-10's `format.ts` has the same note
 *  and the same fix — not imported across features, D-0071 §3, so re-derived here). */
function shortMonth(value: string): string {
  return /^[A-Za-z]{4,}$/.test(value) ? value.slice(0, 3) : value;
}

/**
 * `2026-09-13` -> `13 Sep` with `Intl.DateTimeFormat(locale, {day: "numeric", month: "short",
 * timeZone})` (T-0308c, UF-11.1's own date format), the month clipped to three letters. Built
 * from the `YYYY-MM-DD` parts at UTC noon, so no `timeZone` reads a neighbouring calendar day: a
 * calendar date has no instant to convert, only a locale's month spelling to pick.
 */
export function formatCalendarDay(ymd: string, locale: string, timeZone: string): string {
  const [yPart, mPart, dPart] = ymd.split("-");
  const noon = new Date(Date.UTC(Number(yPart), Number(mPart) - 1, Number(dPart), 12, 0, 0));
  const parts = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone,
  }).formatToParts(noon);
  return parts
    .map((part) => (part.type === "month" ? shortMonth(part.value) : part.value))
    .join("");
}
