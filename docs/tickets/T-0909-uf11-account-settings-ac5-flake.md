---
id: T-0909
title: UF-11 account-settings.test.tsx T-0529 AC-5 still flakes under full-suite load
lane: web-feature:UF-11
screens: [UF-11.4]
decisions: [D-0195]
deps: [T-0529]
status: ready
---

## Why
T-0537's full gate (2026-10-07) had one web failure, `src/features/UF-11/__tests__/account-settings.test.tsx` (T-0529 AC-5). It passed 26/26 runs on its own. T-0529's rework gave its `findBy`/`waitFor` calls a 5 s `WAIT`, so a timeout alone isn't the cause. A red unit job on main blocks the automatic prod deploy (`PROD_DEPLOY_ENABLED`).

## Acceptance criteria
- AC-1: Reproduce the failure under load: the full `@workoutlab/web` test run, or the UF-11 folder with ≥ 8 `yes` busy loops. Record the failure rate and the assertion that fails.
- AC-2: Fix the root cause in the test, e.g. a passive effect, a pending promise from the previous test, or a mock reset. Don't fix it by raising timeouts alone. Show why the failure happened.
- AC-3: 30 consecutive clean runs of `src/features/UF-11`, plus 10 under load, plus one full web test run green.

## Paths you may change
- `apps/web/src/features/UF-11/__tests__/**`

## Contract impact
None.

## Build / accept log
