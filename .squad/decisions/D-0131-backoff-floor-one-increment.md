---
id: D-0131
title: The High-energy back-off is never 0 kg on a loaded main lift with a positive weight; it gets the D-0057 §4 floor of one increment, capped at the main weight
status: revisit
date: 2026-10-02
by: product-owner (groom, T-0220)
area: engine
supersedes: D-0040 §4, D-0057 §7 and D-0093 (back-off recompute), the back-off weight formula only (in part; everything else in them stays in force)
builds-on: D-0057 §4, D-0024
---
## Context
Rule 7.4 sets the High-energy back-off weight to `floorInc(0.9 × main weight)`. `applySwap` uses the same formula when it recomputes a back-off (rule 12.1, D-0093). Both go through `backoffOf` in `packages/engine/src/session.ts`. On a light loaded lift the formula floors to 0. For example, a 2.5 kg bench-press pre-fill with `inc` 2.5 gives `floorInc(2.25) = 0`. UF-08.2 then shows "back-off 0 kg × 6" and UF-09 pre-fills an empty bar. The T-0205 review found this.

D-0057 §4 already settled the same problem for rule 14's `reentry` and `deload` steps: one increment is the smallest honest suggestion. The back-off is meant to be lighter than the main sets, not heavier. So the floor must not push it above the main weight when that weight is off the increment grid (for example 2 kg on a 2.5 kg-increment bar).

## Decision
1. **Formula.** With main pre-fill weight `w` and `inc = exercise.incrementKg ?? 2.5`:
   - `w` null → null (unchanged);
   - `w = 0` → 0 (unchanged; a bodyweight main lift or a loaded lift logged at 0 kg, D-0062 §4);
   - `w > 0` → `min(w, max(inc, floorInc(0.9 × w, inc)))`, rounded to 3 decimals.

   Because `floorInc` returns a multiple of `inc`, this differs from the old value only when the old value was 0. That happens when `0 < w < inc / 0.9`, and the new value is then `min(w, inc)`. Every other back-off is byte-identical: R7-E12, R14-E9 (80 → 70) and R12-E10 (`floorInc(72, 2)` = 72) are unchanged.
2. **One helper, two callers.** `suggest`'s rule 7.4 and `applySwap`'s rule 12.1 recompute both use the one back-off function. The reps (the goal's main `repsMin`), the fit check that decides whether a back-off is added, the cost and the `energy_high_backoff` reason are unchanged.
3. **Contract change (engine lane).** `docs/engine-rules.md`:
   - rule 7.4's High sentence states the §1 formula and cites D-0131;
   - rule 12.1's back-off phrase `{floorInc(0.9 × prefill weight, new inc), repsMin}` becomes the rule 7.4 back-off for `new` (the same formula, `new`'s inc) and cites D-0131;
   - a new worked example **R7-E16** follows R7-E12 (text in T-0220);
   - one Traceability row for T-0220.
4. `api/openapi.yaml` is unchanged. `Backoff.weightKg` keeps `[number, null]`, `minimum: 0`.

## Consequences
- engine (T-0220): implements §1–§3 with unit tests and the simulated 14-day history tests. The orchestrator regenerates the vendored engine at merge (D-0053 §1).
- web: no change. UF-08.2 and UF-09 render `backoff.weightKg` as given.
- product: rule 14 `reentry` and `deload` can still return `inc > W` when `W` is off the grid and below `inc` (D-0057 §4 has no cap). That is out of scope here. It is noted as a product follow-up.

## Revisit when
- Users edit the back-off weight down on most light-lift sessions. The floor may then be too heavy for beginners.
- Rule 14 `reentry`/`deload` gets a cap at `W`. This floor should then use the same wording.
