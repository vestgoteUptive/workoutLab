---
id: D-0249
title: "timeLeftS rounds a partly done item's remaining time up to the whole second, computed in integers; exact for every item the engine builds"
status: revisit
date: 2026-11-13
by: engine-dev (T-0945)
area: engine
builds-on: D-0244 §2, D-0246 §11
---
## Context
D-0244 §2 says `timeLeftS` returns an integer and that a started item's remaining time is `max(0, sets − setsDone) × perSet`, with rule 8's per-set cost `(costS − 60) / sets` (back-off counted as a set, D-0246 §11). For every item the engine builds (rule 7.1, rule 7.4 back-off, rule 8 Trim, rule 12.1 swap, rule 12.3 insert), `costS − 60` is a whole number of equal set costs, so the product is an integer. A plan item edited outside the engine could have a `costS` that doesn't divide evenly, and the floating-point product `left × ((costS − 60) / sets)` can land a hair off an integer even when the exact value is one.

## Decision
1. `remaining(i)` for a started item is `ceil(left × (costS − 60) / sets)`, computed as one integer product divided once, so it is exact whenever the true value is an integer.
2. Rounding goes **up**, so a non-dividing item understates the time left by under a second. That is the conservative side for principle 2 ("never over budget through an add").
3. `docs/engine-rules.md` rule 8 states it in the `timeLeftS` paragraph and cites this decision.

## Consequences
- No observable change for engine-built plans: R8-E4…E7 and the seeded properties hold exactly.
- No openapi, data-model or token change.

## Revisit when
Plans with costs not built by the engine become possible (for example, user-edited set counts before an item starts).
