// UF-10 pure display helpers (T-0307a, UF-10.1 / UF-10.2).
//
// Principle 3: every function here takes a value the engine already produced and turns it into a
// string or a CSS length. None of them re-derives an engine value from another one — there is no
// `coverageStep` from `load / target`, and no `deficit` from `load` and `target`. AC-A5 and
// AC-A13 exist to catch exactly that, so keep this file free of engine rules.
import { coverageLegend, type ColorName, type PlanCoverageToken } from "@workoutlab/design-tokens";
import type { LocalDate } from "@workoutlab/shared";

/**
 * The colour token for the engine's `coverageStep`, matching C-01's own `fillToken` (AC-A20):
 * a step outside 0–4 is an engine bug and renders neutral rather than crashing the row.
 *
 * Shares the single source of truth, `coverageLegend`, with C-01 — so a stub with
 * `coverageStep: 2` gives the row and the map button the same fill (AC-A15).
 */
export function fillToken(step: number): ColorName | PlanCoverageToken {
  return coverageLegend.find((e) => e.step === step)?.token ?? "surface-2";
}

/**
 * The CSS colour for a token; the only way a colour enters UF-10 (no raw hex anywhere).
 * A `plan-coverage-N` legend token is drawn as the generic `var(--wl-coverage-N)` (D-0211 §2), so a
 * screen without `data-wl-state` keeps the legacy look (D-0210 §2). Never `--wl-color-plan-*`.
 */
export function tokenVar(name: ColorName | PlanCoverageToken): string {
  if (name === "surface-2") return "var(--wl-raise)";
  if (name.startsWith("plan-coverage-")) return `var(--wl-coverage-${name.slice(-1)})`;
  return `var(--wl-color-${name})`;
}

/**
 * The bar's width as a CSS percentage: `min(load / target, 1)` (AC-A4 — 24 / 20 is 100 %, not
 * 120 %). A non-finite ratio (`target: 0`) is 0 %, so no `NaN%`/`Infinity%` ever reaches the DOM
 * (AC-A20).
 *
 * This is a *width*, not an engine value: `coverageStep` still comes from the engine, and this
 * function is never used to pick a colour.
 */
export function barWidth(load: number, target: number): string {
  const ratio = load / target;
  if (!Number.isFinite(ratio) || ratio <= 0) return "0%";
  return `${Math.min(ratio, 1) * 100}%`;
}

/** The engine's `deficit` as a whole percent, half up (`0.625` → `63`, `0.5` → `50`). */
export function deficitPercent(deficit: number): number {
  // Half up, with an epsilon so a binary-float artefact (0.285 * 100 = 28.499999…) still rounds up.
  return Math.floor(deficit * 100 + 0.5 + 1e-9);
}

/** Whole local days from `from` to `to`, both `YYYY-MM-DD`. Calendar arithmetic, never tz-shifted. */
export function dayDiff(from: LocalDate, to: LocalDate): number {
  const ms = Date.UTC(...parts(to)) - Date.UTC(...parts(from));
  return Math.round(ms / 86_400_000);
}

function parts(date: LocalDate): [number, number, number] {
  const [y, m, d] = date.split("-").map(Number);
  return [y!, m! - 1, d!];
}

/** The 14 local dates of the engine's window, `days[0]` = `windowStart` … `days[13]` = `windowEnd`. */
export function windowDates(windowStart: LocalDate, count: number): LocalDate[] {
  const [y, m, d] = parts(windowStart);
  return Array.from({ length: count }, (_, i) => {
    const day = new Date(Date.UTC(y, m, d + i));
    return day.toISOString().slice(0, 10);
  });
}

/**
 * `2026-09-17` → `17 Sep`: the day and month in the locale's own order, with the month
 * abbreviated to three letters.
 *
 * Built from `formatToParts` rather than `format` for one measured reason. CLDR's `en-GB`
 * `month: "short"` is **"Sept"**, not "Sep" — September is the only month where the two
 * differ, and `en-US` avoids it only by also putting the month first ("Sep 20"), which is the
 * wrong order for this screen. The spec and the ticket both say `20 Sep`, so the locale
 * decides the *order* and the separator while the month name is normalised to three letters.
 * Still Intl-only: no date library, no hard-coded month table (NFR-I18N-2).
 */
export function formatDayMonth(date: LocalDate, locale = "en-GB"): string {
  const [y, m, d] = parts(date);
  return formatPartsDayMonth(
    new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).formatToParts(new Date(Date.UTC(y, m, d))),
  );
}

/** Joins `day`/`month`/`literal` parts, clipping the month to three letters. */
function formatPartsDayMonth(parts: readonly Intl.DateTimeFormatPart[]): string {
  return parts
    .map((part) => (part.type === "month" ? shortMonth(part.value) : part.value))
    .join("");
}

/** "Sept" → "Sep"; "Sep", "May" and any non-Latin abbreviation are returned unchanged. */
function shortMonth(value: string): string {
  return /^[A-Za-z]{4,}$/.test(value) ? value.slice(0, 3) : value;
}

/**
 * The UF-10.1 header range, e.g. `14–27 Sep` — the month is printed once when both ends share
 * it, and twice when they don't (`28 Sep–11 Oct`). En dash, per the design system.
 */
export function formatDateRange(
  windowStart: LocalDate,
  windowEnd: LocalDate,
  locale = "en-GB",
): string {
  const [, startMonth] = parts(windowStart);
  const [, endMonth] = parts(windowEnd);
  const end = formatDayMonth(windowEnd, locale);
  if (startMonth === endMonth) {
    const [y, m, d] = parts(windowStart);
    const dayOnly = new Intl.DateTimeFormat(locale, { day: "numeric", timeZone: "UTC" }).format(
      new Date(Date.UTC(y, m, d)),
    );
    return `${dayOnly}–${end}`;
  }
  return `${formatDayMonth(windowStart, locale)}–${end}`;
}

/** An ISO instant → `20 Sep` in `timeZone` (UF-10.2's "Adapted {d MMM}" from `targetUpdatedAt`). */
export function formatInstantDayMonth(
  iso: string,
  options: { locale: string | undefined; timeZone: string },
): string {
  // Same three-letter normalisation as `formatDayMonth` (see its note on `en-GB` "Sept").
  return formatPartsDayMonth(
    new Intl.DateTimeFormat(options.locale ?? "en-GB", {
      day: "numeric",
      month: "short",
      timeZone: options.timeZone,
    }).formatToParts(new Date(iso)),
  );
}
