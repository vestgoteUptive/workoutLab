---
id: D-0026
title: Progression and pre-fill — double progression per rep slot, hold after ≥ 10 days off, −10 % after ≥ 21 days or two misses, carry on swap, RIR not used in v1
status: decided
date: 2026-09-27
by: product-owner (T-0101)
area: engine
---
## Context
UF-09.3/UF-09.4 pre-fill weight and reps ("pre-fill, don't ask"). Gap B4 left progression open. The PRD already answers carry-over on a swap: carry the weight when the variant shares a primary area and equipment type.

## Decision
This decision names the addition of rule 14 to `docs/engine-rules.md`.
- **Last performance:** the hard sets of this exercise in the most recent session that contains it (tombstones excluded). `W` is the highest weight among them. `minReps` and `allReps` are taken over the sets at `W`. `gap` is the number of local days since that session.
- **Order (the first match wins):** no history → carry the slot's previous weight if the swap shares a weight-1.0 area and an equipment item, otherwise `null` (0 for bodyweight) · `gap ≥ 21` → `floorInc(0.9W)`, low reps · `gap ≥ 10` → `W`, low reps · every set at `W` ≥ high → `W + increment`, low reps · the last two sessions both at `W` with `minReps < low` → `floorInc(0.9W)`, low reps · the last session alone with `minReps < low` → `W`, low reps · otherwise `W`, `min(high, minReps + 1)`.
- **Timed:** the first time uses `default_duration_s`. After that, `min(last durations) + 5 s` (capped at 120), with no increase when `gap ≥ 10`, and `max(15, floor5(0.9 × min))` when `gap ≥ 21`.
- **Increment:** from the library `increment_kg`, default 2.5. `floorInc(x) = floor(round3(x) / inc) × inc`.
- Energy never changes pre-filled weights, except that the High back-off set uses `floorInc(0.9 × main weight)`. RIR is logged but not used in v1.

## Consequences
T-0201 (or its split) implements `prefill()` with R14-E*. content (T-0103) supplies `increment_kg` and `default_duration_s`, and marks exercises as bodyweight.

## Revisit when
There is enough RIR data to use it, or users edit the pre-filled weight on more than 30 % of sets.

## Confirmed
Confirmed by the human 2026-09-29 (D-0061). It reopens only through its own "Revisit when" trigger.
