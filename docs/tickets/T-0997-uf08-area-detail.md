---
id: T-0997
title: UF-08.6 Area detail - exercises behind an area with Swap, Not today, Remove, Start with this and a local Add exercise
lane: web-feature:UF-08
screens: [UF-08.2, UF-08.3, UF-08.5, UF-08.6]
decisions: [D-0274, D-0275, D-0276, D-0235, D-0199, D-0205]
deps: [T-0996]
status: todo
---
## Why
Exercises are a detail the user opens only if they want to (`docs/specs/areas-first-planning.md`). Swap, add and remove stay, behind the area row, and an Add must not reshuffle the other areas (D-0274 §5).

## Scope
- In (`apps/web/src/features/UF-08/`): the UF-08.6 step (`?step=area&area=`), its rows (name, Favorite and Main lift tags, sets × reps · weight · min, reason or "Added by you", how-to) and actions: **Swap** (UF-08.3 sheet, D-0235 pin and visit exclude), **Not today** (`rankSwaps` with `equipment_taken`, first candidate, `applySwap`; the original joins the visit's excludes; row "{old} · Not today · Undo"; "No other exercise fits. Use Swap." when none), **Remove** (`removeItem`, the Removed line and Never suggest as today), **Start with this** (non-main compound), **Add exercise** (UF-08.5 opened with this area's exercises first; an Add is `insertItem` with `leftS = unusedS`, local, 3 sets else 2, refusals as UF-08.5; the exercise goes into the visit pins). The last exercise removed returns to UF-08.2 with "{Area} removed. Add it back below." Back returns focus to the opened row. After each change the plan is `orderItems`-ed.
- In, extras: `apps/web/src/lib/i18n/flows/uf-08.ts`.
- Out: any change to UF-08.5's own search, UF-09, engine, data, learning counts (T-1003).

## Acceptance criteria
Test titles start `T-0997 ACn`.
- AC1 (open and back) Given a row on UF-08.2, When its open button is tapped, Then UF-08.6 shows that area's exercises in run order and Back returns with focus on that row. Given a cold load of `?step=area&area=chest` with no visit, Then UF-08.1 shows.
- AC2 (swap) Given an exercise, When Swap and a candidate are confirmed, Then the row shows the swap-in, the swap-in is a pin and the swapped-out one is excluded for the visit (D-0235); a time rebuild on UF-08.2 keeps it.
- AC3 (Not today, both values) Given an exercise with an alternative, When "Not today" is tapped, Then it is replaced by the first `equipment_taken` candidate, the line "{old} · Not today · Undo" shows, Undo restores it, and nothing is written to the excluded list or the queue. Given no alternative homed in the same area (D-0288 §1), Then "No other exercise for {Area} today. Use Swap." and the plan is unchanged.
- AC4 (Remove and Never suggest) Given Remove, Then the exercise and its sets leave, the freed time stays unused, and the Removed line offers "Never suggest" (stored list write, as today); offline the button is `aria-disabled` with "Connect to change excluded exercises". Given the last exercise of the area, Then UF-08.2 shows with "{Area} removed. Add it back below." and the area under "Add an area".
- AC5 (local Add, both values) Given Add exercise and a result that fits, Then it joins the area at 3 sets (2 if only 2 fit), no other area's items change (deep-equal), and focus goes to the new row. Given one that doesn't fit, Then the sheet refuses with "{name} doesn't fit in {n} min." Given an exercise whose area isn't in the plan, Then the area is added.
- AC6 (Start with this) Given a non-main compound, When "Start with this" is tapped, Then it is the main lift and first in the order; main and isolation rows have no such button.
- AC7 (order) Given any change, Then the shown and stored order equals `orderItems`.
- AC8 (online and offline) Given `navigator.onLine` false, Then AC2 to AC7 hold with no network call except the disabled stored-list buttons. Given online, Then the same.
- AC9 (states) Given zero history, returning after 10 days off, and a 15-minute plan, Then rows, reasons and refusals read as in the spec.
- AC10 (a11y) Given axe at 320 and 390 px, Then no violations, unique names ("Swap {name}", "Not today, {name}", "Remove {name}"), targets at least 44 px, focus rules of the spec, no UF-09 control.
- AC11 (deliberate test updates) Existing tests for Swap, Remove, Add and Start with this move to UF-08.6 with a one-line reason each.
- Planted faults: F1 an Add re-suggests other areas (AC5 red); F2 Not today writes the excluded list (AC3 red); F3 Undo leaves the original excluded (AC3 red).

Checklist (D-0197 §7): alternative/none, fits/doesn't fit, online/offline, area in plan/not.

