---
id: T-0995
title: Engine rules 12.5 to 12.7 - adjustAreaSets, addArea, removeArea and areaCandidates
lane: engine
screens: [UF-08.2, UF-08.6]
decisions: [D-0275, D-0274, D-0191, D-0268]
deps: [T-0994]
status: ready
---
## Why
The area stepper, "Add an area", "Remove" and "Fill the rest for me" must be engine calls (principle 3), local to one area, and never over budget.

## Scope
- In: `packages/engine/src/area-edits.ts` with `adjustAreaSets`, `addArea`, `removeArea`, `areaCandidates` (D-0275 §3 to §5), exported; `docs/engine-rules.md` rules 12.5, 12.6, 12.7 with examples R12-E28 onward and traceability; re-vendor. Runs after T-0994 (same engine files).
- Out: `suggest`, `insertItem` (reused as is for exercise Add), orderItems (T-0994), web.

## Acceptance criteria
Fixture W (R7-E4) at `budgetMin 45`, warm-up on unless stated; ctx carries history, profile, library, `excludeIds`, `favoriteIds`, `avoidAreas`, `now`, `tz`.
- AC1 (+ with room) Given W, When +1 on back (inverted-row × 3, cap 3), Then no item has room, so a second back item is added at 2 sets (top rule 7.2 candidate not in the plan). Given quads with leg-extension × 2, Then +1 makes it × 3 and `costS` rises by one set cost.
- AC2 (+ refused, both values) Given an area with 2 items, Then +1 is `{refused: "area_full"}`. Given enough time, a +1 that fits succeeds; given a plan with `unusedS` below one set cost, Then `{refused: "time"}`. Check order: structural `RangeError` first, then `area_full`, then `time`. A plan already over budget refuses `time`.
- AC3 (main lift cap) Given the main lift at 3 sets, Then +1 gives 4; at 4 and no second item, +1 adds a second item at 2 (the area holds 6). The area holding the main lift reaches 7 at most (4 + 3), any other area 6 (3 + 3).
- AC4 (− steps) Given an area with one item at 3 sets, Then −1 gives 2. Given an area with two items of 3 and 2 sets, Then −1 removes the second item (it has only 2 sets), leaving the first at 3. Given two items of 3 and 3, Then −1 gives 3 and 2. Given one item at 2 sets, Then −1 removes the area (equal to `removeArea`). Freed time stays unused (`unusedS` rises, nothing refills).
- AC5 (main lift removed) Given −1 on the area holding the main lift down to removal, Then `mainLiftId` is null and no other item is promoted (as `removeItem`).
- AC6 (addArea, both values) Given W and `addArea(shoulders)`, Then the top shoulders candidate is added at 3 sets, else 2. Given 345 s left and a compound-only candidate list that needs 390 s, Then it is added at 2 sets if that fits, otherwise `{refused: "time"}`. Given 8 items, Then `{refused: "items_cap"}`. Given a recovering area (R7-E3's history), an avoided area, an area whose every exercise is excluded, Then `{refused: "area_unavailable"}`. An area already in the plan is a `RangeError`.
- AC7 (empty plan) Given the empty plan (R7-E31), When `addArea(chest)`, Then the item is a compound main lift (rule 7.2 step 1 order, D-0269) and `mainLiftId` is set. Given a non-empty plan, Then the added item is not main.
- AC8 (removeArea) Given W, `removeArea(back)` equals `removeItem(inverted-row)`; an area with two items removes both; an unknown or absent area is a `RangeError`.
- AC9 (candidates) Given W, Then `areaCandidates` lists the areas not in the plan in rule 7.2 order with `{load, target}` and `available: true` or a reason from {recovering, avoided, excluded_out, no_exercise, time, items_cap}. Given zero history, Then every area is `available` and load 0; given R7-E3's history, Then quads and glutes read `recovering`. Given `favoriteIds`, ranking of areas is unchanged (favorites only rank exercises).
- AC10 (flagged exercise) Given a one-side exercise (`unilateral: arm`) in the area, Then +1 adds two sides of work to its cost (D-0268).
- AC11 (never over budget, seeded) Given 200 seeded edit sequences from each of the six histories, Then no successful edit leaves `itemsTotalS` above `available` unless it was above before; a refused edit returns the input unchanged; same input twice gives the same output; +1 then −1 round-trips when no item was added; the input is never mutated.
- AC12 (golden and vendor) Given the existing examples, Then `suggest` is byte-identical; `vendor.mjs --check` passes; the new files have no `Date.now()`, `new Date()` or `Math.random()`.

Checklist (D-0197 §7): room/no room (AC1, AC3), fits/doesn't fit (AC2, AC6), empty/non-empty plan (AC7), main/not main (AC5, AC7), available/unavailable area (AC6, AC9).

- From the T-0994 review: add a test for an item with no `area_deficit` reason in both `areaGroups` (skipped) and `orderItems` (area `null`, never "same area"); `packages/engine/test/**` is in this lane.

## Paths you may change
- `packages/engine/**`
- `docs/engine-rules.md` (rules 12.5 to 12.7, traceability)
- `supabase/functions/_shared/vendor/**` (re-vendor only, via `vendor.mjs`; extra, named explicitly as T-0961 does)

## Contract impact
`docs/engine-rules.md` — D-0275 names the change.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0995` and cite UF-08.2.

## Build / accept log
