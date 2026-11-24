---
id: T-0999
title: "e2e: areas-first planning - tap budget from plan to Start, +/- and Remove, Add an area, Start empty, area detail, zero history, 10 days off, 15 minutes, offline, axe and 44 px"
lane: qa
screens: [UF-08.1, UF-08.2, UF-08.6, UF-09.1]
decisions: [D-0274, D-0275, D-0276, D-0280, D-0063]
deps: [T-0998]
status: done
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

### QA build log (T-0999, 2026-11-24)
New spec `tests/e2e/uf-08-areas-first.spec.ts` (16 tests: AC1 to AC5 each online and offline, AC6 x3, AC8 x2 widths, AC9). Reuses `fixtures/uf-08-start.ts` (`startEmpty`, `addArea`) and `settledBox`; the Focus-mode disclosure, the time-chip rebuild and the 390/320/160 px layout stay in `uf-08-area-plan.spec.ts` and `uf-08-area-detail.spec.ts` (not repeated; AC8 here adds the screens in their edited/empty/UF-08.6 states).

AC to test:
- AC1 `AC1 online/offline`: Today to Start = 3 taps; plan to Start = 1; Chest − and Hamstrings + then Start = 3; three edits = 4 (at 45 min). Measured 0.9 s (no edit) and 0.5 to 1.0 s (two edits), asserted under 20 s.
- AC2 `AC2`: 65 min, Chest 4 to 3, Back 5 to 6, "Back: 6 sets, 0 min left."; the stored plan (IndexedDB) has 3 chest and 6 back sets, the main lift first, tiers main, compound, isolation in order, and UF-09.3 opens on the main lift. App note: at the default 45 min a Chest − frees 3 min and Back + is refused for time, so AC2 uses 65.
- AC3 `AC3`: Glutes − then Remove; status, "Skipping today" and the title follow; Add an area brings back Glutes at 3 sets and the line goes.
- AC4 `AC4`: Start empty, no rows, Start workout aria-disabled with "Add at least one area.", a forced tap does nothing, one Add enables it, workout starts.
- AC5 `AC5` (60 min, Shoulders removed first for room): Not today and Undo, Swap, a local Add; the other areas' sets equal before.
- AC6 `zero history`, `10 days off` (Back 3 of 20, Shoulders 1.5 of 16, chips Glutes, Calves, Shoulders; Chest in Add an area with 3 of 20), `15 minutes` (one row, + refused with the time sentence, 8 candidates "No time left", no Fill the rest).
- AC7 the same five tests with the network off after load: offline icon on UF-08.2, and no request to the Supabase origin (listener after `goOffline`).
- AC8 `AC8 at 390 / 320 px`: axe, every control at least 44 px, no sideways scroll on UF-08.2 (plan, edited, Start empty) and UF-08.6 and the Add sheet.
- AC9 `AC9`: UF-08.1 with the minutes control before UF-08.2 from Start workout, Quick 20-min and a direct visit and Start empty; `uf-01-onboarding` "3 activations ... < 5 s" passes.

Runs: new spec `--repeat-each 2`: 32 passed. `uf-08-area-plan` + `uf-08-area-detail`: 16 passed. Planted faults (each red, restored, `cmp` identical): AC1 count 3 to 2; AC2 Back 6 to 5; AC3 status copy; AC4 Start not disabled; AC5 others compared with Hamstrings included; AC6 zero history 0 to 1 and "No time left" copy; AC7 expected request list; AC8 target 44 to 200; AC9 minutes "45" to "30".

App findings (not edited): (1) Default 45-min plan: Remove Hamstrings (Leg curl, 2 sets, ~5 min) then "Add Hamstrings" reads "No time left" with 40 of 45 min used, so the area cannot be put back, against "one tap puts it back" (AC3, areas-first-planning.md). Add seems to price Romanian deadlift, not the Leg curl the plan had. AC3 is proven on Glutes, which does return. (2) The default 45-min plan has few + that fit (only Hamstrings; Back/Glutes refused for time, Calves at its cap).
