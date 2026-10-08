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
- AC-1: no red under 12 `yes` loops (6 AC-3 runs, 6 full-file runs); cause found deterministically instead. Planted delay (3.5 s sleep after renderAt) on unfixed code: `/library/back-squat renders UF-04.2` Expected "UF-04.2", Received "UF-04.1". Cause: UF-04 imports loaders from `history.js`, so the test's `offline/index.js` mock never reached it; empty cache plus real `refreshAll`, then `<Navigate to="/library">` when the 3 s refresh cap ends. Green only if the assertion runs inside 3 s, which a loaded runner misses.
- AC-2: routes.phase3.render.test.tsx adds a `history.js` mock (loadLibrary seeded with BACK_SQUAT, refreshAll no-op). With the 3.5 s delay planted on fixed code, UF-04.2 passes. No timeouts raised.
- AC-3: 30/30 clean, 10/10 under 12 `yes` loops (killed); `--filter @workoutlab/web test` 288 files / 3883 tests green; format:check green.
- Latent, out of scope: with the same delay, `/library/.../compare/leg-press` (to UF-04.2) and `/plan/routines/R1` (to UF-11.2) also redirect; they pass today because they assert inside the window.
