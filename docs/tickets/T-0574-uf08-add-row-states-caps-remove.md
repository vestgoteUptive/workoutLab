---
id: T-0574
title: "UF-08.5 Add exercise part 2: disabled row states (Excluded, equipment, level, Skipping today, recovering) with aria-describedby, the two cap refusals, Remove of an added item, re-adding a removed item"
lane: web-feature:UF-08
screens: [UF-08.5, UF-08.2]
decisions: [D-0205, D-0191, D-0199, D-0202, D-0024]
deps: [T-0573]
status: todo
---
<!-- Written by product-owner 2026-10-08 (groom, D-0205 item B part 2). Flow: wl-build-web (agent frontend-dev). About ⅓ day. UF-08 folder order: T-0573 → this → T-0575. -->

## Why
D-0205 §3 §4 §6: a row the user can't add must say why in text (never colour alone), the 8-item and 2-per-area caps get their own copy, and Remove/re-add of an added item follow D-0191 §4.

## Scope
- In (`apps/web/src/features/UF-08/**`, `lib/i18n/flows/uf-08.ts`):
  - **Row states**, first match wins, after T-0573's "In this workout": (2) stored excluded → "Excluded. Include it again in Plan › Excluded exercises." (UF-08.5 never writes the list); (3) `isEligible(e, {...profile, level: "advanced"}, [])` false → "Not available with your equipment"; (4) `isEligible(e, profile, [])` false → "Above your level"; (5) a primary area in UF-08.1's Skip today → "Skipping {Area} today"; (6) a primary area in `recoveringAreas(history, library, now)` → "{Area} is recovering". Disabled actions are `aria-disabled` with the line as `aria-describedby`. An exercise removed on this visit is not disabled.
  - **Cap refusals** (the id isn't in the result and main + added already hold): 8 items → "This workout has 8 exercises, the most it can hold."; two items with its primary area → "This workout already has two {Area} exercises." Otherwise T-0573's time copy.
  - **Remove of an added item:** the D-0191 Remove (`removeItem`, no `suggest`, the id joins the visit removes so the Removed line and its "Never suggest" apply), and the id leaves `addedIds`. If it was the main lift, `mainLiftId` becomes null.
  - **Re-add a removed item:** Add passes `excludeIds` without it; on success it leaves the visit removes (and the Removed line).
- Out: Start with this (T-0575); Reorder (T-0576); Favorites (T-0577).

### Edge cases that are in scope
- **Recovering** needs history: AC1 seeds 6 hard leg-curl sets at `now − 24 h`. **Zero history:** no recovering line (AC1's sibling).
- **Returning after 10 days:** nothing recovers, so Leg curl has Add (AC2).
- **Offline:** all states compute on the device; AC1 runs once offline with no request.
- **Time running out:** the cap lines vs the time line (AC3, AC4).

## Acceptance criteria
Fixtures: L1, F-profile, the R7-E4 plan unless stated.
- **AC1 (disabled reasons)** Given bench-press in the plan, pull-up (intermediate) in the library with level beginner, Skip today [calves], 6 hard leg-curl sets at `now − 24 h` and stored exclusions [dead-bug], When UF-08.5 searches each name, Then Bench press shows "In this workout" and no Add; Dead bug "Excluded. Include it again in Plan › Excluded exercises."; Pull up "Above your level"; Calf raise "Skipping Calves today"; Leg curl "Hamstrings is recovering"; each disabled button has `aria-disabled="true"` and `aria-describedby` pointing at its line; a tap makes no `suggest` call. Given equipment [], Then Back squat shows "Not available with your equipment". The same assertions hold offline with no request.
- **AC2 (no history)** Given F-history empty or the returning-after-10-days fixture, Then Leg curl has Add enabled (no recovering line).
- **AC3 (area cap)** Given main bench-press and added [db-bench-press] at 90 min, When the user adds push-up, Then the plan is unchanged and the sheet says "This workout already has two Chest exercises."
- **AC4 (8-item cap)** Given a plan where main + added are 8 items (budget 120), When the user adds a ninth, Then the plan is unchanged and the sheet says "This workout has 8 exercises, the most it can hold."
- **AC5 (remove an added item)** Given X1, When the user removes Back squat, Then `removeItem` was called and no `suggest`, the plan is bench-press × 4 and straight-arm-pulldown × 2, the Removed line lists Back squat with "Never suggest", `addedIds` is empty, and a following time chip doesn't bring it back.
- **AC6 (re-add)** After AC5, When the user adds Back squat from UF-08.5, Then the `suggest` call's `excludeIds` has no back-squat, it is in the plan, and it is gone from the Removed line. Given leg-extension removed on this visit, Then UF-08.5 shows Leg extension with Add enabled.
- **AC7 (removed main lift)** Given the user made an added compound the main lift (set the record's `mainLiftId` directly in the unit test; T-0575 adds the UI), When it is removed, Then the record's `mainLiftId` is null and the next chip re-suggest picks one.
- **AC8 (e2e)** `uf-08-add.spec.ts` gains AC1's Excluded and recovering rows and AC5 in a real browser.

Checklist (D-0197 §7): with/without history (AC1, AC2); online/offline (AC1); enabled/disabled rows (AC1, AC6).

## Paths you may change
- `apps/web/src/features/UF-08/**` (lane)
- `apps/web/src/lib/i18n/flows/uf-08.ts` (own flow file)
- `tests/e2e/uf-08-add.spec.ts`

## Contract impact
None.

## Definition of done
Every AC has a passing test · `pnpm -w typecheck lint test` green · the UF-08 e2e specs green · contracts unchanged · commits start with `T-0574:` and cite UF-08.5 / UF-08.2.

## Build / accept log
