// Intl-only number helpers (NFR-I18N-2).

/**
 * A weighted hard-set count for display (C-01, D-0013): integers print without a decimal,
 * fractional values with exactly one (7.25 → "7.3", 7.5 → "7.5", 8 → "8"). Rounding is Intl's
 * default half-expand. The decimal separator follows `locale`.
 */
export function formatSetCount(value: number, locale?: string): string {
  const fractional = !Number.isInteger(value);
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: fractional ? 1 : 0,
    maximumFractionDigits: fractional ? 1 : 0,
    useGrouping: false,
  }).format(value);
}

/**
 * A weight in kilograms for display (D-0114 §3, D-0115 §6): up to two decimals (82.5 → "82.5 kg",
 * 80 → "80 kg", 2.125 → "2.13 kg"), no digit grouping, then U+00A0 and the SI symbol `kg`.
 * Rounding is Intl's default half-expand. The decimal separator follows `locale`; an absent
 * `locale` means the runtime default.
 */
export function formatKg(value: number, locale?: string): string {
  const number = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
    useGrouping: false,
  }).format(value);
  return `${number}\u00A0kg`;
}
