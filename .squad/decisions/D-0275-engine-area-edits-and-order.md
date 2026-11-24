---
id: D-0275
title: "Engine for areas first: suggest() is unchanged; new pure functions group a plan by area, add or remove a set or an area, rank the addable areas, and order the run (rule 7.6, rules 12.4 to 12.7)"
status: revisit
date: 2026-11-24
by: triage (check mode, idea flow); engine-dev impact review
area: engine
builds-on: D-0024, D-0191, D-0199, D-0202, D-0237, D-0244, D-0246, D-0268, D-0269
---
## Context
UF-08.2 plans by area (D-0274). The engine already plans in areas: rule 7.2 picks the lowest-`r` area each round. What it lacks is a way to hand the area plan to the UI and to edit it by sets. Two shapes were weighed. (a) A new `sessionInput.areaSets` that makes `suggest` build from per-area set counts: every edit is a rebuild, but it needs a new selection mode, a canonical split of sets into items, and it would change energy and shuffle semantics. (b) New pure edit functions on a `Workout`, the family of `removeItem`, `applySwap` and `insertItem`: no change to `suggest`, no churn in the R7 examples or the server endpoint, edits are local (an edit in Back can't move Chest), and the UI already works this way for swap and remove. **(b) is chosen.**

## Decision
All functions are pure, in `packages/engine`, take `now` and `tz` as inputs where they read history, and never mutate their input. Rule text and examples are written by the engine tickets (T-0994, T-0995). `suggest`, `rankSwaps`, `applySwap`, `removeItem`, `insertItem`, `timeCheck`, `timeLeftS`, `balance`, `evaluateCheckin` and `prefill` do not change; the R7 to R14 examples stay as they are.
1. **Home area.** An item's home area is the area of its own `area_deficit` reason (its first primary area, as rule 8 reads it). Warm-up moves have none.
2. **`areaGroups(workout) → AreaGroup[]` (rule 12.4).** `{area, itemIds, sets, costS}` per home area in order of first appearance. `sets` is the sum of the items' `sets`, back-off sets not counted. Pure arithmetic over the workout.
3. **`adjustAreaSets(workout, area, delta, ctx) → Workout | {refused}` (rule 12.5).** `delta` is +1 or −1.
   - **+1:** the first item of the area, in item order, that has room gets one set (room means below 4 sets for the main lift and below 3 for any other item); its `costS` rises by one set cost (rule 7.1, so a one-side exercise follows D-0268). Otherwise, if the area has fewer than 2 items and the plan has fewer than 8, a second item is added: the top rule 7.2 candidate for the area that isn't in the plan, at 2 sets (the same eligibility, favorites, exclusion, recovery and avoid filters as `suggest`). Otherwise `{refused: "area_full"}`. If the extra cost doesn't fit `available` → `{refused: "time"}` (check order: structural error, `area_full`, `time`). A plan already over budget refuses with `time`.
   - **−1:** the last item of the area that has more than 2 sets loses one set; else, if the area has two items, the last is removed; else (one item at 2 sets) the area is removed as `removeArea`. The freed time stays unused (D-0191 §4).
   - So an area holds 2 to 7 sets (7 for the area holding the main lift, 6 otherwise).
4. **`addArea(workout, area, ctx)` and `removeArea(workout, area)` (rule 12.6).** `addArea` adds the area's top rule 7.2 candidate at 3 sets, else 2 (a compound is preferred only for an empty plan's main lift, as rule 7.2 step 1 with `autoMainLift` as given in `ctx`); `{refused: "time" | "items_cap" | "area_unavailable"}` (recovering, avoided, excluded out, or no eligible exercise). `removeArea` removes every item homed there, as repeated `removeItem` (main lift becomes null if it was one).
5. **`areaCandidates(workout, ctx) → AreaCandidate[]` (rule 12.7).** The areas not in the plan, in rule 7.2 area order (lowest projected `r` first, ties by the fixed area order, the projected load including the plan's own sets), each `{area, load, target, available: true | {reason}}` with reason `recovering`, `avoided`, `excluded_out`, `no_exercise`, `time` or `items_cap`. "Fill the rest for me" is `addArea` of the first available candidate until none is.
6. **Add exercise before Start** reuses `insertItem` (rule 12.3) with `leftS = unusedS` and `atIndex` = end. No new function.
7. **`orderItems(workout, library) → Workout` (rule 7.6).** A permutation of `plan.items`, deterministic. Tiers: (0) the main lift, (1) other compounds, (2) isolation (timed holds included). Within tiers 1 and 2, greedily choose the next item: prefer a home area different from the previously placed item's; then prefer an item sharing the previous item's **equipment group**; then the original index. Groups, from the exercise's first equipment item: barbell, rack and bench → `barbell`; dumbbell → `dumbbell`; machine → `machine`; cable → `cable`; pull-up bar and none → `bodyweight`. The warm-up (rule 7.3) is not regenerated. `plan.mainLiftId`, costs and totals do not change. The web applies it after every call that changes the plan, and the resulting order is what `sessions.plan` stores and UF-09 runs.
8. **"Not today"** is `rankSwaps(current, "equipment_taken", …)` then `applySwap` with the first candidate (D-0235 pin and visit exclude in the web). No engine change.
9. **Required tests (engine tickets):** every new example; the five simulated 14-day histories (balanced, all chest no legs, returning after 10 days, 15-minute, 90-minute) plus offline-merged; seeded properties (inline `mulberry32`, 200 cases or more): an edit never leaves a plan over budget unless it was over before; `areaGroups` sums equal item sums; `adjustAreaSets(+1)` then `(−1)` round-trips when no new item was added; `orderItems` is a permutation, idempotent and keeps the main lift first; same input, same output (R0-E1 style); `suggest` output is byte-identical before and after (golden). Re-vendor `supabase/functions/_shared/vendor/**` and run `vendor.mjs --check`.
10. **Not changed:** the time model, the caps (2 items per area, 8 items), targets, balance, rule 13, the server endpoint and `api/openapi.yaml` (the new functions are not endpoints).

## Consequences
- `docs/engine-rules.md` gains rules 7.6 and 12.4 to 12.7 and traceability rows. T-0994 (7.6, 12.4) lands before T-0995 (12.5 to 12.7); one engine worktree at a time.
- The web never picks an area or an exercise itself: it calls these functions (principle 3).
- An item's set count can now differ from its first build (a +1 on a 3-set accessory is 3 → no room → a second item), which is intended and tested.

## Revisit when
- People want sets per exercise, not per area.
- Alternating areas makes a main-lift area wait too long (then weigh tier 1 by area).
