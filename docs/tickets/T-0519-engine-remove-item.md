---
id: T-0519
title: "UF-08.2: pure engine removeItem(workout, exerciseId), Remove drops an item without refilling the freed time (rule 12.2, GitHub #33)"
lane: engine
screens: [UF-08.2]
decisions: [D-0191, D-0065, D-0093, D-0109]
deps: [T-0516]
status: todo
groomed: 2026-10-06
---
<!-- Groomed 2026-10-06 by product-owner from GitHub #33 (D-0191 §4). Build flow: wl-build-engine.
About ⅓ day. Waits for T-0516 only because both edit packages/engine and docs/engine-rules.md.
There is no logical dependency. -->

## Why
GitHub #33: "I couldn't deselect those workout items." UF-08.2 Remove re-runs `suggest` with the
id in `excludeIds`, and rule 7.2 refills the freed time from the same lowest-`r` area. Removing a
leg exercise brings in another leg exercise, and the library has 8 per leg area. D-0065 named this
as its revisit trigger, and D-0191 §4 answers it with a pure "drop without refill" function.

## Scope
- In: `removeItem(workout: Workout, exerciseId: string): Workout` in a new
  `packages/engine/src/remove-item.ts`, exported from the package index, with exactly D-0191 §4's
  semantics. Write it into `docs/engine-rules.md` as **rule 12.2** with the examples below as
  R12-E13..R12-E16.
- Out: any UI (T-0521), and changing `suggest`.

## Acceptance criteria
Fixture W is R7-E4 (bench-press × 4 main 720 s, inverted-row × 3 555 s, leg-extension × 2 270 s;
`itemsTotalS` 1545, `totalS` 1725, `unusedS` 75, `budgetMin` 30, warm-up on, so `available` 1620).
- AC1 (accessory) Given W, When `removeItem(W, "leg-extension")`, Then the items are exactly
  bench-press × 4 (main) and inverted-row × 3, unchanged (deep-equal to W's items). `itemsTotalS`
  is 1275, `totalS` 1455, `unusedS` 345, and `plan.mainLiftId` is "bench-press".
- AC2 (main) Given W, When `removeItem(W, "bench-press")`, Then the items are inverted-row × 3 and
  leg-extension × 2 with `isMain` false on both, `plan.mainLiftId` is null, `itemsTotalS` is 825,
  `totalS` 1005 and `unusedS` 795.
- AC3 (no refill) For every item of W, `removeItem` returns exactly `items.length − 1` items, and
  each remaining item is deep-equal to its counterpart in W.
- AC4 (warm-up and other fields) `plan.warmup`, `plan.startDeficits`, `plan.version`, `budgetMin`,
  `warmupInBudget` and `energy` are unchanged (deep-equal to W's).
- AC5 (session reasons) Given W, whose `sessionReasons` are `area_deficit` for chest, back and quads
  (rule 10), When leg-extension is removed, Then `sessionReasons` is the chest and back entries in
  the same order. Given a plan with a `recovering_skipped {quads}` reason (R7-E3), When any item is
  removed, Then `recovering_skipped {quads}` stays.
- AC6 (last item) Given a plan with one item (R7-E2), When it is removed, Then `items` is `[]`,
  `itemsTotalS` 0, `unusedS` = `available` (900 − 180 = 720 with warm-up on), and
  `plan.mainLiftId` null.
- AC7 (over budget stays honest) Given W after R12-E11's swap (1665 s > 1620 s, `unusedS` 0), When
  inverted-row is removed, Then `itemsTotalS` 1110 and `unusedS` 510.
- AC8 (validation, purity) Given an id that isn't an item (e.g. "plank", or a warm-up move id),
  Then `RangeError`. The input `Workout` is deep-frozen in the test and is not mutated. Two calls
  are deep-equal.

## Paths you may change
`packages/engine/**`, `docs/engine-rules.md` (contract, D-0191 §4).

## Contract impact
`docs/engine-rules.md`: new rule 12.2, D-0191 §4.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0519` and cite UF-08.2.

Per-package commands: write one command per script — `pnpm --filter <pkg> typecheck`, then a
separate `… lint`, then a separate `… test`. Listing several script names after one `--filter`
runs only the first; pnpm passes the rest to it as plain CLI arguments, so they never run.

## Build / accept log
Archived in `docs/tickets/log/T-0519.md` (D-0157).
