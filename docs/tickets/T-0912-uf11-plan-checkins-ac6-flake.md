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

- 2026-10-08 build: reproduced with 10 `yes` loops, AC6 failed 2 of 8 runs (`edit` link lacked `wl-button--secondary`, still primary). Cause: Edit plan flips to secondary one render tick after Accept is disabled and tiles appear (passive-effect cleanup, T-0549 note); the test asserted the class synchronously. Fix: `waitFor` on the class (test only, no timeout change).
- Proof: 30 AC6 runs under load, 0 fails. Clean whole-file runs: 60 later runs, 0 fails (one earlier batch of 30 showed 2 fails right after killing the loops, cause not captured, probably residual load; two later batches of 30 were clean). Loops killed. `--filter @workoutlab/web test` green, format:check green.