## Paths you may change
- `.squad/decisions/D-0288-uf08-area-detail-defaults.md`, `.squad/decisions/INDEX.md` (orchestrator grant: the area-detail defaults decision)
`apps/web/src/features/UF-08/**`, `apps/web/src/lib/i18n/flows/uf-08.ts` (extra; orchestrator grant), `tests/e2e/uf-08-*.spec.ts` (only to keep existing specs passing). Not parallel with another UF-08 ticket.

## Contract impact
none.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0997` and cite UF-08.6.

## Build / accept log
- T-0997 build (frontend-dev). UF-08.6 is `AreaDetail.tsx` (view) with host wiring in `SessionSetup.tsx` (`?step=area&area=`, `pastSetup` keeps the plan, Swap/Not today/Remove/Start with this/local Add, every change `orderItems`-ed). `blocked.ts` holds the UF-08.5 disabled-row reasons moved out of the legacy branch; the host's `startWith`/`addExercise` helpers now sit in the shared `(showSuggested || showArea)` block. `AddExerciseSheet` gets `firstArea`. Copy in `flows/uf-08.ts`, styles in `uf-08.css` (tokens only). Decision D-0288 (Not today is literally the first candidate even if homed elsewhere; Start with this keeps the D-0205 suggest path).
- AC to test (`__tests__/area-detail.test.tsx`, titles `T-0997 ACn`): AC1 open + order + Back focus, cold load, unknown area, area not in plan · AC2 swap pin/exclude/time rebuild/focus · AC3 Not today both values (alternative in place + Undo, candidate homed elsewhere opens UF-08.2, none) with no excluded write · AC4 Remove, Never suggest offline/online, last exercise · AC5 Add fits (3 sets, `insertItem` with `leftS = unusedS`, no `suggest`, others unchanged, focus), 2 sets, no fit, area added, area first in the sheet, time chip keeps it (T-0996 AC8) · AC6 Start with this · AC7 order · AC8 offline/online, no fetch · AC9 zero history, returning, 15 min · AC10 axe, unique names, tokens; layout/44 px/320/390/160 in `__e2e__/uf-08-area-detail.spec.ts` · AC11 below.
- T-0996 review follow-ups folded in: `AreaPlan` says "Couldn't change that. Your plan is unchanged." when `onRemoveArea` or `onAdjust(-1)` is refused and "Nothing more fits." when Fill adds nothing (tests `T-0997 follow-up 1/2`); `SessionSetup` Ready branch comment on why `data === null` can't reach it. Focus on Back from UF-08.6 and from UF-08.3 restored (host `returnFocus`, `focusSwapId`).
- AC11 deliberate test updates: `area-plan.test.tsx` "T-0996 AC2 open button" now expects UF-08.6 (it expected UF-08.1 while the page didn't exist) and keeps the cold-load check; `exports-and-lint.test.ts` importer lists add `AreaDetail.tsx` (it shows the reason line). The old per-row Swap/Remove/Add/Start with this tests stay on `legacyExerciseList` until T-0998 deletes them with the code.
- Planted faults (backup copy, `cp` restore, `cmp` clean, none committed): F1 local Add also calls `resuggest` -> AC5 red; F2 Not today calls `excludeExercise` -> AC3 x2 and AC8 x2 red; F3 Undo leaves the original excluded -> AC3 red; F4 changes not `orderItems`-ed -> AC4, AC5 x2, AC7 red; F5 review fix 1 removed -> follow-up 1 red; F6 review fix 2 removed -> follow-up 2 red.
- Gates (2026-11-24): web `tsc -b` 0; web lint 0; web `vitest run` 420 files, 5576 tests green; `-w format:check` clean; `check-all.mjs` only `lane-path-not-owned` for `docs/tickets/T-0996-*.md` (T-0996's own ticket, already on the stack). E2E: new spec (copied to `tests/e2e` for the run, removed) 6 of 6 green at 390, 320, 160 px incl. axe, 44 px, offline. `tests/e2e/uf-08*`: 44 pass, 47 fail, the same count as T-0996 (retired exercise list; T-1019).
- T-0997 coordinator change: Not today now takes the first `rankSwaps` candidate homed in the same area (`primaryAreas[0]`, D-0287 §4) and otherwise refuses with "No other exercise for {Area} today" (D-0288 §1 updated; the "{old} replaced by {new}" UF-08.2 notice is gone). Tests: AC3 no candidate in the area (leg extension, back squat is Glutes), AC3 no candidate at all, AC3 same-area replacement + Undo, AC3 exclusion/pin on rebuild. Planted faults (cp/cmp, not committed): FA take `[0]` regardless of area -> AC3 no-candidate-in-area red; FB refusal text not shown -> both AC3 refusal tests red. Gates and e2e rerun below.
Gates rerun after the change: tsc -b 0, lint 0, web vitest 420 files / 5576 tests green, format:check clean, e2e spec 6/6 (copied to tests/e2e and removed).
