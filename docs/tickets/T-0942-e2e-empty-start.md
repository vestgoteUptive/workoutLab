---
id: T-0942
title: "e2e: empty-start flow — zero history, returning after 10 days off, offline, time chip drop and restore, axe and 44 px"
lane: qa
screens: [UF-08.1, UF-08.2, UF-08.4, UF-08.5, UF-09.1]
decisions: [D-0236, D-0238, D-0239, D-0063]
deps: [T-0939, T-0941]
status: todo
---
## Why
Empty-start planning (`docs/specs/empty-start-plan.md`) spans UF-08.1 → UF-08.2 → UF-08.4 → UF-09 and must work offline (D-0063 §3). This ticket proves the user path end to end in the built PWA, on top of T-0940/T-0941's component tests.

## Scope
- In: a new `tests/e2e/uf-08-empty-start.spec.ts` with the e2e fixtures' seeded user and library; zero-history and returning-after-10-days users (add a fixture under `tests/e2e/fixtures/` if none matches); axe and target-size checks.
- Out: unit coverage (T-0940, T-0941); engine properties (T-0936); the full web e2e suite (run only this spec plus `uf-08-*.spec.ts` unless the fixtures change, D-0178).

## Acceptance criteria
- AC1 (B1) Given a signed-in zero-history user on UF-08.1 at 30 min, When they tap "Start empty", Then UF-08.2 shows "Nothing here yet. Pick from the suggestions or add an exercise.", "3 of 30 min · 27 min left", and "Looks good" with `aria-disabled="true"`.
- AC2 (B2) Given AC1, Then the Suggestions list's first row carries the "Main lift" tag and the rows are the plan suggested mode would show at 30 min for this user, in the same order (compare with a "Suggest my workout" run in the same test).
- AC3 (B3) Given AC2, When the user taps the "Main lift" row's Add, Then it is the first item in "Your workout", the status announces "{name} added. {left} min left.", and focus is on the next row's Add.
- AC4 (B4) Given AC1, When the user taps the last suggestion's Add, Then it is the only item and no main lift is shown; then tapping every remaining suggestion's Add, one at a time, never shows a refusal.
- AC5 (B7, B21) Given a main-lift pick and one accessory pick at 30 min, When the user picks 20 min, Then the accessory is listed in "Doesn't fit in 20 min: …"; When the user picks 30 again, Then both are back and the main lift is first.
- AC6 (B15) Given a user whose history is the returning-after-10-days fixture, When they tap "Start empty" at 30 min, Then the suggestions are the same exercises, in the same order, as "Suggest my workout" gives that user at 30 min.
- AC7 (B16) Given the app loaded once online, When the browser context goes offline and the user does AC1, AC3 and taps "Looks good" then Start, Then UF-09.1 opens with the picked items and the `sessions` write sits in the offline queue (synced after going back online). Given online (sibling), the same flow writes immediately.
- AC8 (B17) Given one pick at 45 min, When the user taps "Looks good", Then UF-08.4 shows "1 exercise" and Start opens UF-09.1 with that exercise.
- AC9 (a11y) Given UF-08.1 and UF-08.2 in empty mode (0 items, with picks, and with the list full), Then axe reports no violations, every Add, "Other suggestions", "Fill the rest for me", "Start empty" and "Looks good" target is at least 44 × 44 px, and after each Add `document.activeElement` is not `body`.
- AC10 Given the spec run against the commit before T-0940 (or with "Start empty" absent), Then AC1 fails (recorded red run in the log).

## Paths you may change
`tests/e2e/**`

## Contract impact
none

## Definition of done
Tests for every AC pass · `npx playwright test tests/e2e/uf-08-empty-start.spec.ts` and `tests/e2e/uf-08-*.spec.ts` green through `scripts/locked.sh heavy` (full suite only if `tests/e2e/fixtures/**` changed) · `pnpm -w typecheck lint test` green · commit messages start with `T-0942` and cite UF-08.1/UF-08.2.

## Build / accept log
- 2026-11-20 QA. Branch t/T-0942-e2e-empty-start from main 3c5f0d2b (clean). New `tests/e2e/uf-08-empty-start.spec.ts`, 11 tests, no fixture changes (histories are built in the spec, relative to now).
- AC map: AC1 (B1) "AC1" test; AC2 (B2) "AC2" (rows compared by name + detail with a "Suggest my workout" run); AC3 (B3) "AC3"; AC4 (B4) "AC4" (last Add first, then every remaining Add, no refusal); AC5 (B7, B21 accessory) "AC5" (20 chip lists "Inverted row", 30 restores, main first); AC6 (B15) "AC6" (returning fixture = R7-E30 as day offsets); AC7 (B16) offline (goOffline gate, IndexedDB pending row with both ids, 0 writes fulfilled, one write after goOnline) plus the online sibling; AC8 (B17) "AC8" (summary "1 exercise", stored/sent plan = the pick); AC9 UF-08.1 test and UF-08.2 test (0 items, with picks, full list: axe, 44 px, focus never body, focus on Add exercise when the list empties); AC10 below.
- B21 main-lift drop is not reachable: the smallest chip is 20 min and bench-press x 4 fits at 20 (unit-covered by T-0940/T-0941); the spec proves the accessory path only.
- Green: new spec 11/11; with all `uf-08-*.spec.ts` 84/84 (`scripts/locked.sh heavy npx playwright test -c tests/e2e/playwright.config.ts ... --trace off`).
- Planted faults (app code, backed up in scratchpad, restored with cp + cmp, tree clean after): F1 "Start empty" button `display:none` (AC10) -> 11/11 red (AC1 fails); F2 drop `aria-disabled` on Looks good -> AC1 and offline AC7 red; F3 suggestion-Add focus goes to "Add exercise" instead of the next row -> AC3 red; F4 first suggestions call without autoMainLift -> AC2, AC3, AC4, AC5, AC6 red. (A first F1 try with the `hidden` attribute stayed visible through CSS and passed; discarded.)
- Defects: none found. Note: `aria-disabled` Looks good is "not enabled" to Playwright, so the no-op tap uses `click({ force: true })`.
- Round 2 (review fixes, spec only): `expectTargets44` now asserts count > 0 per target (a missing control fails); AC9 waits for 1 item row before reading focus; AC7/AC8 skip the warm-up on UF-09.1 and assert the first picked exercise's h1 (UF-09.1 leads with "Warm-up"); AC1 waits for 0 rows + disabled Looks good before `not.toHaveURL`; AC4 status regex tightened to "min over" (no Main-lift-tag check: with no main pick `autoMainLift` is true, so a later suggestion may legitimately be tagged); returning fixture uses local-noon calendar-day offsets. Plant: "Other suggestions" not rendered in Suggested.tsx -> AC9 UF-08.2 red ("other-suggestions should be on screen"), restored with cp + cmp. Green: spec 11/11; all `uf-08-*.spec.ts` 82/84 (two T-0600 tests in uf-08-setup.spec.ts, untouched, failed under load; both pass on rerun 11/11 with `-g T-0600`); `-w format:check` and `-w lint:e2e` clean.
