---
id: T-1019
title: "Move the 47 UF-08 e2e checks that pin the retired exercise list onto the areas-first flow (UF-08.2 area plan, UF-08.6 area detail), and retire the ones for removed features"
lane: qa
screens: [UF-08.1, UF-08.2, UF-08.3, UF-08.5, UF-08.6]
decisions: [D-0274, D-0280, D-0286, D-0287]
deps: [T-0997, T-1009, T-0998]
status: todo
---
## Why
T-0996 replaced the UF-08.2 exercise list with the area plan. 47 existing e2e checks pin the old list (per-row Swap/Remove/Start with this, Reorder, Shuffle, Add exercise, empty-mode Suggestions, kg text on rows, the T-0600 restyle on exercise rows): `uf-08-add` 4, `uf-08-empty-start` 11, `uf-08-excluded` 1, `uf-08-favorites` 1, `uf-08-level-change` 3, `uf-08-reorder` 1, `uf-08-swap-pins` 1, `uf-08-setup` ~25. They cannot pass until UF-08.6 (T-0997), the folded Start (T-1009) and the retirement (T-0998) exist. Until then the UF-08 tickets stack on each other's ticket branches (T-0997 from `t/T-0996-*`, and so on) and reach the squad branch together, so its CI stays green.

## Acceptance criteria
- AC1 Each failing check is either rewritten against the new flow with the same intent (swap, pin, favorite, excluded, level notice, Start with this now on UF-08.6; Start on UF-08.2) or deleted with a one-line reason in the log citing D-0274 (Reorder, Shuffle, Suggestions, empty mode).
- AC2 The T-0996 spec `apps/web/src/features/UF-08/__e2e__/uf-08-area-plan.spec.ts` moves into `tests/e2e/`.
- AC3 `tests/e2e/uf-08*` and every spec that walks through UF-08 (UF-02, UF-09 from Ready) pass on the stacked branch, `--repeat-each 2`.
- AC4 No check is skipped or `test.fail`-marked.

## Paths you may change
- `tests/e2e/**`
- `apps/web/src/features/UF-08/__e2e__/**`

## Contract impact
none.

## Definition of done
Every AC has evidence · affected e2e green · commit messages start with `T-1019`.

## Build / accept log
