---
id: T-0662
title: "UF-11.5 Exclude: decide 'was a favorite' from the favorites cache at tap time, not the live hook (a fast tap before favorites load says 'excluded' instead of 'Removed from favorites'); this makes the CI-only favorites-screen test deterministic"
lane: web-feature:UF-11
screens: [UF-11.5]
decisions: [D-0202]
deps: []
status: done
---
## Why
`favorites-screen.test.tsx` "excluding a favorite says it was removed from favorites" fails on CI (main run 38157503649 and 2 of 3 runs on PR #59) and passes locally. Cause: `ExcludedBody.tsx:118` computes `wasFavorite` from `useFavoriteIds(userId)`, a live query that can still be empty when the user (or the test) taps Exclude right after the screen renders. The announcement then reads "Bench press excluded" instead of "…Removed from favorites" (D-0202 §8, T-0569). A real user who taps fast hits the same thing.

## Scope
- In (`apps/web/src/features/UF-11/**`): in `toggle()`, read whether the item is a favorite from the favorites cache (the same store `useFavoriteIds` reads) at tap time, awaited, instead of the hook's current value. Keep the hook for rendering. Use the same approach in `FavoritesBody.tsx` if it has the mirror race (`wasExcluded` from `excluded.has`).
- Out: lib changes, copy changes.

## Acceptance criteria
- AC1 A deterministic test: seed favorites, render, and tap Exclude **before** the favorites live query resolves (gate or delay the hook's first emission). The status says "…Removed from favorites." Planted fault: reading the hook value fails it.
- AC2 The mirror case in FavoritesBody (if present) is covered the same way.
- AC3 The existing favorites-screen tests pass 20 consecutive runs under `scripts/locked.sh heavy` with 3 busy loops.

## Paths you may change
- `apps/web/src/features/UF-11/**`

## Contract impact
None.

## Definition of done
Gate green · commits start with `T-0662`.

## Build / accept log
Archived in `docs/tickets/log/T-0662.md` (D-0157).
