---
id: T-0911
title: "Flaky web unit test '/library/back-squat renders UF-04.2' fails CI on main intermittently"
lane: web-feature:UF-04
screens: [UF-04.2]
decisions: [D-0197]
deps: []
status: ready
---

## Why
`/library/back-squat renders UF-04.2` failed the unit job twice: on PR #47 (2026-10-07) and on main at 3436202 (run 37724788580, 2026-10-08). Both times it passed on rerun. Each failure blocks the automatic release and deploy (D-0201) until someone reruns the job by hand.

## Acceptance criteria
- AC-1: reproduce under load (the web test run with ≥ 8 `yes` loops) and capture the failing assertion and its cause, e.g. a lazy chunk load inside a short waitFor (compare T-0910's fix).
- AC-2: fix the root cause in the test by waiting on observable state. Don't fix it by raising timeouts alone.
- AC-3: 30 clean runs of the containing file and 10 under load, plus `pnpm --filter @workoutlab/web test` green.

## Paths you may change
- the failing test file and its folder's `__tests__/**`

## Contract impact
None.

## Build / accept log
Archived in `docs/tickets/log/T-0911.md` (D-0157).
