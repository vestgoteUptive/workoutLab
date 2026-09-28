// Intl-only date/time helpers (NFR-I18N-2). No date library: package.json stays clean.

/** The offset, in minutes east of UTC, of `timeZone` at instant `utcMillis`. */
function offsetMinutesAt(utcMillis: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(new Date(utcMillis)).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUtc - utcMillis) / 60000;
}

/** The UTC instant (millis) of local wall-clock `y-m-d hh:mm:ss` in `timeZone`. */
function zonedWallTimeToUtc(
  y: number,
  m: number,
  d: number,
  hh: number,
  mm: number,
  ss: number,
  timeZone: string,
): number {
  let utc = Date.UTC(y, m - 1, d, hh, mm, ss);
  for (let i = 0; i < 2; i += 1) {
    const offset = offsetMinutesAt(utc, timeZone);
    utc = Date.UTC(y, m - 1, d, hh, mm, ss) - offset * 60000;
  }
  return utc;
}

/** `iso` rendered as `YYYY-MM-DD` in `timeZone`'s local calendar date. */
export function localDate(iso: string, timeZone: string): string {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** `iso` rendered as a locale/tz clock time, with narrow/no-break spaces normalised to a plain space. */
export function formatTime(iso: string, options: { locale: string; timeZone: string }): string {
  const dtf = new Intl.DateTimeFormat(options.locale, {
    timeZone: options.timeZone,
    hour: "numeric",
    minute: "2-digit",
  });
  const narrowNoBreakSpace = String.fromCharCode(0x202f);
  const noBreakSpace = String.fromCharCode(0x00a0);
  return dtf
    .format(new Date(iso))
    .split(narrowNoBreakSpace)
    .join(" ")
    .split(noBreakSpace)
    .join(" ");
}

/**
 * The UTC instant of local midnight, `days` local days before (and including) `nowIso`'s
 * local calendar day in `timeZone`. `windowStartInstant(now, tz, 56)` is the start of a
 * 56-local-day window ending on `now`'s local day (D-0034 §3).
 */
export function windowStartInstant(nowIso: string, timeZone: string, days: number): string {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(new Date(nowIso)).map((p) => [p.type, p.value]));
  const todayUtcMillis = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  const startUtcMillis = todayUtcMillis - (days - 1) * 86_400_000;
  const start = new Date(startUtcMillis);
  const instant = zonedWallTimeToUtc(
    start.getUTCFullYear(),
    start.getUTCMonth() + 1,
    start.getUTCDate(),
    0,
    0,
    0,
    timeZone,
  );
  return new Date(instant).toISOString();
}
