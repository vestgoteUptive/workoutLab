// UF-09.3 plate loading (T-0634, D-0217, spec cobalt-mock-behaviour §3.1). Pure: no clock, no
// randomness. Computed in whole hundredths of a kg so 1.25 + 2.5 never meets float error.
import type { Barbell } from "@workoutlab/shared";

export type PlateLoading = { kind: "bar" } | { kind: "plates"; perSide: number[] } | null;

/** A weight past this many hundredths per side (1000 kg) is not a real bar: no line. */
const MAX_SIDE_HUNDREDTHS = 100_000;

const hundredths = (kg: number) => Math.round(kg * 100);

export function plateLoading(weightKg: number, barbell: Barbell): PlateLoading {
  if (!Number.isFinite(weightKg)) return null;
  const diff = hundredths(weightKg) - hundredths(barbell.barKg);
  if (diff < 0 || diff % 2 !== 0) return null;
  const side = diff / 2;
  if (side === 0) return { kind: "bar" };
  if (side > MAX_SIDE_HUNDREDTHS) return null;

  const sizes = [...new Set(barbell.platesKg.map(hundredths).filter((p) => p > 0))].sort(
    (a, b) => b - a,
  );
  // count[p]: the fewest plates summing to exactly p, or Infinity.
  const count = new Array<number>(side + 1).fill(Infinity);
  count[0] = 0;
  for (let p = 1; p <= side; p++) {
    for (const s of sizes) {
      if (s <= p && count[p - s]! + 1 < count[p]!) count[p] = count[p - s]! + 1;
    }
  }
  if (!Number.isFinite(count[side])) return null;

  // Rebuild largest first: the biggest plate that still leaves a fewest-plates remainder gives the
  // lexicographically greatest list (20 + 10 beats 15 + 15).
  const perSide: number[] = [];
  let left = side;
  while (left > 0) {
    const s = sizes.find((x) => x <= left && count[left - x] === count[left]! - 1)!;
    perSide.push(s / 100);
    left -= s;
  }
  return { kind: "plates", perSide };
}
