---
id: T-0935
title: "UF-08.2/UF-08.3: a swap survives Add, Shuffle, time chips and Start with this — swap-in pinned, swapped-out excluded for the visit"
lane: web-feature:UF-08
screens: [UF-08.2, UF-08.3, UF-08.5]
decisions: [D-0235, D-0205, D-0109, D-0191]
deps: []
status: ready
---
## Why
Bug report from the human (2026-11-13): after a swap on UF-08.3, adding an exercise on UF-08.5 puts the list back to the first suggestion. The swap only changes the shown `Workout`, and every re-suggest is rebuilt from `addedIds`, `excludeIds` and `mainLiftId`. D-0235 makes the swap part of the visit record.

## Scope
- In: `apps/web/src/features/UF-08/SessionSetup.tsx` (the `showSwap` `leave` handler), and UF-08 tests (unit and the UF-08 e2e).
- Out: engine changes, stored exclusions, persistence beyond the visit, UF-05.1 mid-workout swap.

## Acceptance criteria
- AC1 Given UF-08.2 with a suggested non-main item A, When the user swaps A for B on UF-08.3 and then adds exercise C on UF-08.5, Then the plan holds B and C and does not hold A, and the `suggest` input has `pinnedIds` containing B then C and `excludeIds` containing A.
- AC2 Given AC1's swap of A for B, When the user taps Shuffle, Then B is still in the plan and A is not.
- AC3 Given AC1's swap of A for B, When the user picks another time chip that still fits B, Then B is still in the plan and A is not.
- AC4 Given the main lift M, When the user swaps M for N and then adds C, Then N is the main lift (`mainLiftId` N in the `suggest` input, `isMain` on N's row) and M is not in the plan.
- AC5 Given an added (pinned) exercise P, When the user swaps P for Q, Then `pinnedIds` holds Q where P was and not P (this replaces the old "takes it off the pins" test).
- AC6 Given a swap of A for B, When the user then adds A back through UF-08.5, Then A leaves the visit's `excludeIds` and is in the plan (or the normal cap or no-fit refusal shows).
- AC7 Given a swap with "Don't suggest again" unticked, Then the stored excluded list is not written (only the visit list changes). With it ticked, the stored write behaves as today (D-0199).
- AC8 Given a swap, When the user goes Back to UF-08.1 and taps Suggest, Then the fresh plan has no pin and no visit exclusion from that swap (D-0109 §1).
- AC9 Given a user-reordered plan (Reorder mode), When a swap is followed by Add, Then B keeps A's position and C is appended (D-0205 merge).
- AC10 e2e (Playwright, `tests/e2e`): swap then Add on UF-08.2 keeps the swap-in. This test must fail on the current `main`.

## Paths you may change
`apps/web/src/features/UF-08/**`, `tests/e2e/uf-08*.spec.ts`

## Contract impact
none (D-0235)

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0935` and cite screen IDs.

## Build / accept log
**2026-11-13 frontend-dev (build).** Base `main-hzlbfc` 37cd4441, worktree clean. `SessionSetup.tsx` swap handler: a non-main swap-in replaces the old pin, or is added as the last pin; the swapped-out id joins the visit `excludeIds` (never stored); the swap-in leaves `excludeIds`. A main-lift swap adds no pin. Display per D-0240 §1-§2: `swappedOut` keeps swap-outs off the Removed line, and `unlabelledPins` keeps swap-ins off "Added by you". Commit a95e3457.

AC→test (`apps/web/src/features/UF-08/__tests__/swap-pins.test.tsx` unless named):
- AC1: "AC1 a non-main swap, then Add" (2 tests: Add of Lateral raise; a refused Add keeps the pin).
- AC2: "AC2 Shuffle after a swap".
- AC3: "AC3 a time chip after a swap" (45 and 60).
- AC4: "AC4 a main-lift swap, then Add" (Add, then Shuffle).
- AC5: "AC5 a swap of an added (pinned) exercise" + `add-exercise.test.tsx` "…puts the swap-in in its place on the pins" (replaces "takes it off the pins").
- AC6: "AC6 adding the swapped-out exercise back" (fits at 45; refusal at 30).
- AC7: "AC7 the stored excluded list" (unticked: no write; ticked: one write).
- AC8: "AC8 Back to UF-08.1 discards the swap".
- AC9: "AC9 Reorder, then a swap and Add".
- AC10: `tests/e2e/uf-08-swap-pins.spec.ts`.
- Also `swap-before-start.test.tsx` T-0303c AC-2: after a chip, expects the D-0235 inputs (`excludeIds ["barbell-row"]`, `pinnedIds ["db-row"]`) instead of `excludeIds: []`.

Red on unfixed code (37cd4441 `SessionSetup.tsx` copied in, fix restored with `cp` and checked with `cmp`):
- Unit: 14 failed (AC1-AC6, AC7 unticked, AC9, the AC5 test in add-exercise, T-0303c AC-2).
- AC10 e2e: failed at line 79, `row("db-row")` expected 1, got 0 (the swap-in is lost after Add).

Planted faults, each red, restored by `cp`:
- Removed line lists swap-outs → the Removed-line test fails.
- Suggest keeps the visit record → AC8 fails.
- The swap also writes the stored list → both AC7 tests fail.
- Swap-ins labelled "Added by you" → AC1 and AC5 fail.
- Swap-in always added as the last pin → AC5 fails.

Gate:
- web turbo typecheck lint test `--force --concurrency=1`: 4/4, 4944 tests.
- format:check and lint:e2e: green.
- Playwright uf-08-*: 73 passed.
- check:repo: only `ticket-not-on-base`, because the base is `main-hzlbfc`, not `main`.

**2026-11-13 frontend-dev (review round 2).** Merged `main-hzlbfc` (D-0240). The record gains `mainPickId`, set by a main-lift swap or "Start with this" and cleared by Remove. "Start with this" now moves a main lift the user chose on this visit to the front of the pins (D-0239 §2 applied in suggested mode, QA finding). A main lift that isn't already a pin also joins `unlabelledPins`. An engine-picked main lift still returns to the pool (D-0205 §5, start-with-this AC5). `swappedIn` is renamed `unlabelledPins`.

New tests (`swap-pins.test.tsx`):
- Swapping back (A→B→A).
- Swapping to an exercise removed earlier.
- The chain A→B→C.
- Remove of a swap-in.
- "Start with this" on a swap-in.
- Two demote tests: a main-lift swap-in, and a main lift from an earlier "Start with this".

Red runs:
- On 37cd4441: all 7 new tests fail (19 of 22 in the file).
- Fault A (the swap-in isn't removed from the exclusion lists) → swap-back and swap-to-removed fail.
- Fault B (no demote) → both demote tests fail.
- Fault C (a demoted swap-in labelled "Added by you") → both demote tests fail.
