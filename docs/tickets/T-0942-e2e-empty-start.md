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
