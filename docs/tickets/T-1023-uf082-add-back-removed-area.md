---
id: T-1023
title: "UF-08.2 Add an area puts a removed area back as it was (remember the removed items per visit, pass them to the engine), T-0999 bug"
lane: web-feature:UF-08
screens: [UF-08.2, UF-08.6]
decisions: [D-0290, D-0274, D-0276, D-0286]
deps: [T-1022]
status: done
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
- `apps/web/src/features/UF-08/**`, `apps/web/src/lib/i18n/flows/uf-08.ts` (extra; orchestrator grant), `tests/e2e/uf-08-areas-first.spec.ts`
- `docs/specs/areas-first-planning.md` only for a wording fix the build finds. Not parallel with another UF-08 ticket.

## Contract impact
none (uses the T-1022 engine input).

## Definition of done
Tests for every AC pass · `pnpm test:affected` with `--e2e` green (UF-08 e2e specs) · commit messages start with `T-1023` and cite UF-08.2.

## Build / accept log

- Built from `main-hzlbfc` + T-1022 (clean tree, HEAD af6b593c). `Adjusted.restore` (SessionSetup) holds the items removed with a whole area (UF-08.2 Remove; UF-08.6 last-exercise Remove), passed as `ctx.restore` (`editContext`) to `addArea`, `areaCandidates` (`overviewOf`) and `fillRest`. Cleared by the time chip (`resuggest`); gone with the visit state on Start/leaving/reload; per area dropped by `pruneRestore` on Add, Fill, UF-08.5 add, "Start with this". New copy `areaAddedBack` "{Area} added back." Fill shown for a removed area with memory (`restorableAreas`).
- Decisions in the build: (1) `fillRest` now reaches a removed area only when its memory restores it (a fresh add of a removed area is still never done by Fill; D-0290 §7). (2) A UF-08.6 last-exercise Remove puts that id in the visit's excludes (D-0191), so the engine finds the restore invalid and falls back to a fresh suggestion; the memory is kept as the ticket says. (3) The restore is "as it was at removal": the Remove control only appears at 2 sets, so the old sets are the reduced ones.
- AC7 second case: at 30 min the rebuild fills the minutes, so Hamstrings reads "No time left" right after the chip; the e2e frees time (Chest out) first, then Add gives the fresh "Hamstrings added. n min left."
- Deliberate test updates (area-plan.test.tsx): AC5 add of Calves now reads "Calves added back."; AC6 Fill the rest no longer asserts "never brought back" (it comes back as it was when reached).
- AC to test (`__tests__/restore-area.test.tsx`, e2e in `tests/e2e/uf-08-areas-first.spec.ts`): AC1 "Remove Hamstrings then Add" (+ Add exercise re-entry test) · AC2 two tests (enabled + Fill shown; No time left when nothing fits) · AC3 UF-08.6 removal falls back to fresh · AC4 two tests (main lift returns first; demoted to <=3 sets after "Start with this") · AC5 time chip, Start then new visit · AC6 Skipping line, Fill restores · AC7 e2e x2 (`--repeat-each 2` green) · AC8 leave to UF-08.1 (no fetch, no setItem), fresh mount · AC9 3 states x offline/online · AC10 axe, one status, focus, name "Add Hamstrings".
- Planted faults (backup, `cp` restore, `cmp` equal, none committed): F1 no clear on time change -> AC5 time-chip test red (1 failed); F2 no drop on re-entry + append on capture -> the Add exercise re-entry test red (1 failed; the first attempt with a wrong sed and a plan-dependent id stayed green and was fixed, not kept); F3 `areaCandidates` without restore -> 7 tests red (AC1, AC2, AC5, AC6, AC8, AC9 x2).
- Red runs on unfixed code: first e2e run red x4 (my own over-broad "No time left" locator and the 30-min case above), fixed in the spec.
- Gates: web unit suite 417 files / 5415 tests green; typecheck, lint, `-w format:check`, `check-all.mjs` clean; `uf-08` e2e 123 passed, T-1023 e2e `--repeat-each 2` 4 passed. The first full uf-08 e2e run was red x3 on old copy (T-0996 happy path "added", T-0999 AC3 online/offline "added" and Glutes 3 sets): updated to "added back" and 2 sets (as removed); `tests/e2e/uf-08-area-plan.spec.ts` is outside the ticket's path list, one line changed there (flagged to the orchestrator).
- Review nits fixed: (1) the loose AC6 test in `area-plan.test.tsx` is replaced by a pointer to `restore-area.test.tsx` AC6 and `area-plan-engine.test.ts` (exact assertions). (2) `restorableOf` (area-plan-engine.ts) asks the engine (`putIn(...).restored`), so Fill the rest is shown for a removed area only when it will restore it; test "restorableOf ..." and "fillRest skips ...". (3) The UF-08.6 last-exercise Remove no longer captures memory: that id is in the visit's `excludeIds` (D-0191 §4), so a restore could never use it; memory holds only items removed with a whole area (D-0290 §1); the AC3 test now expects a fresh "Hamstrings added." (4) `pruneRestore` drops items with no home area (test).
- Planted faults: F2' `restorableOf` without the `restored` check -> the restorableOf test red (restored, cmp equal). F3' capturing the UF-08.6 item again -> no test can go red: the engine's validity check (excluded id) masks it, so the behaviour is identical; the guard is the code and the comment, and the AC3 test pins the outcome.
- Lane check: `check-all` refuses the one-line copy update in `tests/e2e/uf-08-area-plan.spec.ts` (not in the ticket's paths, grant is read from main), so it was reverted. That spec's "Suggest, one set less, Remove, Add it back, a chip, Start workout" test is red until line 119 expects `${name} added back.`; needs a grant on main or a QA/orchestrator edit.
