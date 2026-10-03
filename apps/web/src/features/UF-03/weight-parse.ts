// UF-03.1 List view field parsing (T-0417, D-0142 §3). UF-03 may not import
// `features/UF-09/weight-input.ts`, so this is its own pure copy of D-0118 §6's weight rules as
// amended by D-0128 §1–§2: the text is trimmed; empty means "no weight" (`null`); every Unicode
// `Nd` digit reads as its ASCII digit; one `.`, `,` or `٫` (U+066B) and up to two decimals; a
// sign, exponent, grouping (`٬` U+066C) or inner space is invalid.

export type ParsedWeight = { ok: true; value: number | null } | { ok: false };

const WEIGHT = /^(\d+)(?:[.,٫](\d{1,2}))?$/;
const COUNT = /^\d+$/;
const DIGIT = /\p{Nd}/u;
const DIGITS = /\p{Nd}/gu;

/** The value 0–9 of one `Nd` character: Unicode keeps decimal digits in contiguous runs of whole
 *  0–9 sets, so the offset from the start of the run, mod 10, is the value. */
function digitValue(char: string): number {
  let start = char.codePointAt(0)!;
  while (start > 0 && DIGIT.test(String.fromCodePoint(start - 1))) start -= 1;
  return (char.codePointAt(0)! - start) % 10;
}

function asciiDigits(text: string): string {
  return text.replace(DIGITS, (char) =>
    char >= "0" && char <= "9" ? char : String(digitValue(char)),
  );
}

export function parseWeight(text: string): ParsedWeight {
  const trimmed = asciiDigits(text.trim());
  if (trimmed === "") return { ok: true, value: null };
  const match = WEIGHT.exec(trimmed);
  if (!match) return { ok: false };
  return { ok: true, value: Number(`${match[1]}.${match[2] ?? "0"}`) };
}

/** A whole number of reps or seconds, or `null` for empty or anything else. */
export function parseCount(text: string): number | null {
  const trimmed = asciiDigits(text.trim());
  return COUNT.test(trimmed) ? Number(trimmed) : null;
}
