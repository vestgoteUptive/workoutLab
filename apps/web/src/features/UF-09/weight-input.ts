// The UF-09.4 weight field (T-0304b, D-0118 §6). Pure parsing: the text is trimmed; empty means
// "no weight" (`null`, D-0066 §4); digits with an optional single `.` or `,` and up to two
// decimals are a weight; anything else is invalid and blocks Save.

export type ParsedWeight = { ok: true; value: number | null } | { ok: false };

const WEIGHT = /^(\d+)(?:[.,](\d{1,2}))?$/;

export function parseWeight(text: string): ParsedWeight {
  const trimmed = text.trim();
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
