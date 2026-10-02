---
id: D-0124
title: "UF-08.2 weights go through lib/format formatKg (T-0391): the detail weight is formatKg's output as it is, the back-off line reads \"+ 1 back-off {formatKg} × {reps}\", rows.ts weightText and en.uf08.weightKg are removed"
status: revisit
date: 2026-10-02
by: product-owner (groom T-0391)
area: product
builds-on: D-0114 §3 §5, D-0115 §6, D-0118 §6 §9, D-0109 §4
supersedes: D-0109 §4 in part (the "{w} kg" weight with `Intl.NumberFormat(locale, {maximumFractionDigits: 2})`, and the unitless "+ 1 back-off {w} × {reps}")
---
## Context
T-0303b shipped UF-08.2 before `formatKg` existed. `features/UF-08/rows.ts` `weightText` formats
the number with `Intl.NumberFormat(locale, { maximumFractionDigits: 2 })`, and the flow key
`en.uf08.weightKg` appends " kg" with a plain space. That differs from D-0115 §6 in two ways:
digit grouping is on (1250 → "1,250 kg" in en-GB), and the space is not U+00A0. The back-off line
"+ 1 back-off 70 × 6" carries no unit at all.

`formatKg` always appends U+00A0 `kg`, and D-0114 §5 forbids cutting it off. So once UF-08 uses
it, the back-off line either gains the unit or keeps a second, unitless number helper. UF-09.3
already reads "{formatKg} × {reps}" ("70 kg × 6", D-0118 §9).

## Decision
1. Every kg value on UF-08.2 is `formatKg(value, locale)` from `lib/format/number.ts`, with the
   `locale` prop `Suggested` already takes.
2. **Detail line:** the weight part is `formatKg(prefill.weightKg, locale)` as it is ("80 kg",
   "77,5 kg" with U+00A0). The Bodyweight and null rules of D-0109 §4 are unchanged.
3. **Back-off line:** "+ 1 back-off {formatKg(backoff.weightKg, locale)} × {reps}", for example
   "+ 1 back-off 70 kg × 6". This matches UF-09.3. "+ 1 back-off set" for a null weight is
   unchanged.
4. `rows.ts` `weightText` is deleted, and so is the `en.uf08.weightKg` key, which nothing reads
   after this change. The `en.uf08.backoff(weight, reps)` key keeps its signature; its `weight`
   argument is now the `formatKg` output.

## Consequences
- T-0391 encodes §1 to §4. The existing UF-08.2 tests that pin "80 kg" with a plain space, and
  the "+ 1 back-off 70 × 6" case, are updated to the new values. That is the sanctioned edit.
- The UF-08 e2e row pattern (`tests/e2e/uf-08-setup.spec.ts` `DETAIL_PATTERN`) expects a plain
  space before `kg`. T-0391 updates it to U+00A0, so T-0393's kg case doesn't trip on it.
- No contract change.

## Revisit when
- A lb unit setting enters scope (D-0115 revisit).
- Copy review wants the back-off weight without a unit.
