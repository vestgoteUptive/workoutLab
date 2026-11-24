---
id: T-1019
title: "Move the 47 UF-08 e2e checks that pin the retired exercise list onto the areas-first flow (UF-08.2 area plan, UF-08.6 area detail), and retire the ones for removed features"
lane: qa
screens: [UF-08.1, UF-08.2, UF-08.3, UF-08.5, UF-08.6]
decisions: [D-0274, D-0280, D-0286, D-0287]
deps: [T-0997, T-1009, T-0998]
status: done
---
## Why
T-0996 replaced the UF-08.2 exercise list with the area plan. 47 existing e2e checks pin the old list (per-row Swap/Remove/Start with this, Reorder, Shuffle, Add exercise, empty-mode Suggestions, kg text on rows, the T-0600 restyle on exercise rows): `uf-08-add` 4, `uf-08-empty-start` 11, `uf-08-excluded` 1, `uf-08-favorites` 1, `uf-08-level-change` 3, `uf-08-reorder` 1, `uf-08-swap-pins` 1, `uf-08-setup` ~25. They cannot pass until UF-08.6 (T-0997), the folded Start (T-1009) and the retirement (T-0998) exist. Until then the UF-08 tickets stack on each other's ticket branches (T-0997 from `t/T-0996-*`, and so on) and reach the squad branch together, so its CI stays green.

## Acceptance criteria
- AC1 Each failing check is either rewritten against the new flow with the same intent (swap, pin, favorite, excluded, level notice, Start with this now on UF-08.6; Start on UF-08.2) or deleted with a one-line reason in the log citing D-0274 (Reorder, Shuffle, Suggestions, empty mode).
- AC2 The T-0996 spec `apps/web/src/features/UF-08/__e2e__/uf-08-area-plan.spec.ts` moves into `tests/e2e/` (and T-0997's `uf-08-area-detail.spec.ts` with it).
- AC3 `tests/e2e/uf-08*` and every spec that walks through UF-08 (UF-02, UF-09 from Ready) pass on the stacked branch, `--repeat-each 2`.
- AC4 No check is skipped or `test.fail`-marked.

## Paths you may change
- `tests/e2e/**`
- `apps/web/src/features/UF-08/__e2e__/**`
- `packages/design-tokens/test/t0993-uf08-areas-first-specs.test.ts` (orchestrator grant: the UF-08.6 "No other exercise for {Area} today. Use Swap." copy pin after T-0998's doc sync)

## Contract impact
none.

## Definition of done
Every AC has evidence · affected e2e green · commit messages start with `T-1019`.

## Build / accept log

- **Before (QA/build, 2026-11-24, `uf-08 uf-09 uf-02`, 262 tests):** 197 pass, 65 fail on the stacked parent (more than the 47 in the Why; the extra ones walk the old list as a path to Start). Failures: `uf-02-today` AC6 (1) · `uf-08-add` (4) · `uf-08-empty-start` (11) · `uf-08-excluded` (1) · `uf-08-favorites` (1) · `uf-08-level-change` (3) · `uf-08-reorder` (1) · `uf-08-swap-pins` (1) · `uf-08-setup` (25) · `uf-09-one-side` (3) · `uf-09-rest-next` (1) · `uf-09-rir-weight-step` (13). Every one is on an old exercise-list step before Start; no app bug found.
- **Shared helper:** `tests/e2e/fixtures/uf-08-start.ts` (`startEmpty`, `addArea`, `startWithExercise`): UF-08.1 -> Start empty -> Add an area -> UF-08.6 (Add exercise, Remove the others, "Start with this" if the row is not Main yet) -> Start workout -> skip warm-up -> UF-09.3. Used by `uf-09-rir-weight-step` (13), `uf-09-one-side` (3, it also returns the row detail and budget line so the D-0268 minutes checks stay), `uf-09-rest-next` (1). UF-09 intent unchanged.
- **Rewritten (same intent, areas-first):** `uf-02-today` AC6 (area rows + enabled Start) · `uf-08-add` x4 (sheet opened from UF-08.6 after freeing time; "a shorter time lists it under Doesn't fit" became "a time chip keeps the Add"; sheet Start-with became the UF-08.6 row button) · `uf-08-excluded` (Remove/Never suggest on UF-08.6, 90 min so an area has 2+ exercises) · `uf-08-favorites` (Favorite main on UF-08.6; offline Shuffle became an offline time chip) · `uf-08-level-change` x3 (Add sheet from UF-08.6) · `uf-08-swap-pins` (swap on UF-08.6, Add, time-chip rebuild instead of Shuffle) · `uf-08-empty-start` AC1, AC2 (Fill the rest leads with Suggest's first two areas), AC3 (Add an area: status, focus), AC4 (every area addable, none pushed out), AC5 (chip on an empty-mode plan rebuilds empty), AC6, AC7 offline/online, AC8, AC9 a11y · `uf-08-setup` (UF-08.2 rows vs fit line, Remove an area, how-to on UF-08.6, targets, keyboard, kg text on UF-08.6 rows (T-0393, T-0412), Swap on UF-08.6 (T-0303c), Skip today, T-0600 restyle: UF-08.6 state, time bar `area` segments, one status region, UF-08.6 targets/motion/contrast, Never suggest on UF-08.6, need-area hint).
- **Deleted, one reason each (D-0274):** `uf-08-reorder` (Reorder retired, section 4) · `uf-08-setup` T-0600 AC3 "Reorder: the moved row is raise" (same) and the Reorder app-only screenshot (replaced by an area-detail shot) · `uf-08-empty-start` AC4's "last suggestion leaves no main lift" and AC5's "Doesn't fit in 20 min" line (Suggestions section and the Doesn't-fit line retired, sections 4 and 5; empty mode is Start empty + areas) · the Reorder, Shuffle, Move and `Start with` list assertions inside the rewritten checks. No `test.skip`, `test.fixme` or `test.fail` anywhere in the touched files.
- **AC2:** `uf-08-area-plan.spec.ts` and `uf-08-area-detail.spec.ts` git-moved into `tests/e2e/`, imports now `./fixtures/...` and `./helpers/...`; `__e2e__/` is empty.
- **AC3:** `scripts/locked.sh heavy npx playwright test --config tests/e2e/playwright.config.ts uf-08 uf-09 uf-02 --repeat-each 2 --trace off`: 552 passed (276 x 2), 0 failed, 0 flaky, 0 skipped (15.6 min).
- **Gates:** `eslint tests/e2e` clean; `-w format:check` clean; `check-all.mjs` only `lane-path-not-owned` / `shared-i18n-other-flow` for the stacked T-0996 to T-1009 files. No app code touched.
