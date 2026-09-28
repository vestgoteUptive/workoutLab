---
id: D-0047
title: Energy and time check (T-0201b build): trim area from the reason, per-set cost from the item, floorInc float guard, no back-off on a timed main lift
status: revisit
date: 2026-09-28
by: engine (T-0201b)
area: engine
---
## Context
Building rule 7.4 (energy) and rule 8 (`timeCheck`, UF-09.8) on the T-0201a selection (`docs/engine-rules.md`, D-0024, D-0026, D-0037 §8, D-0040 §4–§6 and §10, D-0042) left a few small gaps that the rules and D-0040 don't settle. None of them changes a worked example or a T-0201 acceptance value. The builder rechecked AC25–AC34 by hand against the rules, and every value holds as written (e.g. AC30: 405 − 105 − 165 − 105 = 30 > 0, so lateral-raise × 2 (270) goes, giving 1800 + 390 + 270 = 2460; AC33: 1325 − 375 − 270 − 390 − 270 = 20 > 0 with only the main lift left, giving 2000 + 720 = 2720).

## Decision
1. **Trim area without a library.** `timeCheck(workout, progress)` gets no library (rule 0 signature), so an item's "first primary area" is the `area` of its `area_deficit` reason, which `suggest` always writes (D-0040 §6). The trim key is `plan.startDeficits[area]`. An item with no `area_deficit` reason counts as deficit 1, so it is trimmed last.
2. **Per-set cost from the item.** When Trim removes a set, the set's cost is `(costS − 60) / (sets + (backoff ? 1 : 0))`, and `costS` drops by that amount. Only accessories are trimmed, and they never carry a back-off, so this equals rule 7.1's set cost for every `suggest` output.
3. **Trim loop.** Step 1 re-picks on every iteration, so an accessory above 3 sets can lose more than one set. Step 2 walks the same order (lowest start deficit, ties to the later item) over all not-started accessories, including ones step 1 already cut. `timeCheck` never mutates its input. It returns copies, so a caller can freeze the workout.
4. **Low energy.** "Accessory" means every non-main item, pinned ones included. Only items at exactly 3 sets go to 2 (none of the selection tries produce 4). Only the trimmed items get `energy_low_trim`. Projected loads are not recomputed, because selection is over.
5. **High energy.** The condition uses the selection's leftover time (`max(0, available) − Σ costS`, the same value as `unusedS`). A timed main lift has no reps, so it gets no back-off. The L1 and real libraries have no timed compound, so this can't happen today. The back-off increment is `incrementKg`, defaulting to 2.5 (D-0026).
6. **floorInc float guard.** `floorInc(x, inc = 2.5) = round3(floor(round3(x) / inc + 1e-9) × inc)`. The 1e-9 keeps float noise such as 0.3 / 0.1 = 2.999… from dropping a whole step, and the outer `round3` keeps results like 0.30000000000000004 clean. It throws `RangeError` for a non-finite `x` or a non-positive `inc`.

## Consequences
- engine (T-0205): the rule 14 pre-fill reuses `floorInc` from `src/energy.ts`.
- web (UF-09.8, T-03xx): show `minutesBehind` only when `show` is true. Trim and Skip next items are ready to save as the new plan.

## Revisit when
- `timeCheck` gets the library (then take the area from `primaryAreas`).
- The library gains timed compounds, or accessories with back-off sets.
