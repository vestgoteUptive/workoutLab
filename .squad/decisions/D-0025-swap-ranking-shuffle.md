---
id: D-0025
title: Swap ranking by reason and deterministic shuffle — candidates share a primary area; each reason is a fixed sort key; shuffle cycles a ranked list by counter, no RNG
status: revisit
date: 2026-09-27
by: product-owner (T-0101)
area: engine
---
## Context
UF-08.3 says "reason changes ranking" and UF-08.2 says "Shuffle picks alternates for non-main exercises". Gap B4 left both open. Shuffle must not use `Math.random()` (principle 3).

## Decision
This decision names the addition of rules 12 and 13 to `docs/engine-rules.md`.
- **Candidates:** eligible exercises (equipment, level, not excluded) that share at least one weight-1.0 area with the current exercise and are not already in the session. Main-slot alternatives must be compounds.
- **muscleMatch** = `Σ_a min(w_cur(a), w_alt(a)) / Σ_a w_cur(a)`, in [0, 1].
- **Sort keys, by reason:**
  - none (UF-05.1 default): muscleMatch desc, same type first, not in the last session first, id asc.
  - `equipment_taken`: drop candidates that share any equipment item with the current exercise. If none remain, keep all and sort by fewest shared items. Then muscleMatch desc, id asc.
  - `discomfort`: no shared equipment first, then guided (machine or cable) first, then muscleMatch desc, id asc.
  - `variety`: never done first, then last done date asc, then muscleMatch desc, id asc.
  - `short_on_time`: time cost at the slot's set count asc, then muscleMatch desc, id asc.
- The alternative keeps the slot's set count. Each result carries `muscleMatch`, `timeCostS`, `equipment`, `fitsBudget` and `bestMatch` (index 0).
- **Shuffle:** `sessionInput.shuffle = n` (a counter, starting at 0). Every accessory slot the user has not pinned takes entry `n mod len` of `[original, …variety ranking]`, skipping exercises already taken by an earlier slot. If the pick does not fit the budget at the slot's set count, the slot keeps its original exercise.

## Consequences
T-0201 (or its split, see follow-ups) implements `rankSwaps()` and shuffle and tests them with R12-E*/R13-E*. T-0102 exposes the reason enum. T-0303/T-0306 render the engine's order without re-sorting.

## Revisit when
Exercise variants (`exercise_variants`, gap B3) or movement-pattern tags exist. Discomfort should then exclude same-pattern variants.
