---
id: T-0224
title: "Engine: pure applySwap(workout, current, candidate, reason, history, profile, library, now, tz) → Workout, the rule 12 addendum (D-0071 §7, D-0093)"
lane: engine
screens: [UF-05.1, UF-08.3, UF-09.9, UF-09.6]
decisions: [D-0025, D-0040, D-0056, D-0057, D-0062, D-0065, D-0069, D-0071, D-0092, D-0093]
deps: [T-0204, T-0205, T-0219]
status: ready
---
<!-- Written by product-owner 2026-10-01 (groom mode). Build flow: wl-build-engine. About ½ day. Unblocks T-0306b (SwapSheet) and through it T-0303c. Depends on T-0219 so the timed cost is built once at the planned duration (D-0092); if the orchestrator must run it first, see Coordination. -->

## Why
Principle 3: the UI never builds a plan item. UF-05.1 (mid-workout swap, from UF-09.9 Paused and UF-09.6 Next exercise) and UF-08.3 (swap before starting) both hand the user's pick to one engine function. That function rebuilds the slot exactly as `suggest` would have built it for that exercise: the rep slot, the carried pre-fill weight, the reasons, and the costs that keep the plan honest about the budget (principle 2). D-0071 §7 fixed the signature and the main semantics. D-0093 settles the open points (reasons, back-off, warm-up, validation) and names the rule 12 addendum. The UI side (T-0306b) only asserts that it calls `applySwap` and renders the result.

## Scope
- In:
  - `packages/engine/src`: `applySwap` per D-0071 §7 and D-0093 §1–§7, exported from `src/index.ts`.
    - Share the rep-slot and reason-building code with `suggest`, so `suggest` and `applySwap` cannot drift. Helpers may move out of `src/session.ts`, but every `suggest` result stays byte-identical.
    - Use T-0219's planned-duration cost for timed candidates.
  - `docs/engine-rules.md`, under D-0093 §8:
    - a `### 12.1 applySwap` subsection after R12-E5;
    - worked examples R12-E6…R12-E11;
    - `applySwap(…)` added to rule 0's function list;
    - one Traceability row.
  - Tests: every AC below, including the simulated 14-day histories.
  - Edge cases:
    - zero history;
    - mid-session with sets already logged today;
    - returning after 10 days off (the carried or held weight);
    - offline-merged history;
    - a timed candidate (D-0092);
    - the main slot;
    - an over-budget candidate;
    - a second swap of the same slot;
    - the High back-off slot.
