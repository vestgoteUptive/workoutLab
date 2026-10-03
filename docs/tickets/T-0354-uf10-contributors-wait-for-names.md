---
id: T-0354
title: "UF-10.2: contributor rows render once the exercise names have loaded (or failed), so the raw exerciseId never flashes"
lane: web-feature:UF-10
screens: [UF-10.2]
decisions: [D-0104, D-0115, D-0174]
deps: [T-0307a]
status: ready
---
<!-- Groomed 2026-10-03 by product-owner from the T-0307a accept follow-up (D-0174 §5).
Build flow: wl-build-web. About ¼ day. T-0307a is on main. -->

## Why
`BalanceDetail` starts with an empty names map and fills it when `loadLibrary()` resolves
(`features/UF-10/index.tsx`, `useExerciseNames`). Until then, each contributor row reads
something like "romanian-deadlift-bb · 6 sets · 30 Sep". Users see an internal id, and a screen
reader reads it out.

## Scope
- In (`apps/web/src/features/UF-10/index.tsx`, plus a test in `UF-10/__tests__/`):
  - `useExerciseNames` reports whether the read has settled (resolved or rejected).
  - The contributors `<ul>` renders only once the read has settled. The `contributorsHeading`
    `<h2>` renders at once.
  - With `area.contributors.length === 0`, the empty line renders at once.
  - With the `exerciseNames` override supplied, the list renders on the first render, as it does
    today.
  - A rejected read still falls back to the id (D-0104 / D-0115 §2), and so does an id that's
    missing from the library.
- Out:
  - A skeleton or placeholder for the list. A short gap is the default, and adding a skeleton
    is a design question.
  - UF-10.1.
  - Any copy change.
  - Any contract change.

### Edge cases that are in scope
- **Offline / empty cache:** `loadLibrary()` resolves `[]`, and the rows render with the id
  fallback once it has settled (AC-3).
- **A read that never settles:** the list never renders, but the rest of UF-10.2 does (AC-4).

## Acceptance criteria
Each test title starts with `T-0354 AC-n`. Use `__tests__/test-helpers.tsx` with hamstrings
contributors `rdl` (6 sets) and `nordic` (2 sets), and `loadLibrary` stubbed with a deferred
promise. Don't pass an `exerciseNames` override, except in AC-5.

- **AC-1 (no id flash, red on main)** **Given** `/balance/hamstrings` with `loadLibrary` pending,
  **then**:
  - the `h1`, the figures and the contributors heading are rendered;
  - there is no `[data-part="contributor"]`;
  - neither "rdl" nor "nordic" appears in the screen's text.

  **When** the read resolves with names "Romanian deadlift" and "Nordic curl", **then** 2 rows
  render, in the engine's order, reading those names.

  **Red:** on main a row with "rdl" is present before the read resolves.
- **AC-2 (rejected read)** **Given** the read rejects, **then** after a real 50 ms macrotask the
  2 rows render with "rdl" and "nordic" (the D-0115 §2 fallback), and there's no `console.error`.
- **AC-3 (empty library, an id missing from it)** **Given** the read resolves `[]`, **then** the 2
  rows render with the ids. **Given** it resolves only "Romanian deadlift", **then** the second
  row reads "nordic".
- **AC-4 (never settles, and no contributors)** **Given** the read never settles, **then** after a
  real 50 ms macrotask there is still no contributor row, and the "Start workout" link is in the
  DOM. **Given** an area with 0 contributors, **then** the empty line renders on the first render,
  while the read is still pending.
- **AC-5 (override unchanged)** With `exerciseNames` supplied, the rows render on the first
  render, and `loadLibrary` is not called. The existing render tests that pass `EXERCISE_NAMES`
  pass unedited.

**Red proof.** Run AC-1 on main: it fails. Plant one fault on a backup copy (treat "settled" as
`true` from the start): AC-1 must fail. Restore from the backup and record both runs.

## Paths you may change
- `apps/web/src/features/UF-10/**` (the lane: `web-feature:UF-10`).
- **Listed extras:**
  - `docs/tickets/T-0354-uf10-contributors-wait-for-names.md`

