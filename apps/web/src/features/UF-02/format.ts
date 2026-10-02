// UF-02.1 date line and clock defaults. The defaults touch `navigator` only through a
// `typeof` guard on `language` (AC-1: `auth-guard.test.tsx` stubs `navigator` as `{onLine}`).

/** The header date, e.g. "Sunday 27 September" (en-GB), in the given locale and tz. */
export function formatTodayDate(now: Date, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone,
  }).format(now);
}

/** `OfflineStatus`'s own default, used when the device locale can't be read. */
export const FALLBACK_LOCALE = "en-GB";

export function defaultLocale(): string {
  const nav: { language?: unknown } | undefined =
    typeof navigator === "undefined" ? undefined : navigator;
  return typeof nav?.language === "string" && nav.language !== "" ? nav.language : FALLBACK_LOCALE;
}

export function defaultTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
