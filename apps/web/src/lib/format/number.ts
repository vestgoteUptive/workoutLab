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
