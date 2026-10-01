---
id: D-0093
title: Rule 12 addendum — applySwap(workout, current, candidate, reason, …) rebuilds one item in place; reasons rebuilt, back-off kept, warm-up and session fields untouched, structural checks only
status: revisit
date: 2026-10-01
by: product-owner (T-0224 groom)
area: engine
builds-on: D-0065 §5, D-0069 §6, D-0071 §7, D-0092, D-0096 (§1 supersedes D-0071 §7's timed parenthetical)
---
## Context
D-0071 §7 fixes `applySwap`'s signature and its main semantics: it keeps the position, `sets`
and `isMain`, uses rule 7.2's rep slot, runs `prefill` with carry, inserts `swap {reason}`,
recomputes the totals and follows `mainLiftId`. It leaves the rule 12 text change to the engine
lane. Grooming T-0224 found six points that D-0065, D-0069 and D-0071 leave open:
1. Which `area_deficit` and `days_since` the new item carries when its first primary area differs
   from the old one (back-squat's first primary is glutes, leg-extension's is quads).
2. What happens to a High-energy back-off and a Low-energy trim on the swapped slot.
3. Whether the warm-up and `sessionReasons` are regenerated.
4. A timed candidate's duration and cost, now that D-0092 costs at the planned duration.
5. What `applySwap` validates, since the UI may only pass `rankSwaps` candidates.
6. A second swap of the same slot.

## Decision
1. **Signature (D-0071 §7):** `applySwap(workout, currentExerciseId, candidateId, reason, history,
   profile, library, now, tz): Workout`. It is pure and exported from `@workoutlab/engine`. `reason` is a
   `SwapReason` or `null` (Best match). `profile` is the type `suggest` takes (after T-0214 it
   includes the optional `goal`, D-0095).
2. **The item is rebuilt the way `suggest` builds one.** Let `i` be the index of
   `currentExerciseId` in `plan.items`, `old` that item, and `new` the candidate.
   - `exerciseId = new.id`. `isMain` and `sets` are `old`'s.
   - `repsMin`/`repsMax` are rule 7.2's slot for `new` at `isMain` (and `profile.goal` once
     T-0214 lands). For a timed `new`, they are null.
   - `prefill` = rule 14 `prefill(new, slot, history, library, now, tz, previous)` with
     `previous = {exerciseId: old.exerciseId, weightKg: old.prefill.weightKg}` (carry, D-0057 §1,
     D-0062 §1).
   - `durationS` = `prefill.durationS` for a timed `new`, otherwise null (D-0092 §3).
   - `backoff`: if `old.backoff` is non-null and `new` is not timed, it is recomputed as
     `{weightKg: floorInc(0.9 × prefill.weightKg, new inc), reps: repsMin}` (null weight stays
     null, rule 7.4, D-0040 §4). Otherwise it is null.
   - `costS` = `itemCostS(new, sets)` at the planned duration (D-0092), plus one set when
     `backoff` is non-null. Without a back-off this equals the candidate's `rankSwaps` `timeCostS`.
3. **Reasons are rebuilt in the D-0040 §6 order** for `new`. Let `A` = `new`'s first primary area
   in the fixed order.
   1. `main_lift`, if `isMain`.
   2. `area_deficit {A, plan.startDeficits[A]}`.
   3. `days_since {A, days}`, where `days` is D − rule 5's `lastTrainedDate(A)` over `history` at
      `now`, or null. Mid-session this counts the sets already logged today.
   4. `swap {reason}`.
   5. `energy_low_trim`, if `old` had it.
   6. `energy_high_backoff`, if the new `backoff` is non-null.
   7. `prefill {kind}`.

   A second swap of the same slot therefore carries exactly one `swap` reason (the newest), and
   `previous` is the exercise being replaced, not the original.
4. **Workout fields.**
   - `plan.mainLiftId = new.id` when `isMain`.
   - `itemsTotalS = Σ costS`, `totalS = itemsTotalS + 180` and
     `unusedS = max(0, availableS(budgetMin, warmupInBudget) − itemsTotalS)`.
   - Unchanged: `plan.version`, `plan.warmup`, `plan.startDeficits`, `budgetMin`,
     `warmupInBudget`, `energy`, `sessionReasons` and every other item (deep-equal).
   - The warm-up is not regenerated. Mid-workout it has already happened, and before the start
     UF-08.2 keeps the warm-up it showed.
5. **Over budget is allowed.** A `fitsBudget: false` candidate may be applied (D-0056 §3). The
   result then has `itemsTotalS > available` and `unusedS` 0, and UF-08.2 shows `warn` (D-0065 §4).
6. **Structural checks only.** `applySwap` throws `RangeError` when:
   - `currentExerciseId` is not an item of the plan;
   - `candidateId` is not in `library`, or is `kind: warmup`;
   - `candidateId` equals `currentExerciseId` or is already another item of the plan;
   - the slot is the main slot and `new` is not a compound;
   - `new` shares no weight-1.0 area with `old`;
   - `reason` is not a `SwapReason` or null;
   - `now` has no offset.

   It does not repeat `rankSwaps`' equipment, level, recovery or budget filters. Those are
   ranking concerns, and the UI only offers `rankSwaps` candidates (D-0071 §7).
7. **The input is not mutated, and the output is deterministic.** It has exactly the `Workout`
   and `WorkoutItem` keys of `api/openapi.yaml`. `parseSessionPlan` round-trips are asserted
   on the web side (T-0306b AC-B10), because the engine package has no `@workoutlab/shared`
   dependency. T-0306b has no ticket file yet, so its groom must carry this round-trip as an
   AC.
8. **Contract change (engine lane):** `docs/engine-rules.md` gets a `### 12.1 applySwap`
   subsection after R12-E5, with §1–§6 in rule form and worked examples **R12-E6…R12-E11**,
   plus a Traceability row for T-0224. Rule 0's function list gains `applySwap(…)`. The R12-E1…E5
   lines and rule 13 are unchanged.

## Consequences
- engine (T-0224): implements this decision. It may export small helpers from `src/session.ts`
  (the rep slot, the reason builder) so that `suggest` and `applySwap` share one code path, as
  long as every `suggest` result stays byte-identical.
- web (T-0306b, T-0303c): `SwapSheet` calls `applySwap` and renders its result. It builds no item.
  T-0306b's AC-B7–B9 become R12-E6…R12-E8 here.
- backend: the vendored engine is regenerated at merge (D-0053 §1).

## Revisit when
- UF-08.3 users ask for the warm-up to follow a pre-start swap of the main lift.
- Swapping onto a recovering area mid-session turns out to need a guard in `applySwap` itself.
