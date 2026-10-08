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
- Built from HEAD 065c050 (clean). `Suggested.tsx`: the row name is a `<button data-part="row-name" aria-label="How to {name}">` (44px min-height, own target apart from Swap/Remove) that sets local `howToId` state and renders `UF-04` `ExerciseHowTo` (static import, as UF-03); the sheet restores focus to its opener on unmount. No engine/plan state is touched. String `uf08.howTo`; CSS in `uf-08.css` (tokens only).
- AC→test: AC-1 and AC-5 name: `__tests__/how-to.test.tsx` (button per row, opens, plan/handlers untouched); AC-2: same file (Close and Escape return focus, order and no scrollTo); AC-3: same file (offline, fetch never called) plus e2e (setOffline then reopen); AC-5 axe with sheet open: unit (axe-core) and `tests/e2e/uf-08-setup.spec.ts` "T-0581" (also 44px, 390px screenshot).
- Planted faults (backup copy, restored by `cp`): drop aria-label → 6 red; no-op onClick → 5 red; li key changes on close (button remounts) → focus tests red; onShuffle on click → plan-unchanged red; fetch on click → offline red. All green after restore.
- Red on first gate: `exports-and-lint` AC-13 (my `font-family: inherit` in CSS); fixed with `font: inherit` then size/weight.
- AC-4 (UF-08.3 swap candidates): not done, optional; SwapSheet lives in UF-05 (outside this lane) so the affordance would need a UF-05 change. Follow-up.
- Gate: vitest UF-08 352 pass; e2e `uf-08` 36 pass (incl. T-0581 case). Screenshot (390px, sheet open) copied to scratchpad `uf08-howto-after.png`.
