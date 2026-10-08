---
id: T-0573
title: "UF-08.5 Add exercise part 1: sheet over UF-08.2, search, Today's areas, In this workout, Add = this visit's pinnedIds (one suggest, the rest adjusts), Added by you, time refusal, Shuffle/time chips keep adds with the Doesn't fit line, per visit, offline"
lane: web-feature:UF-08
screens: [UF-08.5, UF-08.2, UF-08.1]
decisions: [D-0205, D-0109, D-0191, D-0199, D-0024, D-0071]
deps: [T-0538, T-0572]
status: todo
---
<!-- Written by product-owner 2026-10-08 (groom, D-0205 item B, split in two for size: this is B part 1, T-0574 is part 2). Flow: wl-build-web (agent frontend-dev). About ½ day. UF-08 folder order (never in parallel): T-0538 (done) → this → T-0574 → T-0575 → T-0576 → T-0577 → T-0571. -->

## Why
The owner (D-0205 Context): "I would like to search and add exercise … If I can add some exercises manually the rest are adjusted." D-0205 §1 §2 §4 §8: a sheet over UF-08.2 whose Add puts the exercise in this visit's `pinnedIds` and re-suggests the rest. Spec: `docs/specs/uf-08-add-and-reorder.md`.

## Scope
- In (`apps/web/src/features/UF-08/**`, `lib/i18n/flows/uf-08.ts`):
  - **"Add exercise"** button under the UF-08.2 item list, above Shuffle. Opens UF-08.5 (`data-screen-id="UF-08.5"`) as a sheet, the UF-08.3 pattern: no URL change; Close, Escape and browser Back close it with focus back on "Add exercise". Not reachable from UF-02, UF-03, UF-09 or UF-11.
  - **UF-08.5** per T-0572: header, lead line "The rest of your workout adjusts to fit {n} min.", search field "Search exercises" focused on open (case-insensitive name substring over kind `exercise`, by name then id, no warm-up), no-match line "No exercises match “{query}”.", empty query "Today's areas" (exercises with weight 1.0 in a primary area of a current item, grouped by area in the fixed order, by name then id), and with no items "Search to find an exercise.".
  - **Row:** name, primary areas, **Add** ("Add {name}"). Row state **"In this workout"** (no Add) for an exercise already in the plan. The other disabled states are T-0574; Start with this is T-0575; the Favorites section and tag are T-0577.
  - **Setup record** (D-0109 §1) gains `addedIds: string[]` (add order). **Add {id}:** one `suggest` call with `mainLiftId` = the current plan's, `pinnedIds = [...addedIds, id]`, `excludeIds` = sorted(dedupe(stored ∪ visit removes)) without `id`, every other input from the record. If `id` is in the result: the result is the plan, `id` is appended to `addedIds`, the sheet closes, focus goes to the new row, status "{name} added.", and the row's reason line is "Added by you". Otherwise: plan and `addedIds` unchanged, the sheet stays open, status "{name} doesn't fit in {n} min. Start with it instead, or pick more time." (compound) / "{name} doesn't fit in {n} min. Pick more time." (isolation). T-0574 adds the two cap lines.
  - **Shuffle and time chips** pass `pinnedIds = addedIds` (today `[]`). After any re-suggest, ids in `addedIds` missing from the plan are listed under the list: "Doesn't fit in {n} min: {names}." (add order); they stay in `addedIds`.
  - **Per visit:** Back to UF-08.1 drops `addedIds` with the record; nothing is written before Start.
  - e2e `tests/e2e/uf-08-add.spec.ts` (new).
- Out: excluded/equipment/level/skip/recovering row states, the caps copy, Remove of an added item, re-adding a removed item (T-0574); Start with this (T-0575); Reorder (T-0576); Favorites (T-0577, T-0571).

