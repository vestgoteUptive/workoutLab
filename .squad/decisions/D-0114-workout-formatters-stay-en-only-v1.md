---
id: D-0114
title: "`lib/i18n/workout.ts` formatters stay 1-arg and English-only in v1; a future locale arrives as an optional trailing `locale?: string` whose absence keeps today's output byte for byte; T-0302c's three builder defaults recorded"
status: revisit
date: 2026-10-02
by: product-owner (spec T-0387)
area: product
builds-on: D-0017 (NFR-I18N-1/2), D-0045 §9 §12, D-0071 §1, D-0075, D-0106 §3–§5
---
## Context
T-0302c's review asked (T-0387) whether the six `apps/web/src/lib/i18n/workout.ts` exports (`areaName`, `itemSummary`, `restLabel`, `reasonLine`, `itemReasonLine`, `sessionReasonChips`) should take a locale or number formatter now, before T-0303b (UF-08.2, starting now) and UF-09 call them. Today they are 1-arg, put raw integers into strings ("Chest 63 % below target", "last trained 12 days ago", "4 × 6–8", "2:00"), and pluralise in English only ("1 day" / "12 days").

What already holds:
- **NFR-I18N-1** (D-0017): English only in v1, one catalogue.
- **NFR-I18N-2**: dates, times and numbers go through `Intl` with the device locale and tz. The precedents are `formatTime(iso, { locale, timeZone })` (D-0045 §9) and `formatSetCount(value, locale?)` in `lib/format/number.ts`, which shows the decimal "7.5" vs "7,5".
- D-0106 §4 pins the six export names, and the T-0302c tests pin their outputs by value.
- D-0106 §3: two tickets that list `workout.ts` never run in parallel. T-0303b lists it, so it may add keys.

What the raw integers actually cost. Every number in `workout.ts` is a whole number below 1000: sets, reps, hold seconds, rest m:ss, a 0–100 percent, a day count. For every Latin-digit locale, `Intl.NumberFormat(locale, { useGrouping: false })` prints such an integer exactly as `String(n)` does. So en-GB, en-US, sv-SE, de-DE and the rest would show no visible difference. The only difference is in locales whose default numbering system is not Latin (ar-EG, fa, bn and a few more). There, the body map's `formatSetCount` would show native digits next to Latin digits in an English sentence. That is cosmetic, it sits inside an English-only UI, and it needs no fix in v1.

`Intl.NumberFormat` `style: "percent"` would also print "63%". That differs from the specified copy "63 %" (D-0045 §12 allowlists `%`), so a switch to Intl here would be a copy change in its own right.

## Decision
1. **Keep the six formatters 1-arg and English-only for v1.** No signature changes now. That also keeps `workout.ts` free while T-0303b holds it (D-0106 §3).
2. **Why this meets NFR-I18N-2.** NFR-I18N-2 governs numbers that the locale would render differently. Whole numbers below 1000 render identically in every Latin-digit locale, so the raw digits are the `Intl` output in all but the non-Latin-digit case accepted above. This decision does not stretch to decimals, grouping, dates or times.
3. **The rule for new `workout.ts` keys** (T-0303b may add keys; UF-09 tickets that need a new formatter list `workout.ts` as an extra or file a follow-up):
   - **Allowed, 1-arg and en-only:** a key that only puts engine values on screen as whole numbers below 1000, or as words.
   - **Locale-aware from day one:** any number that can be fractional or reach 1000 or more. That covers a weight in kg ("82.5 kg" / "82,5 kg"), volume, a set count like 7.5, and every date or time. These go through a `lib/format/*` helper with a trailing `locale` (the `formatSetCount` / `formatTime` pattern) and never through a raw template literal. If a new `workout.ts` key needs one, it takes `locale?: string` as its last parameter now and passes it to that helper.
   - **Plurals:** a plural lives inside the formatter or the flow-file key. It is chosen from a `count: number` that is passed alongside any pre-formatted number text (the `uf02.cardSummary(count, countText, minutes)` pattern). Feature code never builds "{n} days" or "exercise(s)" itself.
4. **What a future locale change looks like**, so T-0303b and UF-09 callers stay stable:
   - **Signature.** Every export gains one optional trailing parameter, `locale?: string`. Examples: `reasonLine(reason, locale?)`, `itemSummary(item, locale?)`, `restLabel(seconds, locale?)`, `sessionReasonChips(reasons, locale?)`, `areaName(area, locale?)`.
   - **Absent means today's output.** When `locale` is absent, the output is exactly today's English, Latin-digit output. It is not the device default. So every existing 1-arg call and every value-pinned test stays green unchanged, and `Function.length` stays 1.
   - **Present means localised.** When `locale` is given, digits come from `Intl.NumberFormat(locale, { useGrouping: false })` and plurals from `Intl.PluralRules(locale)`. Once a second language exists, the words come from the catalogue for that locale. Words that `areaName` reads from `en.bodyMap.areas` move to that catalogue lookup.
   - **Rollout.** Callers adopt the change by adding the argument at their call site, in the ticket that introduces the locale. No caller has to change before then. The export list (D-0106 §4) stays the same six names, plus any keys added under §3.
5. **What callers must do now, so that change is purely additive:**
   - Treat formatter output as an opaque, finished string. Never parse it, split it, regex it, or append a number, unit or plural noun to it.
   - Never re-implement a `workout.ts` string in feature code.
   - In tests, pin outputs by value (as T-0302c does). Don't compute them from the inputs.
   - Callers that already have a `locale` in hand (UF-02, UF-08 and UF-10 all do) keep passing it to `formatTime` / `formatSetCount` as they do today. They do not pass it to `workout.ts`, whose signatures reject a second argument.
6. **T-0302c builder defaults, accepted as product defaults** (UF-02.1; from the T-0302c accept log, now on record here):
   - (a) **`suggest` throws → no card.** The suggestion region renders nothing, and Today and Start stay usable. A plan is never invented when the engine fails (P3). The same goes for T-0303b: if `suggest` throws on UF-08.2, no rows are made up there either. That ticket picks its own visible state.
   - (b) **Empty plan keeps the title and drops the summary.** "Suggested for 45 min" stays. The "{n} exercises · ~{m} min" line gives way to "Nothing suggested yet", with no rows, See all or chips (T-0302c AC-4).
   - (c) **Singular "1 exercise"** for n = 1, otherwise "exercises", in English only (`uf02.cardSummary`). This is the §3 plural pattern. Other locales' plural rules arrive with §4.

## Consequences
- T-0303b and the UF-09 tickets call the six formatters with one argument, under the caller rules in §5. No re-groom is needed.
- No code change, no contract change, no human gate. T-0387 is delivered by this decision.
- A UF-09 weight display (kg with a decimal) is covered by §3's second rule. It needs a locale-aware kg helper in `lib/format/number.ts` (web-shell lane). That is a follow-up for whichever UF-09 ticket first shows a weight, not a change to `workout.ts`.

## Revisit when
- A second UI language enters scope (NFR-I18N-1 changes). Apply §4 in that ticket.
- A user-facing locale or number-format setting is proposed.
- A `workout.ts` key would need a fractional number, or one of 1000 or more. Apply §3's second rule rather than widening §2.
- Product wants native digits for non-Latin-digit locales, or "63%" instead of "63 %" copy.
- Engine failure (§6a) needs its own visible copy on UF-02.1 or UF-08.2.
