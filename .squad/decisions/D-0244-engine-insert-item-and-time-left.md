---
id: D-0244
title: "Engine for a mid-workout add: new pure functions insertItem (rule 12.3, builds the item the way applySwap does, 3 then 2 sets inside the time left, never main, no new reason code) and timeLeftS (rule 8 extended to a workout in progress); suggest with pins is not used mid-workout"
status: decided
date: 2026-11-13
by: product-owner (idea, owner request)
area: engine
builds-on: D-0024, D-0071 §7, D-0092, D-0093, D-0096, D-0105, D-0191 §4, D-0243
---
## Context
D-0243 adds exercises to a running workout. The engine has `applySwap` (replace one item in place, rule 12.1), `removeItem` (rule 12.2) and `timeCheck` (rule 8). None of them adds an item.

`suggest` with `pinnedIds` (D-0205 §4) is the wrong tool mid-workout, for four reasons:
- It rebuilds the whole plan. That can drop, reorder or re-set items that are done or under way, and would change `startDeficits` and the warm-up.
- It drops a pin silently.
- It checks fit against `available` (the whole budget), not against the time actually left.
- Its 2-per-area cap and recovery check read today's logged sets as history.

The UI must not compute sets, reps or the fit itself (principle 3).

## Decision
1. **`insertItem(workout, exerciseId, {atIndex, leftS}, history, profile, library, now, tz)`** is a new pure function (rule 12.3). It returns `{workout, sets}`, or `{refused: "time" | "items_cap"}`.
   - **Item**, built the way `applySwap` builds one: `isMain: false`. Reps are rule 7.2's accessory slot for the profile's goal (null for a timed exercise). `prefill` is rule 14 over `history` at `now` with no `previous`, so there is no carry. A timed exercise gets `durationS` = its planned duration (rule 7.1, D-0092). `backoff: null`. `costS = itemCostS(exercise, sets)`.
   - **Sets:** 3, then 2. With `energy` low, only 2 is tried (rule 7.4) and the item carries `energy_low_trim`. The first count with `costS ≤ leftS` wins. If neither fits, the result is `{refused: "time"}`. If the plan already has 8 items, the result is `{refused: "items_cap"}`, which is checked first.
   - **Reasons** (rule 10 order) for the exercise's first primary area `A` (fixed order): `area_deficit {A, plan.startDeficits[A]}`, `days_since {A, D − lastTrainedDate(A)}` over `history` at `now` (sets logged today count, as in `applySwap`), `energy_low_trim` when it applies, and `prefill {kind}`. There is no new reason code, so the openapi `Reason` enum is unchanged.
   - **Workout:** the item goes in at `atIndex`, and every other item is unchanged and keeps its order. `itemsTotalS = Σ costS`, `totalS = itemsTotalS + 180`, `unusedS = max(0, available − itemsTotalS)`. The following are unchanged: `plan.version`, `plan.mainLiftId`, `plan.warmup` (not regenerated), `plan.startDeficits`, `sessionReasons`, `budgetMin`, `warmupInBudget` and `energy`. Inputs are never mutated.
   - **Validation (structural only, `RangeError`):** `exerciseId` not in `library` or a warm-up move; `exerciseId` already an item; `atIndex` not an integer in `[0, items.length]`; `leftS` not an integer; `now` without an offset. The equipment, level, exclusion and recovery filters stay in the UI, as for `applySwap` (D-0243 §3).
2. **`timeLeftS(workout, {elapsedS, setsDone, skippedItems, warmupLeftS})`** is a new pure function (rule 8). It returns an integer, which may be negative.
   - The formula is `budgetMin × 60 − elapsedS − warmupLeftS − Σ remaining(i)` over the items that are not skipped.
   - `remaining(i) = costS(i)` when `setsDone[i] = 0`. Otherwise it is `max(0, setsInItem(i) − setsDone[i]) × setCostS(i)`, where a back-off counts as a set and there is no transition.
   - `elapsedS` is rule 8's: no paused time, and no warm-up when `warmupInBudget` is off. The caller passes `warmupLeftS`: the unspent part of the 180-s warm-up when it is in the budget and not finished, otherwise 0.
   - Between exercises this equals `−behindS` of rule 8, with nothing else running.
   - Validation: `RangeError` on non-integers, on `setsDone.length ≠ items.length`, and on out-of-range `skippedItems`.
3. **Contracts.** `docs/engine-rules.md` gains rule 12.3 and a rule 8 paragraph, with examples R12-E20 onward and R8-E4 onward, written by the engine ticket under this decision. `api/openapi.yaml`: no change, because `SessionPlan.items` already has `maxItems: 8` and there is no new reason code. `docs/data-model.md`: no change. The function is device-only and nothing new is vendored to the Edge Functions, unless the engine ticket finds that `vendor.mjs --check` covers all of `src`; if it does, it re-vendors, as T-0936 does.
4. **Serial engine lane** (D-0096): the engine ticket waits for T-0936.

## Consequences
- The engine ticket also adds simulated 14-day history tests: zero history, the returning-after-10-days history, and a property test that `insertItem` never makes `timeLeftS` negative after the add.
- Rule 8 Trim reads `startDeficits[A]` for an added item's first primary area, the same as for any accessory. That is deterministic and needs no change.

## Revisit when
Trim is found to cut freshly added items too eagerly, or an "Add anyway" over-budget option is wanted (spec open question 2).