- Out:
  - `SwapSheet`, its chips and copy, and persisting through `replaceItem` (T-0306b). UF-08.3 (T-0303c).
  - Changing `rankSwaps`' ranking.
  - Regenerating the warm-up (D-0093 §4).
  - Rep slots by goal (T-0214 makes `applySwap` goal-aware when it lands; this ticket uses today's slots).
  - The vendored engine copy (regenerated at merge, D-0053 §1).
  - `parseSessionPlan` (T-0306b AC-B10; the engine has no `@workoutlab/shared` dependency).

## Acceptance criteria
**Fixtures unless an AC says otherwise:**
- F-tz (`now = "2026-09-27T12:00:00+02:00"`), F-targets, F-profile, F-input and `LIBRARY`.
- `sessionOf`, `fSwap` and `setsWithReps` from `test/fixtures/common.ts`.
- Each AC is at least one Vitest test. A test that implements `R12-En` starts its title with that id.

**Workouts:**
- **W** = `suggest([], F_TARGETS, F_PROFILE, LIBRARY, F_INPUT, now, tz)`, which is R7-E4: bench-press × 4 (main, `costS` 720), inverted-row × 3 (555), leg-extension × 2 (270). `itemsTotalS` 1545, `totalS` 1725, `unusedS` 75, `available` 1620.
- **W_lat** = `sessionOf([["bench-press", 4, true], ["lat-pulldown", 3], ["leg-extension", 2]])` with `items[1].prefill` set to `{weightKg: 50, reps: 8, durationS: null, kind: "increase"}`.
- **W_row** = `fSwap()` with `items[1].prefill.weightKg` set to 60.
- **W_t** = `sessionOf([["bench-press", 4, true], ["dead-bug", 2]], {budgetMin: 20, warmupInBudget: false})`: `costS` 720 and 270, `itemsTotalS` 990, `totalS` 1170, `unusedS` 210.
- **H_p** = `setsWithReps("2026-09-24", "plank", [{durationS: 115}, {durationS: 115}, {durationS: 115}])`.
- **H_b** = `setsWithReps("2026-09-24", "bench-press", [[80, 8], [80, 7], [80, 6]])`.
- **W_h** = `suggest(H_b, …, input({budgetMin: 15, warmupInBudget: false, energy: "high", mainLiftId: "bench-press"}))`, which is R14-E9: bench-press × 4, `prefill` 80 × 7 `add_rep`, `backoff {70, 6}`, `costS` 885, `unusedS` 15.

**"Unchanged" means** deep-equal to the input for:
- every other item;
- `plan.version`, `plan.warmup` and `plan.startDeficits`;
- `budgetMin`, `warmupInBudget`, `energy` and `sessionReasons`.

- **AC1 (R12-E6, an accessory swap at zero history)** `applySwap(W, "inverted-row", "barbell-row", "variety", [], …)`:
  - `items[1]` is exactly `{exerciseId: "barbell-row", isMain: false, sets: 3, repsMin: 8, repsMax: 12, durationS: null, costS: 555, backoff: null, prefill: {weightKg: null, reps: 8, durationS: null, kind: "first_time"}, reasons: [area_deficit {back, 1}, days_since {back, null}, swap {variety}, prefill {first_time}]}`.
  - Nothing carries over: inverted-row's pre-fill weight is 0, and D-0062 §1 needs > 0.
  - `itemsTotalS` 1545, `totalS` 1725, `unusedS` 75. `plan.mainLiftId` is `"bench-press"`, and everything else is unchanged.
- **AC2 (R12-E7, carry, the former T-0306b AC-B9)**
  - `applySwap(W_lat, "lat-pulldown", "seated-cable-row", null, [], …)`: `items[1]` is `seated-cable-row × 3`, 8–12, `costS` 555, `prefill {weightKg: 50, reps: 8, durationS: null, kind: "carry"}`, and `reasons` `[area_deficit {back, 0}, days_since {back, null}, swap {null}, prefill {carry}]`. `sessionOf`'s `startDeficits` are all 0.
  - **Contrast:** `applySwap(W_row, "barbell-row", "db-row", "variety", [], …)` gives `prefill {weightKg: null, reps: 8, durationS: null, kind: "first_time"}`, because barbell and dumbbell share no equipment item.
- **AC3 (R12-E8, the main slot, the former T-0306b AC-B8)** `applySwap(W, "bench-press", "push-up", "equipment_taken", [], …)`:
  - `items[0]` is `push-up × 4`, `isMain: true`, reps 6–8, `costS` 720, `prefill {weightKg: 0, reps: 6, durationS: null, kind: "first_time"}`, and `reasons` `[main_lift, area_deficit {chest, 1}, days_since {chest, null}, swap {equipment_taken}, prefill {first_time}]`.
  - `plan.mainLiftId` is `"push-up"`, and `plan.warmup` is unchanged.
- **AC4 (R12-E9, a timed candidate, D-0092)** `applySwap(W_t, "dead-bug", "plank", "short_on_time", H_p, …)`:
  - `items[1]` is `plank × 2`, `repsMin`/`repsMax` null, `durationS` 120, `costS` 2 × (120 + 60) + 60 = 420, and `prefill {weightKg: null, reps: null, durationS: 120, kind: "add_rep"}`.
  - Its `reasons` are `[area_deficit {core, 0}, days_since {core, 3}, swap {short_on_time}, prefill {add_rep}]`.
  - `itemsTotalS` 1140, `totalS` 1320, `unusedS` 60.
  - `items[1].costS` equals plank's `timeCostS` from `rankSwaps("dead-bug", "short_on_time", W_t, …, H_p, …)`.
  - **Zero history:** with `[]`, `durationS` is 45, `costS` 270, `prefill.kind` `first_time` and `days_since {core, null}`, and the totals are 990, 1170 and 210.
- **AC5 (R12-E10, the back-off slot carries and is recomputed)** `applySwap(W_h, "bench-press", "db-bench-press", null, H_b, …)`:
  - `items[0]` is `db-bench-press × 4`, `isMain: true`, reps 6–8.
  - Its `prefill` is `{weightKg: 80, reps: 6, durationS: null, kind: "carry"}`: it shares chest at 1.0 and the bench.
  - Its `backoff` is `{weightKg: 72, reps: 6}`: `floorInc(72, 2)`, with db-bench-press's 2 kg increment instead of bench-press's 2.5.
  - `costS` is 720 + 165 = 885.
  - Its `reasons` are `[main_lift, area_deficit {chest, 0.85}, days_since {chest, 3}, swap {null}, energy_high_backoff, prefill {carry}]`.
  - `plan.mainLiftId` is `"db-bench-press"`, `itemsTotalS` 885, `unusedS` 15.
- **AC6 (R12-E11, over budget is allowed; the reasons follow the new first primary area)** `applySwap(W, "leg-extension", "back-squat", null, [], …)`:
  - `items[2]` is `back-squat × 2`, reps 8–12, `costS` 390, `prefill {weightKg: null, reps: 8, durationS: null, kind: "first_time"}`.
  - Its `reasons` are `[area_deficit {glutes, 1}, days_since {glutes, null}, swap {null}, prefill {first_time}]`. Glutes precedes quads in the fixed order.
  - `itemsTotalS` 1665 > 1620, `totalS` 1845, `unusedS` 0.
  - **Contrast:** `rankSwaps("leg-extension", null, W, …)` marks back-squat `fitsBudget: false`.
- **AC7 (a second swap)** Applying `applySwap(R, "barbell-row", "db-row", "discomfort", [], …)` to AC1's result `R`:
  - `items[1]` is `db-row × 3` with exactly one `swap` reason, `swap {discomfort}`.
  - Its `prefill` is `first_time` with `weightKg` null: `previous` is barbell-row at weight null.
  - The other items are unchanged from `R`.
- **AC8 (mid-session)** Given `now = "2026-09-27T12:30:00+02:00"` and a history holding 2 hard inverted-row sets of the current session at 12:10 and 12:15, `applySwap(W, "inverted-row", "lat-pulldown", null, history, …)`:
  - `items[1].sets` stays 3.
  - `days_since` is `{back, 0}`, because sets logged today count (D-0093 §3).
  - `prefill` is `first_time` with `weightKg` null: inverted-row's pre-fill weight 0 carries nothing.
  - The history array deep-equals its input (not mutated).
- **AC9 (returning after 10 days off; offline)**
  - Given `setsWithReps("2026-09-15", "seated-cable-row", [[40, 12], [40, 12], [40, 12]])` (gap 12), `applySwap(W_lat, "lat-pulldown", "seated-cable-row", null, …)` gives `prefill {weightKg: 40, reps: 8, kind: "hold_after_break"}`. The exercise's own history wins over carry (rule 14 step 1).
  - Given the same rows only as queued rows (`pending: true`), the result is the same.
  - Given them tombstoned by newer queued rows, the result is AC2's `carry` 50.
- **AC10 (validation, D-0093 §6)** `applySwap` throws `RangeError` when:
  - `currentExerciseId` is `"lat-pulldown"` on W (not an item);
  - `candidateId` is `"nope"`, or `"wu-cat-cow"` (a warm-up);
  - `candidateId` is `"leg-extension"` while swapping `inverted-row` on W (already in the plan), or equals the current id;
  - on `sessionOf([["barbell-row", 4, true]])`, `candidateId` is `"straight-arm-pulldown"` (an isolation in the main slot);
  - on W, `inverted-row` → `"leg-curl"` (no shared weight-1.0 area);
  - `reason` is `"bored"`;
  - `now` is `"2026-09-27T12:00:00"`.

  **Contrast:** the same main-slot call with `"barbell-row"` → `"lat-pulldown"` does not throw.
- **AC11 (purity, determinism, shape)** For AC1–AC9's calls:
  - deep-frozen inputs neither throw nor change;
  - two runs are deep-equal;
  - reversing `history` or `library` gives a deep-equal result;
  - the result is a new object (`result !== workout`, `result.plan.items !== workout.plan.items`);
  - every item has exactly the 10 `WorkoutItem` keys and the result has exactly the 8 `Workout` keys of `api/openapi.yaml` (read the schema's `required` lists in the test, the way `t0204-traceability.test.ts` reads `SwapCandidate`);
  - `pnpm --filter @workoutlab/engine lint` passes.
- **AC12 (simulated 14-day histories: `applySwap` agrees with `suggest` and `rankSwaps`)** For each of `balancedHistory`, `allChestNoLegsHistory`, `returningAfter10DaysHistory`, `offlineMergedHistory`, T-0219's `timedCoreHistory` and `[]`, at F-input and at `{budgetMin: 15, warmupInBudget: false, energy: "high"}`, take `w = suggest(…)`. For every item `k` of `w` and every candidate `c` of `rankSwaps(w.plan.items[k].exerciseId, null, w, …)`, `r = applySwap(w, item k, c.exerciseId, null, …)` satisfies all of these:
  - `r.plan.items.length` equals `w`'s;
  - item `k` keeps `isMain` and `sets`;
  - item `k`'s `costS` equals `c.timeCostS`, plus one set cost when it has a back-off;
  - `c.fitsBudget` holds exactly when `r.itemsTotalS ≤ availableS(w.budgetMin, w.warmupInBudget)`;
  - item `k`'s `prefill` deep-equals `prefill(new, slot, history, LIBRARY, now, tz, {exerciseId: old, weightKg: old prefill weight})`;
  - every other item is unchanged.

  Also, `applySwap(w, k, original id)` on the swapped result `r` restores item `k` deep-equal to the original, apart from the `swap {null}` reason and a pre-fill that may now be `carry`. List any such case literally in the test, so it is not a blanket exclusion.
- **AC13 (`suggest` is byte-identical)** Every existing T-0200, T-0201a, T-0201b, T-0202, T-0204, T-0205 and T-0219 test stays green with no expectation edited, and T-0219's pre-change `suggest` snapshot still matches. If a shared helper refactor changes any `suggest` field, stop and raise triage.
- **AC14 (the contract text, D-0093 §8)** A Vitest test reads `docs/engine-rules.md` and asserts:
  - a `### 12.1 applySwap` heading sits after the `- **R12-E5` line and before `## 13.`;
  - lines starting `- **R12-E6` … `- **R12-E11` exist, each citing D-0093;
  - rule 0's function list contains `applySwap(`;
  - the Traceability table has a T-0224 row;
  - the R12-E1…R12-E5 lines and rule 13 are unchanged against `main` (T-0219's re-scoped guard, D-0092 §6). If T-0219 has not landed, this ticket re-scopes the two guards as T-0219 AC14 describes.
- **AC15 (public API and traceability)**
  - `import { applySwap } from "@workoutlab/engine"` typechecks.
  - `expectTypeOf(applySwap).returns.toEqualTypeOf<Workout>()`.
  - Test titles include R12-E6…R12-E11.
  - There are 0 placeholder or trivially-true assertions.

## Paths you may change
- `packages/engine/**` (the lane: `engine`).
- **Listed extras:**
  - `docs/engine-rules.md`: the `### 12.1 applySwap` subsection with R12-E6…R12-E11, the `applySwap(…)` entry in rule 0's function list, and one Traceability row (D-0093 §8).

## Contract impact
- `docs/engine-rules.md` gets the rule 12 addendum under D-0093 (engine lane owns this contract).
- `api/openapi.yaml` is unchanged: `applySwap` is device-side only (D-0071 §8), and its output is the existing `Workout` schema.

## Coordination
- **Files this ticket changes:**
  - a new `packages/engine/src/apply-swap.ts` (or an addition to `src/swaps.ts`);
  - `src/session.ts`, for the shared helpers only;
  - `src/index.ts`;
  - a new `test/rule-12-apply-swap.test.ts` and a new `test/apply-swap-histories.test.ts`;
  - `docs/engine-rules.md` rule 0's list, §12.1 and the Traceability table.
- **Serialise:** T-0219 → **T-0224** → T-0214. All three change `src/session.ts` and `docs/engine-rules.md`.
  - If the orchestrator must run T-0224 before T-0219, AC4 and AC12 use `defaultDurationS` for timed costs (AC4: `costS` 270, `durationS` = `prefill.durationS` 120). T-0219 then updates exactly those two assertions to D-0092, and the commit says which case applies.
- When T-0214 lands after this ticket, it makes `applySwap`'s rep slot goal-aware (D-0095). Its tests add a goal case to R12-E8.
- T-0306b's AC-B7–B9 now point here: R12-E6…R12-E8 carry their semantics (D-0071 §7).

## Definition of done
- Tests for every AC pass, including R12-E6…R12-E11 and the simulated histories (AC12).
- `npx -y pnpm@10.28.2 -w typecheck lint test --force` is green.
- The contract change is linked to D-0093.
- Commit messages start with `T-0224` and cite UF-05.1 or UF-08.3 (e.g. `T-0224 UF-05.1: engine applySwap`).
