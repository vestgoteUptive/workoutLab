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
