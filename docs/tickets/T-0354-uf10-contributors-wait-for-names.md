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
