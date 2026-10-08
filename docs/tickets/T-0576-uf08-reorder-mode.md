---
id: T-0576
title: "UF-08.2 Reorder mode (Move up/down, warm-up fixed, other controls hidden, Done) + order merge across re-suggests (new main lift first) + Start writes sessions.plan in display order"
lane: web-feature:UF-08
screens: [UF-08.2, UF-08.4, UF-09.1]
decisions: [D-0205, D-0109, D-0191, D-0024]
deps: [T-0575]
status: todo
---
<!-- Written by product-owner 2026-10-08 (groom, D-0205 item D). Flow: wl-build-web (agent frontend-dev). About ½ day. UF-08 folder order: T-0575 → this → T-0577. -->

## Why
The owner: "I also would like to reorder exercises in a workout, maybe because of natural order or busy machine." D-0205 §7: a UI-only permutation the engine never reads (principle 3), kept across re-suggests and run in that order by UF-09.

## Scope
- In (`apps/web/src/features/UF-08/**`, `lib/i18n/flows/uf-08.ts`):
  - **"Reorder"** button in the UF-08.2 list header. Reorder mode: each item row shows name, sets × reps and "Move {name} up" / "Move {name} down" (≥ 44 px; first row no Move up, last no Move down); the warm-up row stays first with no controls; Swap, Remove, Start with this, Add exercise, Shuffle, the time chips and "Looks good" are **not in the DOM**; "Done" leaves the mode with focus on "Reorder". After a move, focus stays on the same button of the moved row in its new place, or on the other button when the used one disappears at the top or bottom; `role="status"` "{name} moved to {k} of {N}." No drag.
  - **Record** gains `order: string[] | null` (null = engine order). The UI permutes `plan.items` (totals unchanged, warm-up not regenerated). `isMain` stays on the main lift wherever it sits.
  - **Merge** after every new plan (Shuffle, chip, Add, Start with this): `order` null → engine order. Otherwise surviving items keep the user's relative order, a new main lift goes first, other new items follow in engine order. Remove drops the id from `order`; a UF-08.3 swap replaces it in place. "Start with this" puts the new main lift first even in a user order. The time bar's segments follow display order.
  - **Start (UF-08.4)** writes `sessions.plan.items` in display order; `plan.mainLiftId` and every `isMain` are the engine's. UF-08.4 lists that order.
  - Back to UF-08.1 drops `order` with the record.
- Out: reorder during a workout (T-0578/T-0579); reorder on UF-03.1 (D-0205: none in v1); drag.

### Edge cases that are in scope
- **Offline:** reorder and Start run on the device; the session row is queued (AC6).
- **One item:** neither Move button shows; Reorder is still offered and "Done" works (AC1 sibling).
- **Time running out:** a shorter chip that drops items keeps the survivors' order (AC3).
- Zero history: fixtures. Returning after 10 days: no order-specific behaviour (the merge is history-independent); AC3 runs once on the returning fixture asserting relative order only.

## Acceptance criteria
Fixtures: L1, F-profile, F-history empty, the R7-E4 plan (bench-press × 4 main, inverted-row × 3, leg-extension × 2).
- **AC1 (reorder)** When the user taps Reorder and "Move Leg extension up" twice, Then the rows read Leg extension, Bench press, Inverted row; the warm-up row is still first; focus is on "Move Leg extension down"; the status says "Leg extension moved to 1 of 3."; Swap, Remove, Add exercise, Shuffle, the time chips and "Looks good" are not in the DOM until "Done"; Bench press is still marked as the main lift. When the user taps Done, Then focus is on "Reorder". Given a one-item plan, Then the row has no Move buttons.
- **AC2 (no suggest)** AC1 makes zero `suggest` calls and the bar's total is unchanged (1545 of 1620 s).
- **AC3 (order survives a re-suggest)** Given AC1's order, When the user taps 45, Then the surviving items among leg-extension, bench-press and inverted-row keep that relative order, every new item follows them in the engine's order, and the bar's segments follow the display order. Given AC1's order and 20 min, Then the survivors keep their relative order.
- **AC4 (new main lift first)** After AC3, When the user taps "Start with Inverted row", Then Inverted row is first and main, and the other survivors keep their relative order after it.
- **AC5 (remove and swap)** Given AC1's order, When the user removes Inverted row, Then `order` no longer has it and the rest keep their order. When the user swaps Bench press on UF-08.3 for Dumbbell bench press, Then the new item takes Bench press's place.
- **AC6 (order reaches the workout)** Given AC1's order, When the user taps Looks good and Start (online and, separately, offline), Then the stored `sessions.plan.items` are leg-extension, bench-press, inverted-row; `plan.mainLiftId` is bench-press; UF-09.1 names Leg extension; offline, the row is queued and no request is made until online.
- **AC7 (per visit)** Given a user order, When the user goes Back to UF-08.1 and taps "Suggest my workout", Then the plan is R7-E4 in engine order.
- **AC8 (e2e + axe)** `uf-08-add.spec.ts` (or a new `uf-08-reorder.spec.ts`) covers AC1 and AC6 (online) in a real browser; axe has no violations in Reorder mode.

Checklist (D-0197 §7): `order` null/non-null (AC3, AC7); online/offline Start (AC6); first/last row (AC1).

## Paths you may change
- `apps/web/src/features/UF-08/**` (lane)
- `apps/web/src/lib/i18n/flows/uf-08.ts` (own flow file)
- `tests/e2e/uf-08-add.spec.ts`, `tests/e2e/uf-08-reorder.spec.ts` (new file)

## Contract impact
None (`sessions.plan.items` is already an ordered array, D-0205 §10).

## Definition of done
Every AC has a passing test · `pnpm -w typecheck lint test` green · the UF-08 and UF-09 e2e specs green · contracts unchanged · commits start with `T-0576:` and cite UF-08.2 / UF-08.4.

## Build / accept log
