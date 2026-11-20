---
id: D-0253
title: "RIR progression and own steps, v1 scope and the defaults for the spec's twelve open questions"
status: revisit
date: 2026-11-20
by: product-owner (idea mode)
area: product
builds-on: D-0250, D-0251, D-0252
---
## Context
The spec `docs/specs/rir-progression-and-increments.md` has twelve open questions. The owner has not yet answered them. Defaults keep v1 small and onboarding unchanged.

## Decision
The defaults in the spec's "Open questions" ship until the owner changes one: RIR >= 2 to increase; the lowest RIR at the top weight counts; one hold then increase; no RIR on timed sets; no RIR effect on `add_rep`, double jumps or deload; no change to UF-09.4 or UF-01; step edited on UF-04.2 only; multiples of 0.25 from 0.25 to 10 kg; no re-gridding of the last weight; table `exercise_settings`. Out of scope: RPE, lb, a global step, plate calculators, bulk micro-plate switch.

## Consequences
Tickets T-0951 to T-0958 on the board stay `idea` until the owner accepts.

## Revisit when
The owner answers any open question differently.
