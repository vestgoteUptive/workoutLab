---
id: T-0393
title: "e2e: a loaded-library fixture export (real external_load values) and UF-08.2 rows that render a kg weight"
lane: qa
screens: [UF-08.2]
decisions: [D-0071, D-0086, D-0108, D-0044, D-0109]
deps: [T-0303d]
status: todo
---
<!-- Written by product-owner 2026-10-02 (groom). Build flow: wl-build-qa. About ¼ day. Follow-up from the T-0303b QA. Start after T-0303d merges, because T-0303d also appends to uf-08-setup.spec.ts. -->

## Why
`tests/e2e/fixtures/uf-04-library-data.ts` maps every row to `external_load: false`. The UF-08.2 row detail therefore always says "Bodyweight" (`features/UF-08/Suggested.tsx` `itemDetail`), and no e2e ever renders a kg weight (D-0109 §4, `Intl.NumberFormat`). The kg path is only proven in jsdom.

**Grant check.**
- The `qa` lane owns `tests/e2e/**`.
- D-0071 §10 lets an e2e ticket make additions to `tests/e2e/fixtures/` that only add exports.
- D-0108 §2's no-fixture-edit rule covered only T-0302a and T-0303a.

Editing the existing `exercises` export would change the seed for `uf-04-library.spec.ts`, `shell.spec.ts` and the existing `uf-08-setup.spec.ts` cases. So this ticket adds a new export and leaves `exercises` byte-identical.

## Scope
- In:
  - `tests/e2e/fixtures/uf-04-library-data.ts`: a new export `exercisesLoaded: Row[]`. It equals `exercises` row for row (same order, same fields), except for `external_load`:
    - `true` when the row's `equipment` contains `barbell`, `dumbbell`, `machine` or `cable` (D-0044: external load = NOT bodyweight);
    - `false` otherwise (no equipment, `rack`-only, `pullup-bar`-only, and every warm-up).
  - `tests/e2e/uf-08-setup.spec.ts`: a new `T-0393` describe block, appended. Its seed rows stay in the spec, and its `completed_at` values are relative to `Date.now()` (D-0108 §4). It uses `guarded-test.js` (D-0086).
- Out:
  - The existing `exercises`, `exerciseAreas`, `exerciseVariants` and `profile` exports (byte-identical).
  - Every existing spec case.
  - UF-09 e2e (it can adopt `exercisesLoaded` in its own ticket).
  - App code.

## Acceptance criteria
Each test title starts with `T-0393 ACn`. The seed is the existing spec's (FULL-equipment `profileRow`, F-targets, `mockProfilePresent`), with `exercisesLoaded` in place of `exercises`.
- AC1 (the export, a fixture unit check inside the spec file, no browser)
  - `exercisesLoaded.length === exercises.length`.
  - Each row deep-equals its `exercises` counterpart apart from `external_load`.
  - `external_load` is `true` exactly for back-squat, romanian-deadlift, hip-thrust, leg-extension, leg-curl, calf-raise, bench-press, db-bench-press, overhead-press, lateral-raise, barbell-row, db-row, lat-pulldown, seated-cable-row, straight-arm-pulldown, biceps-curl, goblet-squat and leg-press (18 ids).
  - It is `false` for push-up, inverted-row, pull-up, plank, dead-bug, hanging-knee-raise and the 8 warm-ups.
  - `exercises` still has `external_load: false` on every row (the old export is unchanged).
- AC2 (zero history: no kg, Bodyweight only where it's true)
  - **Given** `sets: []`, **When** UF-08.1 → 30 minutes → Suggest → UF-08.2, **Then** each row's `row-detail` contains "Bodyweight" exactly when its exercise has `external_load: false` in `exercisesLoaded`. Map the row name to its id through the export's `name`.
  - No row contains " kg". With no history, rule 14.1 gives a null weight to a loaded exercise.
- AC3 (a kg row)
  - **Given** one session 3 days ago (`Date.now() − 3 × 86 400 000`): for every exercise with `external_load: true`, 3 non-warm-up sets at `weight_kg` 42.5 × 7 reps (the `uf-02-today.spec.ts` sets-row shape).
  - **When** UF-08.1 → 30 minutes → Suggest, **Then**:
    - at least one row's `row-detail` matches `/ · 42\.5 kg · \d+ min$/`;
    - every row whose exercise is loaded shows `42.5 kg`. With one session, a gap of 3 days and 7 reps, which is below the high end of every `build_muscle` range (main 6–8), rule 14.6 `hold` or 14.7 `add_rep` applies, and both keep W = 42.5. Re-derive the range per slot in a test comment. If a row differs, record the observed literal in the result rather than editing it to fit;
    - every row matches the spec's `DETAIL_PATTERN`.
- AC4 (offline equals online) For AC3's seed, the UF-08.2 rows after `context.setOffline(true)` and the existing offline path (`precacheSettled`, `/session/setup`, Suggest at 30) equal the online rows, kg text included (NFR-OFF-3).
- AC5 (no regression) Every existing case in `uf-08-setup.spec.ts`, `uf-04-library.spec.ts` and `shell.spec.ts` passes unedited.

## Paths you may change
- `tests/e2e/**` (the lane: `qa`).
- **Listed extras:**
  - `docs/tickets/T-0393-e2e-external-load.md`: this file, for the accept log.

Within the lane, the fixture change is additive only: the new `exercisesLoaded` export (D-0071 §10). It makes no edit to existing exports.

## Contract impact
none

## Coordination
- Files:
  - `tests/e2e/fixtures/uf-04-library-data.ts` (one new export);
  - `tests/e2e/uf-08-setup.spec.ts` (an appended describe block).
- **Overlaps:**
  - T-0303d (doing) appends to `uf-08-setup.spec.ts`, so this ticket starts after T-0303d merges.
  - T-0386 (ready, UF-08) must not run in parallel if its branch edits `uf-08-setup.spec.ts`.

## Definition of done
Tests for every AC pass · the Playwright e2e job is green · `npx -y pnpm@10.28.2 -w typecheck lint test --force` green · commit messages start with `T-0393` and cite UF-08.2 (e.g. `T-0393 UF-08.2: loaded-library fixture and a kg row in e2e`).
