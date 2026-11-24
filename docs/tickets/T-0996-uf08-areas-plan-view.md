---
id: T-0996
title: UF-08.2 Today's plan by area - title, area rows with - / + sets, Add an area, Fill the rest, automatic order, Start empty with no areas
lane: web-feature:UF-08
screens: [UF-08.1, UF-08.2, UF-08.4]
decisions: [D-0274, D-0275, D-0276, D-0191, D-0235]
deps: [T-0993, T-0994, T-0995]
status: todo
---
## Why
The owner spends the pre-workout time rearranging exercises. UF-08.2 becomes the area plan (`docs/specs/areas-first-planning.md`), built from `UF-08.2.md` (T-0993) and the engine functions of T-0994 and T-0995. Time is still asked first on UF-08.1 (principle 2).

## Scope
- In (`apps/web/src/features/UF-08/`): a new area-plan view replacing the exercise list in `Suggested.tsx` (split into new files if large); the plan is `orderItems(…)` of the engine result, then `areaGroups` for the rows; rows call `adjustAreaSets`, `removeArea`, `addArea`, `areaCandidates` through the host's `run` seam (principle 3: no area or exercise is picked in the web); the title and time lines; the time bar with a segment per area; why chips and the Skip-today line kept; "Add an area" list with reasons; "Fill the rest for me"; time chips (a change rebuilds, drops set edits and added areas, keeps removed areas, swaps, adds, excludes, status line); "Start empty" from UF-08.1 opens it with no areas; "Looks good" opens UF-08.4 with the ordered plan written as it shows. The status line, focus rules and copy of the spec. Copy in `apps/web/src/lib/i18n/flows/uf-08.ts`. A stepper Remove adds the area to this visit's skipped areas (`avoidAreas`).
- UF-08.6 rows open a route that T-0997 builds: here the row's open button goes to `?step=area&area={area}` and a cold or unknown step lands on UF-08.1.
- Out: the area detail page (T-0997), retiring Reorder, Shuffle and empty-mode code (T-0998; they are unreachable but present until then), any engine, data or token change.

## Acceptance criteria
Fixtures: zero history; balanced; returning after 10 days off; 15-minute; `navigator.onLine` false. Test titles start `T-0996 ACn`.
- AC1 (title) Given the default plan for 45 min, When UF-08.2 renders, Then the `h1` reads "Today: {areas joined by ' · '}" in the engine's priority order, with "45 min · done by HH:MM" under it. Given no areas (Start empty), Then "Today: pick your areas".
- AC2 (rows) Given the default plan, Then there is one row per `areaGroups` entry with the area name, "~{m} min", `− k sets +`, "Last 14 days: {load} of {target} sets" and "{n} exercises", and no exercise name appears on the row.
- AC3 (+ both values) Given an area with room and time, When "One set more for {Area}" is tapped, Then that area's sets rise by 1 and the status line says so. Given no room (the area is full) or no time, Then the button is `aria-disabled`, focusable, a tap changes nothing and the row shows "No time for another set. Pick more time or remove a set elsewhere." or "{Area} already has the most sets it can hold."
- AC4 (− and Remove, both values) Given an area at 3 sets, When "One set less for {Area}" is tapped, Then 2 sets. Given an area at 2 sets, Then the control reads "Remove" with the name "Remove {Area}"; tapping it removes the area, adds it to the skipped areas ("Skipping today" shows it), lists it under "Add an area", and focus moves to the row now in its place or to "Add an area" when none is left.
- AC5 (Add an area) Given an area not in the plan, When "Add {Area}" is tapped, Then it joins with its engine default and the status line says so; an area that is recovering, skipped, without an exercise, or with no time shows its reason ("Recovering", "Skipping today", "No exercise available", "No time left") and its Add is `aria-disabled`.
- AC6 (Fill the rest) Given time for more areas, When "Fill the rest for me" is tapped, Then areas are added until nothing fits and the button disappears. Given nothing fits (15-minute plan), Then it is not shown.
- AC7 (order) Given a plan whose engine order is accessory-first, Then the order UF-08.4 lists and the plan written at Start equals `orderItems` (main lift first); and the row order stays the area priority order.
- AC8 (time chip) Given edits (+1 chest, a swap, an added exercise, a removed area), When a time chip is tapped, Then the set edits and added areas are dropped, the swap, the add and the removed area stay, and the status line reads "Plan rebuilt for {n} min. Your set changes were cleared."
- AC9 (Start empty, both entries) Given "Start empty", Then UF-08.2 has no rows, "Add an area" is open, "Looks good" is `aria-disabled` with "Add at least one area." and a tap does nothing; after one area is added it is enabled. Given "Suggest my workout", Then the default plan shows and "Looks good" is enabled.
- AC10 (states) Given zero history, Then rows read "0 of {target} sets" and no attention styling. Given returning after 10 days off, Then the why chips name the areas furthest below target. Given a 15-minute budget, Then few areas and "+" refused for time. Given everything skipped or recovering, Then no rows, the reasons list and "Looks good" disabled. Given an over-budget swap, Then the line says "{over} min over" in words, no colour change, and + / Add / Fill are refused with "Your workout is {over} min over. Remove or swap an exercise first."
- AC11 (offline and online) Given `navigator.onLine` false, Then every AC above holds with no network call and the offline icon shows. Given online, Then the same.
- AC12 (principles) Given UF-08.2, Then UF-08.1's minutes control is unchanged and shown before it (principle 2), no UF-09 control exists here, the web calls no `suggest` to pick areas for an edit, and "Looks good" is the only `--wl-action` fill.
- AC13 (a11y) Given axe, 320 and 390 px, Then no violations, no sideways scroll, targets at least 44 px, unique accessible names per row, one polite status line, focus never on `body`.
- AC14 (deliberate test updates) Every existing test that pins the old list is updated with a one-line reason in the log, none weakened; `exports-and-lint` and `jsx-no-literals` pass.
- Planted faults (log, backup restored with `cp`): F1 the web picks the area itself (AC12 red); F2 + ignores the time refusal (AC3 red); F3 a time chip keeps set edits (AC8 red); F4 Remove forgets the skipped area (AC4 red).

Checklist (D-0197 §7): room/no room, time/no time, empty/non-empty plan, online/offline, available/unavailable area, Start empty/Suggest.

## Paths you may change
`apps/web/src/features/UF-08/**`, `apps/web/src/lib/i18n/flows/uf-08.ts` (extra; orchestrator grant, as T-0940), `tests/e2e/uf-08-*.spec.ts` (only to keep existing specs passing if shared markup moves). Not parallel with another UF-08 ticket.

## Contract impact
none.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0996` and cite UF-08.2.

## Build / accept log
