---
id: D-0128
title: "UF-09.4 weight field: parseWeight accepts any locale's decimal digits and the Arabic decimal separator; an unedited field keeps the recorded weight exactly"
status: revisit
date: 2026-10-02
by: product-owner (groom T-0409)
area: web
builds-on: D-0118 §4 §6, D-0115 §6
amends: D-0118 §6 (the parsing bullet), in part
---
## Context
D-0118 §6 shows the UF-09.4 weight as `formatDecimal(value, locale)` and parses "digits with an
optional single `.` or `,` and up to 2 decimals". Two gaps came out of the T-0304b review:

1. In a locale whose default numbering isn't Latin, `formatDecimal` prints native digits. `ar-EG`
   prints 77.5 as `٧٧٫٥` (Arabic-Indic digits, U+066B ARABIC DECIMAL SEPARATOR). The ASCII-only
   parser rejects that, so the pre-filled field is "invalid" before the user types anything, and
   Save is `aria-disabled`. A user on an Arabic or Persian keyboard who types native digits hits the
   same wall.
2. A recorded weight with 3 decimals (the engine rounds to 3, rule 14) shows as 2 decimals
   (82.125 → "82.13"). After a touch cancels the auto-save, Save parses "82.13" and treats it as
   changed. It then calls `editSet` with 82.13, a weight the user never entered, and bumps
   `edited_at` (against D-0118 §4).

There were two options for the first gap: format the field with Latin digits (`-u-nu-latn`), or
normalise digits when parsing. Formatting with Latin digits fixes the pre-fill but still rejects
typed native digits, and it makes the field disagree with every `formatKg` value on screen.
Normalising digits fixes both cases.

## Decision
1. **Digits.** `parseWeight` (`features/UF-09/weight-input.ts`, still pure) maps every character in
   the Unicode `Nd` category to its ASCII digit before matching. The tested blocks are Arabic-Indic
   U+0660–0669, Extended Arabic-Indic U+06F0–06F9, Devanagari U+0966–096F, Bengali U+09E6–09EF and
   Fullwidth U+FF10–FF19.
2. **Separator.** The single decimal separator may be `.`, `,` or `٫` (U+066B). Everything else in
   D-0118 §6 is unchanged: trim, empty gives `null`, at most 2 decimals, no sign, no exponent, no
   grouping, no inner spaces. `٬` (U+066C, the Arabic thousands separator) is invalid.
3. **Round trip.** For every locale the app formats with, `parseWeight(formatDecimal(v, locale))`
   gives `v` for any `v` with at most 2 decimals.
4. **Unedited text keeps the recorded value.** On UF-09.4, a weight field whose text equals the
   text it opened with (`formatDecimal(recorded.weightKg, locale)`) stands for `recorded.weightKg`
   exactly, so 82.125 stays 82.125. Save's change check (D-0118 §4) compares that value. Text
   that differs from the opening text is parsed as usual, and a stepper result counts as typed text.
   Edits that lead back to the opening text count as no change, the same as reps 6 → 7 → 6.
5. `formatDecimal` and `formatKg` are unchanged. The field keeps showing the locale's own digits.

## Consequences
- The pre-fill path ("pre-fill, don't ask", principle 3) works in every locale: one tap on Save is
  never blocked by our own formatting.
- An untouched or unedited weight never rewrites the stored set.
- A user can't save 82.13 over a recorded 82.125 by retyping exactly "82.13". They would have to
  type something else first. That is an acceptable edge case.
- This doesn't settle whether a 3-decimal pre-fill should be rounded to 2 decimals when the set is
  recorded. `sets.weight_kg` is `numeric(6,2)` in `docs/data-model.md`, so today the server row
  can differ from the local entry. That question is a separate follow-up.

## Revisit when
- Any number input other than UF-09.4 parses user text (UF-07, UF-11). Then move the digit
  normalisation into `lib/format` so every field shares it.
