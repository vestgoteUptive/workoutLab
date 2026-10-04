---
id: T-0487
title: "tests/e2e/uf-03-list-summary.spec.ts T-0458 AC-3: Focus mode now correctly returns to UF-09.5 (a rest), not UF-09.3, after T-0477"
lane: qa
screens: [UF-03.1, UF-09.5]
decisions: [D-0175]
deps: [T-0477]
status: ready
---
<!-- Written 2026-10-04 by orchestrator, from a T-0477 build finding (its own Notes section
pre-authorized this as a qa follow-up, not an edit inside that ticket). Build flow: wl-build-qa.
Small: one test file, one assertion. -->

## Why
T-0477 (D-0175 §1) made `REST_START` startable from `getReady`, `warmup` and `next` — phases
where it was previously a no-op. `tests/e2e/uf-03-list-summary.spec.ts`'s AC-3 test opens a fresh
session (`openSessionOffline`, landing on `UF-09.1`, which is in the `getReady`/`warmup` window),
opens the List view, and checks row 1. Before T-0477, that check started no rest, so clicking
"Focus mode" afterward correctly returned to `UF-09.3` (the current step). After T-0477, checking
that row during `getReady`/`warmup` now correctly starts a rest, so "Focus mode" correctly returns
to `UF-09.5` (rest) instead. The test's final assertion is stale, not the product: T-0477's own
build log confirms this is the one e2e regression expected, and its Notes section explicitly says
"If that test goes red, the product is right and the spec's expectation is stale."

## Scope
- In: `tests/e2e/uf-03-list-summary.spec.ts`, the AC-3 test only (the final three lines: the
  "Focus mode" click and its two assertions).
- Out: Any other test in this file. `apps/web/src/features/UF-09/**` (T-0477's own lane, already
  merged and correct). Any other `tests/e2e/**` file.

## Acceptance criteria
- **AC-1 (assertion updated, proven against current main).** Change the final assertion block to
  expect `[data-screen-id="UF-09.5"]` visible (not `UF-09.3`), with `[data-screen-id]` still
  `toHaveCount(1)`. Confirm it passes against `main` as it stands after T-0477's merge.
- **AC-2 (still proves what it always proved).** The rest of AC-3 (axe clean, every row toggle
  and text field at least 44×44) is unchanged. Don't touch the `openSessionOffline`/`openListView`
  setup or the row-check steps.
- **AC-3 (fault proof).** On a backup copy, revert the assertion to `UF-09.3`. The test must fail
  (not pass) against current `main`, confirming the change is load-bearing and not just a stale
  expectation nobody would notice regressing. Restore from the backup; record both runs.

## Paths you may change
- `tests/e2e/uf-03-list-summary.spec.ts` (the AC-3 test only).
- `docs/tickets/T-0487-uf03-ac3-focus-return-after-t0477.md` (this file, accept log only).

## Contract impact
None.

## Definition of done
AC-1 passes. `scripts/locked.sh heavy` full gate green (`-w typecheck lint test --concurrency=1`,
`-w test:repo-checks`, `-w format:check`, `node .github/scripts/check-all.mjs`), plus the full e2e
suite (this touches `tests/e2e/**`). Commits start `T-0487` and cite UF-03.1/UF-09.5.

## Notes
- This is the only test file this ticket may touch. If running the full e2e suite surfaces any
  *other* spec whose assertions assumed the old getReady/warmup no-op behavior, stop and report it
  as a new finding rather than silently also fixing it here — T-0477's own Notes only flagged this
  one row.

## Build / accept log
Archived in `docs/tickets/log/T-0487.md` (D-0157).
