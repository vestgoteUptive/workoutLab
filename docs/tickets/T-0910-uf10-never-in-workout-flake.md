---
id: T-0910
title: UF-10 never-in-workout.test.tsx AC-A12 ("/session/S1 has no a[href^='/balance']") flakes under load
lane: web-feature:UF-10
screens: [UF-10.1]
decisions: [D-0197]
deps: []
status: ready
---

## Why
During T-0350's gate and a later UF-10 folder run (2026-10-07), `src/features/UF-10/__tests__/never-in-workout.test.tsx` › AC-A12 render › `/session/S1 has no a[href^='/balance']` failed with `Received: null` under load. Run on its own it passed 3 out of 3, both with and without T-0350. It is a timing flake, probably a lazy route or a precondition element that isn't rendered yet. A red unit job blocks the automatic prod deploy.

## Acceptance criteria
- AC-1: Reproduce it under load (the UF-10 folder with ≥ 8 `yes` loops, or the full web run) and capture the failing assertion.
- AC-2: Fix the root cause in the test: wait on observable state. Don't fix it by raising timeouts alone.
- AC-3: 30 clean UF-10 folder runs, plus 10 under load, plus `pnpm --filter @workoutlab/web test` (not bare vitest) green.

## Paths you may change
- `apps/web/src/features/UF-10/__tests__/**`

## Contract impact
None.

## Build / accept log
- Repro (9 `yes` loops, UF-10 folder): 2 of 5 runs red, AC-A12 `/session/S1` (and once `/summary`) failed at never-in-workout.test.tsx:37 (`renderShellAt` waitFor `[data-screen-id]` toBeInTheDocument, `Received: null`). Root cause: first render pays the cold lazy `import()` of the UF-09 chunk inside waitFor's 1 s budget.
- Fix (test only): `beforeAll` awaits the UF-09/UF-10/UF-01 flow modules, so waitFor only waits on rendering. No timeouts raised.
- AC-1 done. AC-2 done. AC-3: 10/10 clean under 9 `yes` loops (loops killed), 30/30 clean unloaded (144 tests each); `--filter @workoutlab/web test` 279 files / 3776 tests green; format:check green.
