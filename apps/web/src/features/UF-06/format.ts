// Date formatting for UF-06. Local dates are `YYYY-MM-DD` strings already resolved in the
// user's time zone, so they are formatted as UTC noon (no zone can shift them).
//
// D-0084: some ICU builds spell September "Sept" for `en-GB`. The spec strings read "Sep", so
// that one abbreviation is normalised for `en-GB` only, which keeps `25 Sep` exact on every host (D-0079 §10).

function utcNoon(date: string): Date {
  return new Date(
    Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), 12),
  );
}

/** The one locale D-0084 §1 normalises. Every other locale keeps its own spelling (en-AU
 *  writes "Sept" on purpose). */
const SEP_LOCALE = "en-GB";

function shortMonth(parts: Intl.DateTimeFormatPart[]): Intl.DateTimeFormatPart[] {
  return parts.map((p) => (p.type === "month" && p.value === "Sept" ? { ...p, value: "Sep" } : p));
}

function join(dtf: Intl.DateTimeFormat, date: Date): string {
  const parts = dtf.formatToParts(date);
  return (dtf.resolvedOptions().locale === SEP_LOCALE ? shortMonth(parts) : parts)
    .map((p) => p.value)
    .join("");
}

/** `25 Sep`. */
export function formatDayMonth(date: string, locale?: string): string {
  return join(
    new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }),
    utcNoon(date),
  );
}

/** `Fri 25 Sep`. */
export function formatWeekdayDayMonth(date: string, locale?: string): string {
  return join(
    new Intl.DateTimeFormat(locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }),
    utcNoon(date),
  );
}

/** `September 2026`. */
export function formatMonthTitle(year: number, month: number, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1, 12)));
}

/** The seven Monday-first weekday names (`Mon` … `Sun`). */
export function weekdayNames(locale?: string): string[] {
  const dtf = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  // 2026-06-01 is a Monday.
  return Array.from({ length: 7 }, (_, i) => dtf.format(new Date(Date.UTC(2026, 5, 1 + i, 12))));
}
