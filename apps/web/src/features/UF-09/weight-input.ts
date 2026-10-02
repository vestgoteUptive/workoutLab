// The UF-09.4 weight field (T-0304b, D-0118 §6, T-0409, D-0128 §1–§2). Pure parsing: the text is
// trimmed; empty means "no weight" (`null`, D-0066 §4). Every Unicode `Nd` digit (Arabic-Indic,
// Persian, Devanagari, Bengali, Fullwidth, …) reads as its ASCII digit, so the field the app fills
// with `formatDecimal(v, locale)` parses back to `v`. Digits with an optional single `.`, `,` or
// `٫` (U+066B) and up to two decimals are a weight; anything else (a sign, an exponent, grouping
// such as `٬` U+066C, inner spaces) is invalid and blocks Save.

export type ParsedWeight = { ok: true; value: number | null } | { ok: false };

const WEIGHT = /^(\d+)(?:[.,٫](\d{1,2}))?$/;
const DIGIT = /\p{Nd}/u;
const DIGITS = /\p{Nd}/gu;

/** The value 0–9 of one `Nd` character. Unicode keeps decimal digits in contiguous runs of whole
 *  0–9 sets (the stability policy), so the offset from the start of the run, mod 10, is the value. */
function digitValue(char: string): number {
  let start = char.codePointAt(0)!;
  while (start > 0 && DIGIT.test(String.fromCodePoint(start - 1))) start -= 1;
  return (char.codePointAt(0)! - start) % 10;
}

/** Maps every `Nd` digit to ASCII; other characters are left as they are. */
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

/** A stepper on the weight (D-0118 §3 §6): from the parsed value, or 0 when it is empty or
 *  invalid, by `deltaKg`, floored at 0 and kept to two decimals. */
export function stepWeight(text: string, deltaKg: number): number {
  const parsed = parseWeight(text);
  const from = parsed.ok && parsed.value !== null ? parsed.value : 0;
  return Math.max(0, Math.round((from + deltaKg) * 100) / 100);
}
