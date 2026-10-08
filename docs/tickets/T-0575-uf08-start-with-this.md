---
id: T-0575
title: "UF-08 Start with this: compound-only action on UF-08.5 results and non-main UF-08.2 rows; suggest with mainLiftId = id; new main lift first; refusal copy; previous main lift back to the pool"
lane: web-feature:UF-08
screens: [UF-08.2, UF-08.5]
decisions: [D-0205, D-0109, D-0024]
deps: [T-0574]
status: todo
---
<!-- Written by product-owner 2026-10-08 (groom, D-0205 item C). Flow: wl-build-web (agent frontend-dev). About ¼ day. UF-08 folder order: T-0574 → this → T-0576. Reorder (T-0576) later makes "first" survive a user order; here the new main lift is first in engine order. -->

## Why
The owner: "I would like to add Back squat … because thats an exercise I prefer to start with." D-0205 §5: "Start with this" sets the engine's `mainLiftId` (rule 7.2 step 1 takes a compound only) and puts it first.

## Scope
- In (`apps/web/src/features/UF-08/**`, `lib/i18n/flows/uf-08.ts`):
  - **Action "Start with {name}"** on a UF-08.5 result that is a compound (also on an "In this workout" non-main compound row), and on a UF-08.2 item that is a non-main compound. Never on an isolation or on the main lift.
  - **Call:** one `suggest` with `mainLiftId = id`, `pinnedIds = addedIds` plus `id` when it came from the sheet as a new add, the T-0573 `excludeIds`. **Success** when the result's `plan.mainLiftId` is `id`: the plan updates, `id` joins `addedIds` if it was a new add, status "{name} is the main lift now.", the sheet (if open) closes and focus goes to the row. **Refusal** otherwise: plan unchanged, "{name} doesn't fit in {n} min. Pick more time." The previous main lift loses main status; if it isn't in `addedIds` it returns to the pool.
  - Every later re-suggest (chips, Shuffle, Add) keeps the new main lift (D-0109).
- Out: Reorder (T-0576; until then the new main lift is first because the engine places it first).

### Edge cases that are in scope
- **Time running out:** refusal at 15 min when it can't fit even at 2 sets (AC4); success at 15 min where X3 says it fits (AC3).
- **Offline:** runs on the device; AC2 runs once offline with no request.
- **Zero history:** fixtures. **Returning after 10 days:** AC2 repeated on the returning fixture asserts back-squat is main.
- **Isolation exercise:** no action (AC5).

## Acceptance criteria
Fixtures: L1, F-profile, F-history empty, R7-E4 plan at 30 min. Check X2/X3 against `suggest` before encoding; a disagreement goes to triage.
- **AC1 (actions offered)** Given the R7-E4 plan, Then Bench press (main) and Leg extension (isolation) have no "Start with this", and Inverted row has "Start with Inverted row". In UF-08.5, Back squat has "Start with Back squat" and Leg extension has Add but no "Start with this".
- **AC2 (X2 from the sheet)** When the user taps "Start with Back squat" in UF-08.5, Then one `suggest` call had `mainLiftId` "back-squat" and `pinnedIds` ["back-squat"], UF-08.2 shows back-squat × 4 first and marked as the main lift, bench-press × 3 not marked, straight-arm-pulldown × 2; 1545 s; the status says "Back squat is the main lift now." Offline: the same, no request.
- **AC3 (X3 at 15 min)** Given 15 min, When "Add Back squat" is refused and the user then taps "Start with Back squat", Then the plan is back-squat × 4 (main) only.
- **AC4 (refusal)** Given 15 min and a `suggest` stub (unit test) that returns the R7-E4-at-15-min plan with `mainLiftId` "bench-press" for the Start call, When the user taps "Start with Back squat", Then the plan is unchanged (bench-press × 4), `addedIds` is unchanged, and the sheet says "Back squat doesn't fit in 15 min. Pick more time." The stub is used only here, because no chip budget makes back-squat × 2 (390 s) miss as main in L1; the success path is always the real engine.
- **AC5 (from a UF-08.2 row)** Given the R7-E4 plan, When the user taps "Start with Inverted row", Then `suggest` had `mainLiftId` "inverted-row" and `pinnedIds` [], inverted-row is first and main, bench-press is not main (or absent), and the status says "Inverted row is the main lift now."
- **AC6 (kept by re-suggests)** After AC2, When the user taps 45 and then Shuffle, Then back-squat stays the main lift and first.
- **AC7 (e2e)** `uf-08-add.spec.ts` gains AC2 and AC5 in a real browser.

Checklist (D-0197 §7): compound/isolation (AC1); fits/doesn't fit (AC2, AC4); online/offline (AC2).

## Paths you may change
- `apps/web/src/features/UF-08/**` (lane)
- `apps/web/src/lib/i18n/flows/uf-08.ts` (own flow file)
- `tests/e2e/uf-08-add.spec.ts`

## Contract impact
None.

## Definition of done
Every AC has a passing test · `pnpm -w typecheck lint test` green · the UF-08 e2e specs green · contracts unchanged · commits start with `T-0575:` and cite UF-08.2 / UF-08.5.

## Build / accept log
