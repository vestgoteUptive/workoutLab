---
id: T-0999
title: "e2e: areas-first planning - tap budget from plan to Start, +/- and Remove, Add an area, Start empty, area detail, zero history, 10 days off, 15 minutes, offline, axe and 44 px"
lane: qa
screens: [UF-08.1, UF-08.2, UF-08.6, UF-09.1]
decisions: [D-0274, D-0275, D-0276, D-0280, D-0063]
deps: [T-0998]
status: todo
---
## Why
The owner's target is "no more than 2 edits and under 20 s from Plan to Start" (Start is on the plan since D-0280). Only the built PWA proves the tap budget and the offline path (D-0063 §3).

## Scope
- In: `tests/e2e/uf-08-areas-first.spec.ts` (and fixtures only if needed): the user path from UF-02.1 through UF-09.1.
- Out: unit behaviour (the web tickets), layer 1.

## Acceptance criteria
- AC1 (tap budget, both values) Given a signed-in user with the default plan, When the test counts taps from UF-08.2 shown to Start tapped, Then it is exactly 1 with no edit ("Start workout") and at most 3 with two edits (one `+` and one `−`); from UF-02.1 it is exactly 3 with no edit (Start workout, Suggest my workout, Start workout). Given a run that needs three edits, Then the count is 4 (the budget is documented, not hidden).
- AC2 (edit and start) Given Chest − , Back +, Start workout, Then UF-09.1 opens with the first item the main lift and the items in `orderItems` order.
- AC3 (Remove and Add an area) Given the Remove of an area and the add-back from "Add an area", Then the area returns with its default and the "Skipping today" line follows.
- AC4 (Start empty) Given "Start empty", Then no rows, Start workout disabled, one Add area enables "Start workout" and the workout starts.
- AC5 (area detail) Given an area opened, Not today, Undo, Swap and a local Add, Then the other areas' set counts are unchanged.
- AC6 (states) Given zero history (rows "0 of {target}"), a user returning after 10 days off (why chips), and a 15-minute budget (+ refused for time), Then each reads as the spec says.
- AC7 (offline, both values) Given the browser offline after load, Then AC1 to AC5 pass with no network request (the Supabase guard sees none) and the offline icon shows. Given online, Then the same.
- AC8 (a11y) Given axe on UF-08.2 and UF-08.6 at 320 and 390 px, Then no violations; targets at least 44 px; no sideways scroll.
- AC9 (principles) Given UF-08.1, Then the minutes control is shown before UF-08.2 on every path (principle 2) and onboarding to a first plan stays under 60 s (the existing timing spec passes).

## Paths you may change
`tests/e2e/**`

## Contract impact
none.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0999` and cite UF-08.2.

## Build / accept log
