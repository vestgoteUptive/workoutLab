---
id: T-1023
title: "UF-08.2 Add an area puts a removed area back as it was (remember the removed items per visit, pass them to the engine), T-0999 bug"
lane: web-feature:UF-08
screens: [UF-08.2, UF-08.6]
decisions: [D-0290, D-0274, D-0276, D-0286]
deps: [T-1022]
status: ready
---
## Why
Remove Hamstrings then Add Hamstrings at 45 min says "No time left" (T-0999). The spec says one tap puts a removed area back. The engine can restore the removed items (T-1022, D-0290); the web must remember them for the visit and hand them over.

## Scope
- In (`apps/web/src/features/UF-08/`, mainly `AreaPlan.tsx`, `area-plan-engine.ts`): keep the items removed with a whole area in the visit state (removal by "Remove {Area}" on UF-08.2 and by removing the last exercise on UF-08.6). Pass them as `ctx.restore` to `addArea`, `areaCandidates` and the Fill the rest loop. Status line "{Area} added back." after a restore. Drop an area's remembered items when it re-enters the plan by any route. Clear all of it on a time or energy change, on Start, and on leaving the screen. Copy in `apps/web/src/lib/i18n/flows/uf-08.ts` (extra; orchestrator grant).
- Out: engine (T-1022), persistence of the memory (it is never stored), UF-09, the area order.
- Starts after T-1022 is merged and the UF-08 stack (T-0996, T-0997, T-1009, T-0999) is on the branch.

## Acceptance criteria
Test titles start `T-1023 ACn`. Unit tests in `apps/web/src/features/UF-08/__tests__/`; AC7 is the e2e.
- AC1 (restore) Given the 45-min plan, When Remove Hamstrings then Add Hamstrings, Then the plan has Leg curl x 2 again (same sets, reps and pre-fill), the row shows the same sets and "~{m} min" as before the removal, the status line says "Hamstrings added back.", and focus goes to the new row's stepper.
- AC2 (Add an area lists it) Given Hamstrings removed and nothing else changed, Then its row under "Add an area" reads Add (not "No time left") and Fill the rest is shown; given the restore does not fit (time left less than the old items cost after another area was added), Then the row reads "No time left" only if the top suggestion doesn't fit either.
- AC3 (fallback) Given an exercise of the removed area is now excluded (Never suggest) or already in the plan through a swap elsewhere, When Add, Then the area comes back as a fresh suggestion (3 sets, else 2) as before this ticket.
- AC4 (main lift) Given the removed area held the main lift, When Add with no main lift now, Then it is the main lift and first in the order; given "Start with this" made another lift main in between, Then it returns as a normal exercise of at most 3 sets and the main lift is unchanged.
- AC5 (time and other resets) Given Hamstrings removed, When a time chip changes the minutes, Then the Add is a fresh suggestion (memory cleared; the status line "Plan rebuilt for {n} min. Your set changes were cleared." as today). Same for an energy change and for Start workout then returning.
- AC6 ("Skipping today" and Fill the rest) Given Hamstrings is the only removed area, Then the "Skipping today: Hamstrings" line shows while it is out and is gone after Add back (also after the restore falls back to a fresh add). Given Fill the rest, Then a removed area it reaches comes back as it was; the order of areas is the engine's, unchanged.
- AC7 (e2e, `tests/e2e/uf-08-areas-first.spec.ts`) Given the default 45-minute plan, When the user removes Hamstrings and taps Add Hamstrings under "Add an area", Then Leg curl x 2 is back and the workout is not over budget; Start workout still works with 1 tap. A second case removes Hamstrings, changes to 30 min, adds Hamstrings, and gets a fresh suggestion, not "No time left" when it fits.
- AC8 (leaving) Given Hamstrings removed, When the user goes to UF-08.1 and returns, or reloads, Then the memory is gone and Add is a fresh suggestion. Nothing is written to storage or the network by the memory (offline and online alike).
- AC9 (states) Given zero history, returning after 10 days off, a 15-minute plan, offline, Then AC1 and AC2 hold with no network call.
- AC10 (a11y) Given axe at 320 and 390 px, Then no violations; the status line is the one polite line; focus never drops to `body`; Add targets at least 44 px with the name "Add {Area}".
- Planted faults: F1 memory not cleared on a time change (AC5 red); F2 memory kept after the area re-enters (AC1 second removal restores stale items, red); F3 restore items not passed to `areaCandidates` (AC2 red).

Checklist (D-0197 §7): fits/doesn't fit, main/not main, time changed/not, online/offline, one removed area/several.

## Paths you may change
- `apps/web/src/features/UF-08/**`, `apps/web/src/lib/i18n/flows/uf-08.ts` (extra; orchestrator grant), `tests/e2e/uf-08-areas-first.spec.ts`, `tests/e2e/uf-08-area-plan.spec.ts` (orchestrator grant: the "{name} added back." status copy)
- `docs/specs/areas-first-planning.md` only for a wording fix the build finds. Not parallel with another UF-08 ticket.

## Contract impact
none (uses the T-1022 engine input).

## Definition of done
Tests for every AC pass · `pnpm test:affected` with `--e2e` green (UF-08 e2e specs) · commit messages start with `T-1023` and cite UF-08.2.

## Build / accept log
