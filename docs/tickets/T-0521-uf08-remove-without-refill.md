---
id: T-0521
title: "UF-08.2 Remove drops the row without refilling it, through engine removeItem (zero suggest calls); the id stays in excludeIds; empty-plan copy \"No exercises left\" (GitHub #33)"
lane: web-feature:UF-08
screens: [UF-08.2]
decisions: [D-0191, D-0109, D-0065]
deps: [T-0519, T-0520]
status: todo
groomed: 2026-10-06
---
<!-- Groomed 2026-10-06 by product-owner from GitHub #33 (D-0191 §4-§5). Build flow: wl-build-web.
About ⅓ day. Waits for T-0520 only because both edit features/UF-08. -->

## Why
GitHub #33: "I couldn't deselect those workout items." Today Remove re-runs `suggest`
(`SessionSetup.tsx:269-275`), and the engine refills the freed time from the same area, so a
removed leg exercise is replaced by another one. D-0191 §4 makes Remove a pure engine
`removeItem` (T-0519): the row goes, and nothing takes its place.

## Scope
- In: `onRemove` calls `removeItem(adjusted.workout, exerciseId)` instead of `suggest`, then
  appends the id to the record's `excludeIds`. The `mainLiftId: null` special case goes, because
  `removeItem` sets it. The bar and the totals text update from the returned `Workout` (D-0109 §5).
  The D-0109 §6 focus rule is unchanged. Add the empty-plan copy "No exercises left. Pick a time to
  rebuild." for a plan emptied by Remove (D-0191 §5).
- Out: changing Shuffle or the time chips (they still re-suggest, D-0109 §2), and the swap sheet.

## Acceptance criteria
Fixture: UF-08.2 showing W (R7-E4: bench-press × 4 main, inverted-row × 3, leg-extension × 2,
30 min, warm-up on).
- AC1 (no refill) Given W, When Remove on leg-extension is pressed, Then the rows are exactly
  bench-press and inverted-row, `suggest` was called 0 times for the action (spy),
  and `removeItem` once. The bar text reads "About 25 of 30 min" (ceil(1455 / 60) = 25), and the
  unused segment grows to 345 s.
- AC2 (excluded later) Given AC1, When Shuffle is pressed, Then that `suggest` call's `excludeIds`
  contains "leg-extension" and its `mainLiftId` is "bench-press".
- AC3 (main) Given W, When Remove on bench-press is pressed, Then the rows are inverted-row and
  leg-extension and no row is marked main. The next Shuffle's `suggest` call has `mainLiftId: null`
  and `excludeIds` containing "bench-press".
- AC4 (emptied) Given a one-row plan (15 min, bench-press × 4), When Remove is pressed, Then the
  list shows "No exercises left. Pick a time to rebuild.", not "Nothing fits in 15 min", and
  "Looks good" stays enabled (D-0065 §3). Given a plan that was empty from the start (all nine
  areas skipped on UF-08.1, T-0520 AC7, 30 min), Then "Nothing fits in 30 min" is still shown
  (the other value of the condition).
- AC5 (focus, D-0109 §6, regression) After Remove on the middle row, focus is on the Remove button
  of the row now at that index. After Remove on the last row, focus is on the new last row's
  Remove. When none is left, focus is on "Looks good".
- AC6 (with Skip today) Given UF-08.1 with Quads skipped (T-0520) and the resulting plan, When any
  accessory is removed, Then no `suggest` call is made and the "Skipping today: Quads" line stays.
- AC7 (e2e) Extend the UF-08 Playwright spec: Suggest at 30 min, remove the last accessory, and
  assert the row count dropped by one and no new exercise name appeared.

## Paths you may change
`apps/web/src/features/UF-08/**`, `apps/web/src/lib/i18n/flows/uf-08.ts`,
`tests/e2e/uf-08-setup.spec.ts` (listed explicitly).

## Contract impact
none (uses T-0519's engine function).

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0521` and cite UF-08.2.

## Build / accept log
Archived in `docs/tickets/log/T-0521.md` (D-0157).
