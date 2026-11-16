---
id: T-0950
title: "End-to-end tests for adding an exercise during a workout: first-time user, back after 10 days off, time running out, offline and reload, finishing before sync, and accessibility"
lane: qa
screens: [UF-09.9, UF-09.10, UF-09.6, UF-03.3, UF-10.1]
decisions: [D-0243, D-0244, D-0245, D-0246]
deps: [T-0949]
status: todo
---
## Why
The add spans the engine, UF-08, UF-09, the device store and sync. These browser tests check the whole path a user takes, including the edge cases the spec lists.

## Scope
- In: a new `tests/e2e/uf-09-add-exercise.spec.ts` and any fixture it needs under `tests/e2e/**`.
- Out: unit-level checks already owned by T-0945/T-0947/T-0948/T-0949.

## Acceptance criteria
- AC1 (B1, zero history) Given a new user with no history and a 45-min plan, paused during a rest after bench-press set 2, When they open Add exercise, Then the lead line reads "{m} min left" and no Favorites section shows; When they add Lateral raise, Then UF-09.9 reads "Lateral raise added after Bench press.", and after Resume and finishing bench-press the next screen is UF-09.6 Lateral raise with a null-weight × 10 pre-fill.
- AC2 (B13) Given a user whose last lateral-raise was 10 days ago at 10 kg × 12, When it is added, Then its first set is pre-filled 10 kg × 10.
- AC3 (B3/B4, time running out) Given a 30-min plan paused late enough that under 60 s is left, Then the lead line reads "No time left" and Add shows "Lateral raise doesn't fit. No time left."; given 2–3 min left (sibling), Then "doesn't fit in the 2 min left."
- AC4 (B14) Given offline, When an add succeeds and the page reloads, Then the workout resumes paused with the added item and every logged set; When back online, Then the server `sessions.plan` holds the added item.
- AC5 (B21, D-0246 §17) Given offline after an add, When the workout is finished, Then the UF-03.3 summary lists the added exercise as planned.
- AC6 (B20) Given bench-press with 2 logged sets swapped for db-bench-press, When the sheet opens, Then Bench press reads "In this workout" with no Add.
- AC7 (B16, B19) Given the sheet open, When Escape is pressed and when browser Back is used, Then only the sheet closes, focus is on "Add exercise" and the workout is still paused; Given a pause from UF-09.8, Then no "Add exercise".
- AC8 (B19) Given the sheet after a reload straight into UF-09 (SessionSetup never loaded), Then every button is ≥ 44 px and axe reports no violations on the sheet and on UF-09.9.
- AC9 (B18) Given 3 lateral-raise sets logged on the added item, Then UF-10.1 shows shoulders' 14-day load up by 3.

## Paths you may change
`tests/e2e/**`

## Contract impact
none.

## Definition of done
Every AC has a passing e2e test · `npx playwright test tests/e2e/uf-09-add-exercise.spec.ts` green via `scripts/locked.sh heavy` · `pnpm -w typecheck lint test` green · commit messages start with `T-0950` and cite UF-09.10.
