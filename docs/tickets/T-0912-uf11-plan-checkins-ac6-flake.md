---
id: T-0912
title: "Flaky UF-11 plan-checkins-routines AC6 (offline secondary-button class) under full-suite load"
lane: web-feature:UF-11
screens: [UF-11.2]
decisions: [D-0197]
deps: []
status: ready
---

## Why
`apps/web/src/features/UF-11/__tests__/plan-checkins-routines.test.tsx` AC6 (the offline `wl-button--secondary` class) failed under full-gate load in three separate runs on 2026-10-08: T-0540, T-0565 and T-0563. It passes alone. A red unit job blocks the automatic release and deploy (D-0201).

## Acceptance criteria
- AC-1: reproduce under load (the UF-11 folder with ≥ 8 `yes` loops) and capture the failing assertion and its cause, e.g. a passive effect, as in T-0549's note about Edit plan switching one tick later.
- AC-2: fix the root cause by waiting on observable state. Don't raise timeouts alone.
- AC-3: 30 clean runs of the file, 10 under load, and `pnpm --filter @workoutlab/web test` green.

## Paths you may change
- `apps/web/src/features/UF-11/__tests__/**`

## Contract impact
None.

## Build / accept log
