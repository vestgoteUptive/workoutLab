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
