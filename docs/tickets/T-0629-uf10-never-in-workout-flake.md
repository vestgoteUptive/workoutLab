---
id: T-0629
title: "UF-10 never-in-workout.test.tsx:48 (AC-A12) flaky under load: waitFor on the lazy session route; root-cause it, no timeout widening"
lane: web-feature:UF-10
screens: [UF-10.1]
decisions: []
deps: []
status: ready
---
## Why
Seen in the T-0615 review: 1 failure in 3 runs of the UF-10 vitest folder, a `waitFor` timeout on a lazy route. This is after T-0910.

## Scope
- In (`apps/web/src/features/UF-10/**`): make the test deterministic. For example, await the lazy chunk explicitly or mock the lazy route as the sibling tests do. No timeout widening.
- Out: app behaviour changes.

## Acceptance criteria
- AC1 The root cause is written in the log.
- AC2 `never-in-workout.test.tsx` passes 50 consecutive runs under `scripts/locked.sh heavy` with three busy loops pinned to the same cores.

## Paths you may change
- `apps/web/src/features/UF-10/__tests__/**`

## Contract impact
None.

## Definition of done
Gate green · commits start with `T-0629`.

## Build / accept log

- Root cause (AC1): the T-0910 `beforeAll` pre-imports UF-09, UF-10, UF-01 but the second test row, `/session/S1/summary`, renders the lazy UF-03 `Summary` chunk (routes.ts), plus the signed-in lazy `AutoSync` chunk. Neither was warmed, so the first `/summary` render paid a cold dynamic import (transform+eval, ~180 ms idle, ~290 ms on one core, several times that under load) inside `renderShellAt`'s 1 s `waitFor` at line 48. Not a race in the app; a cold-chunk cost that only exceeds the budget under CPU contention.
- Red on unfixed code: 3 busy loops + vitest pinned to one core, 10 runs: 10/10 pass (not reproduced). 10 busy loops pinned to the same core: 8/8 FAIL, always `/session/S1/summary has no a[href^='/balance']` at ~1.2 s, `[data-screen-id]` null.
- Fix: add `import("../../UF-03/index.js")` and `import("../../../lib/offline/AutoSync.js")` to the `beforeAll` warm-up. No timeout changed. Same 10-busy-loop load after fix: 3/3 pass.
- AC2: see 50-run result below.
- AC2: 50/50 pass, exit 0, 3 busy loops + vitest pinned to core 0 (taskset), under scripts/locked.sh heavy.
- Gate: first -w run failed 4 web tests with 5 s timeouts (check-bundle-size, UF-03/04/08 exports-and-lint) at machine load avg 14-23 from other agents; the 4 files pass alone (60/60). Second -w run exit 0 (web 4273 passed); format:check 0; check-all 0.