### Edge cases that are in scope
- **Offline:** search and Add run on the device with no request (AC8).
- **Time running out:** an add that doesn't fit is refused (AC5); a shorter chip drops an add and shows the line (AC6).
- **All items removed, then Add:** a full plan is re-suggested around it (AC7).
- **Zero history:** every fixture. **Returning after 10 days:** nothing recovers, so X1 holds (AC4 runs once more on the returning fixture and asserts X1's item ids).
- **Duplicate add:** prevented by "In this workout" (AC1).

## Acceptance criteria
Fixtures: L1, F-profile, F-history empty, the R7-E4 plan on UF-08.2 (30 min, warm-up on, `available` 1620), no favorites, no exclusions. Engine examples X1–X4 are from the spec; **check each against `suggest` before encoding it**; a disagreement goes to triage with the derivation (no silent edit).
- **AC1 (open, empty query)** When the user taps "Add exercise", Then UF-08.5 opens with focus in "Search exercises" and "Today's areas" lists Chest, Back and Quads groups in that order; Quads lists Back squat (Add) and Leg extension ("In this workout", no Add); Bench press shows "In this workout". When the user presses Escape, Then the sheet closes and focus is on "Add exercise".
- **AC2 (search)** When the user types "SQU", Then the results are every kind-`exercise` row whose name contains "squ" case-insensitively, by name then id, and no warm-up move. When they type "zzz", Then "No exercises match “zzz”."
- **AC3 (one suggest call)** When the user taps "Add Back squat", Then exactly one `suggest` call was made, with `pinnedIds` `["back-squat"]`, `mainLiftId` `"bench-press"` and `excludeIds` `[]`.
- **AC4 (X1, the rest adjusts)** After AC3, Then UF-08.2 shows bench-press × 4 (main), back-squat × 3, straight-arm-pulldown × 2, the bar reads 1545 of 1620 s, Back squat's reason line is "Added by you", focus is on its row, and the status says "Back squat added."
- **AC5 (time refusal)** Given 15 min, When the user taps "Add Back squat", Then the plan is still bench-press × 4, `addedIds` is empty, the sheet is open, and it says "Back squat doesn't fit in 15 min. Start with it instead, or pick more time." Given 15 min and "Add Leg extension" not fitting, Then "Leg extension doesn't fit in 15 min. Pick more time." In every case Σ item cost ≤ `available`.
- **AC6 (time chip and Shuffle keep adds)** Given X1, When the user taps 20, Then the plan is X4 (bench-press × 4, straight-arm-pulldown × 2) and "Doesn't fit in 20 min: Back squat." shows. When they tap 30, Then X1 again and the line is gone. When they tap Shuffle on X1, Then back-squat × 3 is still at position 2 and every `suggest` call had `pinnedIds` `["back-squat"]`.
- **AC7 (all removed, then add)** Given every item removed, Then UF-08.5's empty query shows "Search to find an exercise."; When the user searches "back squat" and adds it, Then the plan contains back-squat and an engine-chosen main lift, Σ cost ≤ `available`.
- **AC8 (offline)** Given `navigator.onLine` false, When the user opens UF-08.5, searches and adds Back squat, Then AC4's result holds and no network request was made.
- **AC9 (per visit)** Given X1, When the user goes Back to UF-08.1 and taps "Suggest my workout", Then the plan is R7-E4 and no item reads "Added by you"; no server write happened.
- **AC10 (e2e)** `uf-08-add.spec.ts` covers AC1, AC4 and AC6 in a real browser, plus axe on UF-08.5 with an empty and a non-empty query.

Checklist (D-0197 §7): online/offline (AC4, AC8); empty/non-empty query (AC1, AC2); empty/non-empty plan (AC1, AC7); fits/doesn't fit (AC4, AC5).

## Paths you may change
- `apps/web/src/features/UF-08/**` (lane)
- `apps/web/src/lib/i18n/flows/uf-08.ts` (own flow file)
- `tests/e2e/uf-08-add.spec.ts` (new file)

## Contract impact
None (D-0205 §10).

## Definition of done
Every AC has a passing test · `pnpm -w typecheck lint test` green · the UF-08 e2e specs green · contracts unchanged · commits start with `T-0573:` and cite UF-08.5 / UF-08.2.

## Build / accept log
