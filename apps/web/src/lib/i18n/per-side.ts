// T-0974 (D-0261, D-0263 §4 §5 §8): the one place the "per arm / per leg / per side" copy lives.
// UF-09 calls it today; UF-03 and UF-06 reuse it. Fixed strings, no LLM text (principle 3).
import type { Unilateral } from "@workoutlab/shared";

/** The word a flagged exercise carries (`arm`, `leg` or `side`). */
export type PerSideWord = Unilateral;

const WORDS: readonly string[] = ["arm", "leg", "side"];

/** An unknown, empty or missing value reads as both sides (null). */
export function asWord(value: unknown): PerSideWord | null {
  return typeof value === "string" && WORDS.includes(value) ? (value as PerSideWord) : null;
}

/** " per arm", " per leg" or " per side", with the leading space; "" for no word. */
export function perSide(word: PerSideWord | null | undefined): string {
  const w = asWord(word);
  return w === null ? "" : ` per ${w}`;
}

/** The caption under a stepper number: "per arm" (no leading space); "" for no word. */
export function perSideCaption(word: PerSideWord | null | undefined): string {
  return perSide(word).trimStart();
}

export interface FormatRepsOptions {
  timed?: boolean;
  locale?: string | undefined;
}

/** "10 reps per arm", "1 rep per arm", "40 s per side". A null or unknown word gives today's
 *  text: "10 reps", "1 rep", "40 s". The number goes through Intl for the locale. */
export function formatReps(
  n: number,
  word: PerSideWord | string | null | undefined,
  opts: FormatRepsOptions = {},
): string {
  const num = new Intl.NumberFormat(opts.locale, { useGrouping: false }).format(n);
  const base = opts.timed ? `${num} s` : n === 1 ? `${num} rep` : `${num} reps`;
  return base + perSide(asWord(word));
}

/** The screen-reader reading of a set line: "12 kg, 10 reps per arm" or "10 reps per arm". */
export function readReps(
  n: number,
  word: PerSideWord | null | undefined,
  locale: string | undefined,
  load: string | null = null,
): string {
  const reps = formatReps(n, word, { locale });
  return load === null ? reps : `${load}, ${reps}`;
}

/** The stepper group name on UF-09.4 for a flagged exercise: "Reps per arm". */
export function repsGroupLabel(word: PerSideWord): string {
  return `Reps${perSide(word)}`;
}
