---
id: T-0581
title: "UF-08.2: tap an exercise to see how to do it (reuse the UF-04 how-to sheet)"
lane: web-feature:UF-08
screens: [UF-08.2, UF-08.3]
decisions: [D-0205]
deps: []
status: todo
---

## Why
The owner (2026-10-08, screenshot of UF-08.2): "In this screen when planning my workout it's difficult sometimes to remember each exercise what they do. Description is good in the exercise list but not here where it's needed." UF-08.2 rows show only the name, sets × reps, load, time and reason. The how-to (steps, cues, common mistakes, body figure) lives on UF-04.2. `features/UF-04/ExerciseHowTo.tsx`, already opened from UF-09.9 (Pause) and UF-03, can be reused.

## Acceptance criteria
- AC-1: on UF-08.2, each exercise row's name is a button (accessible name "How to do {name}"; 44 px target, separate from the Swap and Remove targets). It opens the existing ExerciseHowTo sheet for that exercise: steps, cue, common mistakes, primary/secondary areas and the body figure from T-0558, if the sheet includes it. The plan is not changed.
- AC-2: closing the sheet returns focus to the row's name button. The plan, any manual order (D-0205) and the scroll position are unchanged.
- AC-3: works offline from the cached library.
- AC-4: the same affordance on the UF-08.3 swap candidates is optional. Add it only if it fits the sheet without crowding; otherwise note it in the log.
- AC-5: tests for open, close and focus return, offline, and the accessible name, each proven by a planted fault. axe on UF-08.2 with the sheet open.

## Paths you may change
- `apps/web/src/features/UF-08/**`, `apps/web/src/lib/i18n/flows/uf-08.ts`, `tests/e2e/uf-08-*.spec.ts`
- Importing `features/UF-04/ExerciseHowTo` is allowed, the same way UF-09 and UF-03 do it. Don't edit UF-04.

## Contract impact
None.

## Ordering
UF-08 is busy with add/reorder (T-0573..T-0577). Run this before T-0573: it's small and independent. Otherwise run it after T-0577.

## Build / accept log
Archived in `docs/tickets/log/T-0581.md` (D-0157).
