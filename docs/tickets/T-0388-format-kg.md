---
id: T-0388
title: "Locale-aware weight helper formatKg(value, locale?) in lib/format/number.ts"
lane: web-shell
screens: [UF-09]
decisions: [D-0114, D-0115]
deps: []
status: ready
---
## Why
D-0114 §3 says every weight in kg goes through a locale-aware `lib/format/*` helper, never a
template literal ("82.5 kg" vs "82,5 kg"). The first UF-09 ticket that shows a weight needs this
helper to exist already. D-0115 §6 fixes its shape, following the `formatSetCount(value, locale?)`
pattern.

## Scope
- In: `export function formatKg(value: number, locale?: string): string` in `lib/format/number.ts`, and its tests.
- Out:
  - Volume totals.
  - lb units.
  - Input parsing.
  - Any caller change.
  - A change to `formatSetCount`.

## Acceptance criteria
- AC1 Given locale "en-GB", when `formatKg` is called, then 82.5 → "82.5 kg", 80 → "80 kg", 41.25 → "41.25 kg", 0 → "0 kg", and 2.125 → "2.13 kg" (half-expand, at most 2 decimals).
- AC2 Given locale "sv-SE", when `formatKg(82.5, "sv-SE")` and `formatKg(41.25, "de-DE")` are called, then they return "82,5 kg" and "41,25 kg".
- AC3 Given 1250 with "en-GB", when it is formatted, then the result is "1250 kg" (no grouping, D-0115 §6).
- AC4 Given no locale, when `formatKg(82.5)` is called, then it equals `formatKg(82.5, new Intl.NumberFormat().resolvedOptions().locale)` (the runtime default, as with `formatSetCount`).
- AC5 Given the existing `formatSetCount` tests and callers, when the suite runs, then they pass unchanged, and `formatKg.length === formatSetCount.length` (both take an optional trailing locale; corrected by TR-0037).

## Paths you may change
- `apps/web/src/lib/format/**` (the lane: `web-shell`). The edits go only in `apps/web/src/lib/format/number.ts` and a new `apps/web/src/lib/format/number.test.ts`.
- **Listed extras:**
  - `docs/tickets/T-0388-format-kg.md`: this file, for the accept log.

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0388` and cite screen IDs.

## Accept log
- PO accept (build f627100): **done**.
- AC1: `number.test.ts` "AC1" covers 82.5, 80, 41.25, 0 and 2.125 → "2.13" in en-GB, joined with U+00A0 (D-0115 §6). It also asserts there is no plain space.
- AC2: sv-SE 82.5 → "82,5 kg" and de-DE 41.25 → "41,25 kg".
- AC3: 1250 → "1250 kg" in en-GB, de-DE and sv-SE (`useGrouping: false`).
- AC4: no locale equals the resolved runtime locale.
- AC5: the `formatSetCount` cases pass unchanged and `formatKg.length === formatSetCount.length` (TR-0037 wording).
- Wrong-implementation proofs (plain space, grouping, max 1 decimal, hard-coded locale, truncation) each fail a test. Review: APPROVE.
- Accepted nits:
  - AC4 is only as strong as the runtime locale. On an en runtime, a hard-coded "en" would pass; the hard-coded-locale proof covers this case.
  - -0 renders "-0 kg", which matches `formatSetCount`.
- No caller change and no contract touched.
