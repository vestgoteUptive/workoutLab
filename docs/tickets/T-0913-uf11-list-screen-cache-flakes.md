---
id: T-0913
title: "UF-11.5/11.6 list-cache tests flake under load (waitFor default 1 s exceeded)"
lane: web-feature:UF-11
screens: [UF-11.5, UF-11.6]
decisions: [D-0197]
deps: []
status: doing
---

## Why
`favorites-screen.test.tsx` "AC8 UF-11.5 move line › excluding a favorite says it was removed from favorites" failed on CI (PR #55, 1031 ms). The UF-02 cache-change tests show the same pattern (T-0570 rework). Tests that wait for a Dexie cache write plus a hook re-render go just past waitFor's default 1 s under load. Flaky unit tests block the automatic release (D-0201).

## Acceptance criteria
- AC-1: audit every cache-change-driven assertion in `favorites-screen.test.tsx` and `excluded-screen.test.tsx`, and in any other UF-11 test that waits on the excluded or favorites cache. Make each wait on observable state (await the cache write and liveQuery tick, or a shared helper with an explicit, justified timeout).
- AC-2: 20 clean runs of the UF-11 folder plus 10 with ≥ 8 `yes` loops, 0 fails. `pnpm --filter @workoutlab/web test` green.

## Paths you may change
- `apps/web/src/features/UF-11/__tests__/**`

## Contract impact
None.

## Build / accept log

- T-0913 build: favorites-screen and excluded-screen tests set RTL `asyncUtilTimeout` 4 s (under the 5 s test timeout; waits still return on observable state). Synchronous reads after cache-driven waits (status message, "Excluded exercises, 1" link) now use findBy/waitFor.
- Red on first attempt (timeout only): 3 of 20 UF-11 runs failed (AC1 "sits directly before the Excluded row", AC3 "Add on an excluded exercise" status text). Fixed by the sync-read changes.
- AC-2: 20/20 clean UF-11 runs; 10/10 with 8 `yes` loops (killed, 0 left); after merging origin/main `--filter @workoutlab/web test` 307 files / 4149 tests green; format:check green. One earlier package run failed once (before merge, cause not captured; the rerun was green).
