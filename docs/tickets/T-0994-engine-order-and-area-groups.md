---
id: T-0994
title: Engine rules 7.6 and 12.4 - orderItems (main lift first, areas alternate, machines grouped) and areaGroups
lane: engine
screens: [UF-08.2, UF-08.4]
decisions: [D-0275, D-0274, D-0269]
deps: []
status: ready
---
## Why
Order must be automatic (D-0274 §4) and the UI needs the plan grouped by area. Both are pure engine functions (principle 3). `suggest` is unchanged.

## Scope
- In: `packages/engine/src/order.ts` (`orderItems(workout, library)`) and `area-groups.ts` (`areaGroups(workout)`), exported from `index.ts`; `docs/engine-rules.md` rules 7.6 and 12.4 with examples R7-E46 onward and R12-E27 onward, plus traceability rows; re-vendor `supabase/functions/_shared/vendor/**`.
- Out: `suggest` and every existing rule's behaviour, rules 12.5 to 12.7 (T-0995), any web or data change.

## Acceptance criteria
Fixture W is R7-E4's plan (bench-press × 4 main, inverted-row × 3, leg-extension × 2). Test titles start `rule-7-6` and `rule-12-4`.
- AC1 (main first) Given any plan with a main lift, Then `orderItems` puts it first. Given a plan with no main lift (`mainLiftId` null), Then tier 0 is empty and compounds lead.
- AC2 (tiers) Given a plan holding two compounds and two isolations in mixed order, Then both compounds precede both isolations.
- AC3 (areas alternate, both values) Given compounds in chest, chest, back (two chest items), Then the result is chest, back, chest. Given every item in the same area, Then the original order is kept (nothing to alternate).
- AC4 (machines grouped, both values) Given isolations leg-extension (machine, quads), biceps-curl (dumbbell, arms), leg-curl (machine, hamstrings) with distinct areas, Then the two machine items are adjacent. Given no shared equipment group, Then the original order is kept.
- AC5 (equipment groups) Given exercises with barbell and rack, dumbbell, machine, cable, pull-up bar and none, Then they map to barbell, dumbbell, machine, cable, bodyweight, bodyweight.
- AC6 (permutation) Given any plan, Then the output items are a permutation of the input items, costs and totals are equal, `plan.mainLiftId`, warm-up and `sessionReasons` are unchanged, and the input is not mutated. Applying `orderItems` twice equals once.
- AC7 (groups) Given W, Then `areaGroups` is chest 4 sets, back 3, quads 2 with `costS` 720, 555, 270 and `itemIds` per area, in order of first appearance. Given an item with a back-off, Then the back-off set is not counted. Given an empty plan, Then `[]`. Given a plan where one area holds two items, Then they are one group with summed sets.
- AC8 (histories) Given zero history, balanced, all-chest-no-legs, returning after 10 days off, 15-minute and 90-minute plans, and an offline-merged history, Then AC6 holds and the 90-minute plan keeps at most 8 items.
- AC9 (determinism, seeded) Given 200 seeded random plans (inline `mulberry32`), Then the output is identical on a repeat and the main lift is first.
- AC10 (golden) Given the existing R7 to R14 examples, Then `suggest` output is byte-identical (nothing existing changed).
- AC11 (purity and vendor) Given the engine sources, Then no `Date.now()`, `new Date()` or `Math.random()` in the new files, and `vendor.mjs --check` passes.

Checklist (D-0197 §7): main lift present/absent (AC1), alternate possible/impossible (AC3), group shared/not shared (AC4), empty/non-empty plan (AC7).

## Paths you may change
- `packages/engine/**`
- `docs/engine-rules.md` (rules 7.6 and 12.4, traceability)
- `supabase/functions/_shared/vendor/**` (re-vendor only, via `vendor.mjs`; extra, named explicitly as T-0961 does)

## Contract impact
`docs/engine-rules.md` — D-0275 names the change.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0994` and cite UF-08.2.

## Build / accept log
- Build (engine-dev): `orderItems` (order.ts, rule 7.6) and `areaGroups` (area-groups.ts, rule 12.4) added and exported; docs/engine-rules.md gains 7.6 (R7-E46…E51), 12.4 (R12-E27…E30), a Required-tests bullet and a traceability row; vendor re-run, `--check` passes. No existing engine source touched except `index.ts` exports. AC→test: AC1 rule-7-6-order-items (R7-E51, main-first); AC2 R7-E47; AC3 R7-E48; AC4 R7-E49; AC5 R7-E50; AC6 permutation test; AC7 rule-12-4-area-groups (R12-E27…E30); AC8 rule-7-6-histories (7 histories x 3 energies, 90-min ≤ 8); AC9 200 seeded plans; AC10 rule-7-6-histories golden (suggest JSON unchanged) plus all existing tests green; AC11 purity test + `vendor.mjs --check`. rule-7-switches-b18 imports the two new suggest-calling files (its meta-test requires it). Faults (cp-restored, cmp-checked, none committed): main-first off, area preference off, group preference off, back-off counted in sets, isolation tier merged into compounds: each failed 1-3 tests. Gate: turbo typecheck lint test (19 tasks) green, format:check green, check-all only `ticket-not-on-base`, vendor --check ok. Doc choices: unknown equipment and `pullup-bar` map to bodyweight; an item missing from the library throws RangeError.
