// Set-weight precision at the queue write (T-0233, D-0129). Module-internal: not in `index.ts`.
//
// `sets.weight_kg` is `numeric(6,2)`, and Postgres rounds `numeric` half away from zero. The queue
// stores the same value the column will, so IndexedDB, UF-09 and the server row agree (D-0129 §1).

/** Rounds a weight to 2 decimals, half away from zero, on its decimal value (D-0129 §2).
 *
 *  `Math.round(x * 100) / 100` is wrong: `1.005 * 100` is 100.49999…, so the half flips down.
 *  Instead the shortest round-trip decimal of `|x|` (`toExponential()` with no digit count) is
 *  shifted by two places in its exponent, which is exact for every 2–3-decimal input. That also
 *  handles inputs whose `String()` is already exponential (`1e-7`), where `x + "e2"` would be NaN.
 *  `null` stays `null`; a non-finite value is returned as it is; `-0` and a negative that rounds to
 *  zero come back as `0`. */
export function roundWeightKg(weightKg: number | null): number | null {
  if (weightKg === null) return null;
  if (!Number.isFinite(weightKg)) return weightKg;
  const sign = weightKg < 0 ? -1 : 1;
  const [mantissa, exponent] = Math.abs(weightKg).toExponential().split("e") as [string, string];
  const shifted = Number(`${mantissa}e${Number(exponent) + 2}`);
  const rounded = sign * Number(`${Math.round(shifted)}e-2`);
  return rounded === 0 ? 0 : rounded;
}