## Contract impact
None.

## Definition of done
- Tests for every AC pass.
- `uf-10-balance.spec.ts` is green.
- `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`,
  `-w format:check` and `node .github/scripts/check-all.mjs` are green, each through
  `scripts/locked.sh` (D-0169).
- Contracts are unchanged.
- Commits start `T-0354` and cite UF-10.2.

## Notes
- **Parallel.** T-0353 shares this lane but only edits the e2e spec. Run them one after the
  other, in either order.

## Build / accept log
- **Build (2026-10-03, web-feature:UF-10).** `useExerciseNames` (`features/UF-10/index.tsx`) now
  returns `{ names, settled }`: `settled` starts `true` only when `exerciseNames` is overridden,
  else `false` until the real `loadLibrary()` read resolves or rejects (both paths call
  `setSettled(true)`). `BalanceDetail`'s contributors block: heading always renders; empty line
  renders at once when `contributors.length === 0`; otherwise the `<ul>` renders only when
  `settled`, else nothing (no skeleton, per scope). New test file
  `features/UF-10/__tests__/contributors-settle.test.tsx`, 7 tests, one per ticket AC (AC-3 and
  AC-4 split into two each): deferred-promise control of a `vi.spyOn(history, "loadLibrary")`
  stub, hamstrings fixture with contributors `rdl` (6 sets) / `nordic` (2 sets), no
  `exerciseNames` override except the AC-5 test.
  - AC→test map: AC-1 → "renders the heading and figures before the read settles…"; AC-2 →
    "falls back to the ids after a real macrotask…"; AC-3 → the two "empty library…" tests; AC-4 →
    "leaves no contributor row…" and "an area with 0 contributors…"; AC-5 → "renders the rows on
    the first render and never calls loadLibrary".
  - **Red proof.** Checked out `main`'s `index.tsx` over the fix (backup restored via `cp`, not
    `git checkout`): AC-1, AC-2 and AC-4 fail (3 failed, 4 passed) — "expected … length of +0 but
    got 2" each time, matching "a row is present before the read resolves". Restored the fix from
    the backup copy (diff confirmed identical to the pre-fault file).
  - **Planted fault.** On a backup copy, `useState(override !== undefined)` →
    `useState(true) // T-0354 planted fault` (treats "settled" as `true` from the start). Same 3
    tests red (AC-1, AC-2, AC-4), as the ticket requires for AC-1. Restored from the backup copy.
  - Fixed an unused-import lint hit in the new test file (`beforeEach` imported but unused);
    `never-in-workout.lint.test.ts` caught it, now green.
  - One prettier reformat of the new test file (`format:check` flagged it, `--write` fixed it,
    re-ran green).
- **Tests run.**
  - `scripts/locked.sh small npx vitest run src/features/UF-10/__tests__/contributors-settle.test.tsx`
    (from `apps/web`): 7/7 pass.
  - `scripts/locked.sh small npx vitest run src/features/UF-10` (from `apps/web`): 10 files,
    130/130 pass.
  - `TMPDIR=$HOME/.cache/wl-pw-tmp scripts/locked.sh heavy npx -y pnpm@10.28.2 exec playwright
    test --config tests/e2e/playwright.config.ts uf-10-balance.spec.ts`: 10/10 pass.
  - `scripts/locked.sh heavy npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`:
    254 test files / 3516 tests pass, typecheck and lint green, 19/19 tasks, exit 0.
  - `scripts/locked.sh heavy npx -y pnpm@10.28.2 -w test:repo-checks`: 159/159 pass.
  - `scripts/locked.sh heavy npx -y pnpm@10.28.2 -w format:check`: green (after the one reformat
    above).
  - `scripts/locked.sh heavy node .github/scripts/check-all.mjs`: exit 0, no findings.
- **Contracts.** Unchanged. **Decisions.** None new; built to D-0174 §5 and D-0104/D-0115 §2 as
  specced. **Status.** done.
