---
id: D-0042
title: Session building (T-0201a build) — set tries per candidate, cross-area caps, main-lift search, rankCandidates signature, gap-fit rounding
status: revisit
date: 2026-09-28
by: engine (T-0201a)
area: engine
---
## Context
Building rule 7.2 and 7.3 (`docs/engine-rules.md`, D-0024, D-0040) turned up small gaps that neither the rules nor D-0040 settle. None of them changes a worked example or a T-0201 acceptance value. All the hand-computed values (AC11, AC12, AC13, AC15, AC16, AC18) were rechecked against the rules and hold as written.

## Decision
1. **"At 3 sets, then 2" is per candidate.** Greedy and pinned try each candidate at 3 sets, then at 2 sets, before moving to the next candidate. AC11 needs this (inverted-row × 2 comes before straight-arm-pulldown × 3).
2. **Caps cover every primary area.** An exercise is a candidate (or a usable pin or `mainLiftId`) only if none of its primary areas already has 2 items and the session has fewer than 8 items. Without this, back-squat picked for glutes could make quads the primary area of 3 items and break the R7-E8 invariant.
3. **Main-lift search.** Go through the eligible areas by lowest `r` (ties by the fixed order). In each area, go through its compound candidates in rank order at 4, then 3, then 2 sets. The first one that fits is the main lift. This matches the rule text for the L1 library, where every compound set costs the same, and it stays well-defined for timed compounds.
4. **Exercises without a primary area are never picked.** They have no first primary area for their reasons. Rule 1 says this can't happen, and the content validator enforces it.
5. **`rankCandidates(area, history, targets, profile, library, {excludeIds}, now, tz)`** returns the ranked ids at session start (the projected load equals the rule-3 load, and the session is empty). `suggest` uses the same internal ranking on the projected state.
6. **Gap fit is rounded to 1e-9 before comparing**, so mathematically equal sums still tie and the id decides.
7. **Warm-up round-robin stops** after a full pass over the area list adds no move. A move is a candidate for an area only when its weight there is greater than 0.
8. **`energy` in T-0201a** is echoed on `Workout` but doesn't change the plan. T-0201b implements rule 7.4.
9. **`suggest` takes `Pick<EngineProfile, "level" | "equipment">`**, so callers that only have the eligibility fields can call it. The full `EngineProfile` (D-0037 §6) is still accepted.

## Consequences
- engine (T-0201b): energy and `timeCheck` build on this selection. T-0204 (shuffle/swaps) reuses the point-2 caps.
- engine (T-0202): the all-chest simulated test expects inverted-row as the main lift (D-0040 §11).

## Revisit when
- The library gains timed compounds or compounds whose set costs differ.
- Users ask why a compound for a capped area never shows up.
