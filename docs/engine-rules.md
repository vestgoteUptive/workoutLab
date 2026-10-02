# Recommendation engine rules (v1; all numbers are tunable defaults)

v1 comes from T-0101. Decisions: D-0004, D-0013, D-0015, D-0018, D-0024, D-0025, D-0026, D-0027. Screen IDs follow user flows v2 (D-0002).
Every rule has worked examples (`Rn-Em`). Each example is at least one unit test in `packages/engine` (the build ticket is shown in §Traceability).

## Fixtures (used by every example unless it says otherwise)
- **F-tz:** `tz = Europe/Stockholm`, `now = 2026-09-27T12:00:00+02:00`, so today is D = 2026-09-27.
- **F-profile:** level `beginner`; equipment `full` = [barbell, rack, bench, dumbbell, cable, machine, pullup-bar]; rhythm 3–4; no priority areas; onboarded and `plan_changed_at` 2026-08-02.
- **F-goal:** `goal` is `build_muscle` unless an example says otherwise (D-0061 §1, D-0095).
- **F-targets:** rule 4 with F-profile: chest/back/glutes/quads 20, shoulders/hamstrings 16, arms/core/calves 12.
- **F-input:** `budgetMin 30, warmupInBudget true, energy normal, shuffle 0`, with no main/pinned/excluded ids.
- **F-history:** empty.
- **L1 library.** "bw" means bodyweight, so the pre-filled weight is 0. Level is `beginner` unless stated. The increment is in kg.

| id | type | equipment | area weights | inc |
|---|---|---|---|---|
| back-squat | compound | barbell, rack | quads 1, glutes 1, hamstrings .5, core .5 | 2.5 |
| romanian-deadlift | compound | barbell | hamstrings 1, glutes .5 | 2.5 |
| hip-thrust | compound | barbell, bench | glutes 1, hamstrings .5 | 2.5 |
| leg-extension | isolation | machine | quads 1 | 5 |
| leg-curl | isolation | machine | hamstrings 1 | 5 |
| calf-raise | isolation | machine | calves 1 | 5 |
| bench-press | compound | barbell, bench | chest 1, shoulders .5, arms .5 | 2.5 |
| db-bench-press | compound | dumbbell, bench | chest 1, shoulders .5, arms .5 | 2 |
| push-up | compound | — | chest 1, arms .5, core .5 | bw |
| overhead-press | compound | barbell | shoulders 1, arms .5, core .5 | 2.5 |
| lateral-raise | isolation | dumbbell | shoulders 1 | 2 |
| barbell-row | compound | barbell | back 1, arms .5 | 2.5 |
| db-row | compound | dumbbell, bench | back 1, arms .5 | 2 |
| inverted-row | compound | rack | back 1, arms .5, core .5 | bw |
| lat-pulldown | compound | cable | back 1, arms .5 | 5 |
| seated-cable-row | compound | cable | back 1, arms .5 | 5 |
| straight-arm-pulldown | isolation | cable | back 1 | 5 |
| pull-up (intermediate) | compound | pullup-bar | back 1, arms .5 | bw |
| biceps-curl | isolation | dumbbell | arms 1 | 2 |
| plank (timed, 45 s) | isolation | — | core 1 | bw |
| dead-bug | isolation | — | core 1 | bw |
| hanging-knee-raise | isolation | pullup-bar | core 1 | bw |

Warm-up moves (kind `warmup`, 40 s each): wu-scap-push-up (chest 1, shoulders .5) · wu-arm-circle (shoulders 1, chest .5) · wu-band-pull-apart (back 1, shoulders .5) · wu-cat-cow (core 1, back .5) · wu-bodyweight-squat (quads 1, glutes 1) · wu-leg-swing (hamstrings 1, glutes .5) · wu-jumping-jack (general) · wu-march-in-place (general).

Fixed area order: chest, back, shoulders, arms, core, glutes, quads, hamstrings, calves. Levels: beginner < intermediate < advanced.

## 0. Purity and inputs (D-0024)
- All engine functions are pure: `suggest(history, targets, profile, library, sessionInput, now, tz)`, `balance(history, targets, library, now, tz)`, `timeCheck(workout, progress)`, `rankSwaps(…)`, `applySwap(workout, current, candidate, reason, history, profile, library, now, tz)`, `prefill(…)` and `evaluateCheckin(sessions, profile, checkins, now, tz)`. They never read the clock, randomness or globals. `Date.now()`, `new Date()` without arguments and `Math.random()` are banned in `packages/engine/src` (lint rule, T-0200).
- **History** is the server rows ∪ the offline queue (NFR offline). The engine dedupes by `client_id` and keeps the row with the greatest `edited_at`. When two rows have the same `client_id` and `edited_at`, a server row beats a queued row (mirroring the server's no-op), between two queued rows a tombstone beats a live row, and otherwise the first row in input order wins (D-0034). It then drops rows with `deleted_at` set (D-0015). Callers pass at least the last 56 local days.
- **Eligible exercise:** kind `exercise`, every equipment item ∈ `profile.equipment` (no equipment is always eligible), level ≤ profile level, and not in `excludeIds`.
- **R0-E1** Given any fixed inputs, When `suggest` runs twice, Then the results are deep-equal.
- **R0-E2** Given two rows with `client_id` c1 (the 10:00 edit has reps 8, the 10:05 edit has reps 6) and a row c2 whose newest version has `deleted_at` set, When history is normalised, Then c1 has reps 6 and c2 is absent.

## 1. Exercise → area mapping
Each exercise has area weights: primary = 1.0, secondary = 0.5. Every exercise has at least one primary area. Its **primary areas** are the areas with weight 1.0, in the fixed order.
- **R1-E1** Given 1 hard set of back-squat, Then quads 1, glutes 1, hamstrings 0.5, core 0.5, and all other areas 0.

## 2. Hard sets
A set is hard if `is_warmup = false` and it is not tombstoned. Warm-up moves never count (D-0004). The load of one set for an area is that area's weight.
- **R2-E1** Given 6 hard and 2 warm-up sets of back-squat on 2026-09-25, Then quads 6, glutes 6, hamstrings 3, core 3 (UF-10 AC2).

## 3. Rolling window (D-0013, D-0015)
The window is the local calendar day D plus the 13 days before it (D−13 … D) in `tz`. A set is placed by the local date of its `completed_at` only. `completed_at` never changes, and `edited_at` never places a set. Tombstoned sets (`deleted_at` not null) are excluded. `load(area) = Σ weighted hard sets in the window`. There is no decay in v1.
- **R3-E1** Given hard sets at 2026-09-14 23:59 and 2026-09-13 23:59 local, When `now` = 2026-09-27 12:00, Then the 09-14 set counts and the 09-13 set does not. When `now` = 2026-09-28 00:00 local, Then neither counts (UF-10 AC6).
- **R3-E2** Given a hard set at 2026-09-26T22:30Z (00:30 local on 09-27), Then it lands in `days[13]` (D), not in D−1.
- **R3-E3** Given 3 hard back-squat sets on 09-25, one of them tombstoned, Then quads 2.
- **R3-E4 (zero history)** Given F-history, Then every load is 0.

## 4. Targets (D-0027)
`target = roundHalfUp(base × S × P / 56)`. Base: chest/back/glutes/quads 20, shoulders/hamstrings 16, arms/core/calves 12. `S = clamp(2 × (rhythmMin + rhythmMax), 7, 21)`. `P` = 5 for a priority area (+25 %), 4 otherwise. The calculation uses integers until the final rounding. Goal and level do not change targets in v1. Targets are re-derived on onboarding and UF-11.3 Save (`source = default`) and on a check-in Accept (`source = adapted`). They are never re-derived silently.
- **R4-E1** Given rhythm 3–4 and no priorities, Then 20 / 16 / 12.
- **R4-E2** Given rhythm 3–4 and priorities back, hamstrings, arms, Then back 25, hamstrings 20, arms 15 (UF-11 AC15).
- **R4-E3** Given rhythm 2–3, Then back 14, shoulders 11, arms 9 (this is the UF-11.1 preview for the AC1 proposal).
- **R4-E4** Given rhythm 1–1 (S is clamped to 7), Then back 10, shoulders 8, arms 6.
- **R4-E5** Given rhythm 7–7 (S is clamped to 21), Then back 30 and arms 18. With back as a priority, back = 38 (37.5 rounds half up).

## 5. Deficit and attention (D-0027)
`deficit(area) = max(0, target − load) / target`, unrounded (the UI rounds %). `lastTrainedDate` is the latest local date in history on which the area received more than 0 weighted hard sets (null if none). `needsAttention = deficit ≥ 0.5 AND (lastTrainedDate = null OR D − lastTrainedDate ≥ 6 days)`. If the window contains no hard sets at all, `needsAttention = false` for every area.
- **R5-E1 (returning after 10 days off)** Given 4 hard romanian-deadlift sets on 2026-09-17 only, Then hamstrings has deficit 0.75, lastTrainedDate 09-17 and needsAttention true. Chest has deficit 1, lastTrainedDate null and needsAttention true.
- **R5-E2** Given the same sets on 2026-09-23, Then hamstrings needsAttention is false (4 days < 6).
- **R5-E3 (boundary)** Given hamstrings load 8/16 last trained 2026-09-21, Then deficit 0.5, 6 days, and needsAttention true. At load 8.5, needsAttention is false.
- **R5-E4 (zero history)** Given F-history, Then every deficit is 1 and every needsAttention is false.

## 6. Recovery (D-0027)
An area is **recovering** when the weighted hard sets with `completed_at` in `(now − 48 h, now]` sum to ≥ 6. This uses absolute time. `suggest` never selects an exercise that has a recovering area at weight 1.0, and the session reasons get `recovering_skipped {area}`.
- **R6-E1** Given 6 hard back-squat sets at `now − 47 h`, Then quads and glutes are recovering and hamstrings (3) is not.
- **R6-E2** Given the same sets at `now − 49 h`, Then nothing is recovering.

## 7. Session building (D-0004, D-0024)
### 7.1 Time model
Set cost = work + rest. Work is 45 s for a non-timed set. For a timed set, work is its **planned duration**: the rule 14 pre-fill `durationS` for that exercise over the same history and `now`, which is `defaultDurationS` with no usable history (D-0092). The item's `durationS` is that planned duration (a timed exercise with neither falls back to 45 s). Rest is 120 s for a compound and 60 s for an isolation. Item cost = sets × set cost + 60 s transition. The warm-up costs 4 × 40 s + 20 s = 180 s. `available = budgetMin × 60 − (warmupInBudget ? 180 : 0)`. Σ item costs never exceeds `available`. When `warmupInBudget` is off, the warm-up is still generated but not counted. Every time cost in the engine uses this model: rule 7.2 selection, rule 7.4, rule 12 `timeCostS` and `fitsBudget`, rule 13's fit check and `applySwap`. Rule 8 reads the item `costS`.
- **R7-E1** back-squat × 4 = 720 s. leg-curl × 3 = 375 s. plank × 2 = 270 s.
- **R7-E13 (timed set at its planned duration, D-0092)** Given plank logged 3 × 115 s on 2026-09-24 (10:00) and `budgetMin 20`, warm-up off, `pinnedIds ["plank"]` (`available` 1200), Then plank is planned at 120 s (rule 14 `add_rep`, capped). bench-press × 4 (720 s) leaves 480 s, plank × 3 would cost 3 × 180 + 60 = 600 s, so the items are bench-press × 4 and plank × 2 at 120 s (420 s). The item total is 1140 s and `unusedS` is 60. At zero history the same input gives plank × 3 at 45 s (375 s), an item total of 1095 s.

### 7.2 Main lift and greedy selection
The projected load starts at the rule-3 load. `r(area) = projectedLoad / target`. An area is **eligible** if it is not recovering, not exhausted, has fewer than 2 items with it as a primary area, and the session has fewer than 8 items. **Candidates** for an area are the eligible exercises with weight 1.0 in that area that are not yet in the session and have no recovering primary area. Candidates are ranked by: (1) not in the most recent session with hard sets first; (2) gap fit `Σ_a w(a) × projectedDeficit(a)` descending, where recovering areas count 0; (3) id ascending.
1. **Main lift:** `sessionInput.mainLiftId`, if it is eligible. Otherwise take the lowest-`r` eligible area (ties by the fixed order) and its top compound candidate. If that area has no compound, try the next area. Try 4, then 3, then 2 sets. If no compound fits anywhere, `mainLiftId = null`.
2. **Pinned:** each of `pinnedIds`, in order, at 3 sets, falling back to 2. Skip it if it doesn't fit.
3. **Greedy:** repeat. Take the lowest-`r` eligible area and try its candidates in rank order at 3 sets, then 2. The first one that fits is added, and projected loads are updated with `sets × w(a)`. If none fits, the area is exhausted. Stop when no area is eligible.
- **Reps (pre-fill ranges, rule 14) by `profile.goal` (D-0061 §1, D-0095):** `get_stronger` main lift 3–5, other compounds 5–8, isolation 10–15; `build_muscle` main lift 6–8, other compounds 8–12, isolation 10–15; `general_fitness` main lift 8–12, other compounds 10–15, isolation 10–15. A profile without a goal gets `build_muscle`, and an unknown goal is a `RangeError`. The goal changes only these slots, and so rule 14's low/high, the rule 7.4 back-off reps (the goal's main low) and `applySwap`'s slot. Selection, sets and costs never depend on it.
- **R7-E2 (15 min, zero history)** Given `budgetMin 15`, Then the items are [bench-press × 4], with a total of 900 s. The bench-press, db-bench-press and push-up candidates tie at gap fit 2.0, so id ascending decides.
- **R7-E3 (recovering skipped)** Given 6 hard back-squat sets at `now − 24 h`, Then the main lift is bench-press, no item has quads or glutes at weight 1.0, and the reasons include `recovering_skipped` for quads and glutes.
- **R7-E4 (30 min, zero history)** Then the items are bench-press × 4 (main), inverted-row × 3 (gap fit 1.917 beats barbell-row at 1.417), then leg-extension × 2 (glutes is exhausted because back-squat and hip-thrust × 2 = 390 s > 345 s left). The item total is 1545 s, the total with warm-up is 1725 s, and `unusedS` is 75.
- **R7-E5 (time change keeps the main lift)** Given the R7-E4 inputs with `budgetMin 20`, Then the items are bench-press × 4 and straight-arm-pulldown × 2.
- **R7-E6 (no equipment)** Given equipment [] and `budgetMin 15`, Then the items are [push-up × 4 at 6 reps, 0 kg].
- **R7-E7 (candidate rank)** Given the most recent session contains inverted-row × 3, Then the back ranking is barbell-row, db-row, lat-pulldown, seated-cable-row, straight-arm-pulldown, inverted-row.
- **R7-E8 (never over)** For every `budgetMin` in 15..120 step 5, with warm-up on and off, over F-history and every simulated history, Then Σ item costs ≤ `available`, there are ≤ 8 items, and no area is the primary area of more than 2 items.
- **R7-E14 (slots by goal at zero history, D-0095)** For R7-E4 under `get_stronger`, the items, costs and totals are unchanged (bench-press × 4, inverted-row × 3, leg-extension × 2; 1545 s, `unusedS` 75), with reps 3–5, 5–8 and 10–15 and pre-fills null × 3, 0 × 5 and null × 10 (`first_time`). Under `general_fitness` the reps are 8–12, 10–15 and 10–15, with null × 8, 0 × 10 and null × 10.
- **R7-E15 (one history, three goals, D-0095 §3)** back-squat as the main lift, last on 09-24 at 100 × 8, 8, 8: `build_muscle` (6–8) gives 102.5 × 6 `increase` (R14-E1), `get_stronger` (3–5) gives 102.5 × 3 `increase`, and `general_fitness` (8–12) gives 100 × 9 `add_rep`.

### 7.3 Warm-up (D-0004)
There are 4 moves. The area list is the primary areas of the items in session order, deduplicated. Go round-robin over the list. For each area, pick the unused warm-up move with the highest weight for it (ties by id), and skip areas with none left. Stop at 4. Fill with general moves by id, then with any unused move by id.
- **R7-E9** For R7-E2, the moves are wu-scap-push-up, wu-arm-circle, wu-jumping-jack, wu-march-in-place.
- **R7-E10** For R7-E4, the moves are wu-scap-push-up, wu-band-pull-apart, wu-bodyweight-squat, wu-arm-circle.

### 7.4 Energy (UF-08.1, D-0024)
Energy is applied after selection. **Low:** each accessory with 3 sets goes to 2, and the freed time stays unused. The main lift and all weights are unchanged (reason `energy_low_trim`). **High:** if `unusedS ≥` the cost of one main-lift set, the main lift gets 1 back-off set (`backoff: true`) with the main reps. With `inc = incrementKg ?? 2.5`, its weight is null when the main weight is null, 0 when it is 0, and otherwise `min(main weight, max(inc, floorInc(0.9 × main weight)))` rounded to 3 decimals: one increment instead of 0 kg on a light loaded lift, never above the main weight (D-0131). Otherwise nothing changes (reason `energy_high_backoff`).
- **R7-E11** For R7-E4 with Low energy, the items are bench-press × 4, inverted-row × 2, leg-extension × 2, and the total with warm-up is 1560 s.
- **R7-E12** For R7-E4 with High energy, there is no back-off (75 s < 165 s). With `budgetMin 15` and warm-up off, the items are bench-press × 4 + 1 back-off, 885 s.
- **R7-E16 (light-lift back-off, D-0131)** Given bench-press as the main lift, logged 2.5 × 6, 6, 6 on 09-24, with `budgetMin 15`, warm-up off and High energy, Then bench-press × 4 at 2.5 × 7 (`add_rep`) + back-off 2.5 × 6 (`floorInc(2.25)` is 0, raised to one increment), 885 s. Logged at 2 kg: 2 × 7, back-off 2 × 6 (never above the main weight).

## 8. Running over time (UF-09.8, D-0024)
`timeCheck(workout, {elapsedS, nextItemIndex})` runs only between exercises. `elapsedS` excludes paused time, and excludes the warm-up when `warmupInBudget` is off. `remainingS` = Σ the costs of the not-started items. `behindS = elapsedS + remainingS − budgetMin × 60`. UF-09.8 is shown only when `behindS ≥ 60`, with `minutesBehind = ceil(behindS / 60)`. It offers three options:
- **Continue:** the plan is unchanged.
- **Trim:** (1) take the not-started accessory with more than 2 sets and the lowest session-start deficit of its first primary area (ties: the later item first), and remove 1 set. Repeat until `behindS ≤ 0`. (2) If still over, remove whole not-started accessories in the same order. The main lift is never cut.
- **Skip next:** remove the next item.

Fixture: budget 45 min, warm-up on. The plan is bench-press × 4 (main, chest 0.8), barbell-row × 3 (back 0.6), leg-curl × 3 (hamstrings 0.9), lateral-raise × 3 (shoulders 0.5). `nextItemIndex = 1`.
- **R8-E1** Given `elapsedS 1500`, Then `behindS 105`, the time check is shown with 2 minutes behind, and Trim gives lateral-raise × 2 (projected 2700).
- **R8-E2** Given `elapsedS 1800`, Then `behindS 405`. Trim removes sets from lateral-raise, then barbell-row, then leg-curl (each 3 → 2, over 30 s), and then removes lateral-raise. The result is barbell-row × 2 and leg-curl × 2 (projected 2460). Skip next removes barbell-row (projected 2550).
- **R8-E3** Given `elapsedS 1454` (`behindS 59`), Then the time check is not shown.

## 9. Adaptive targets (UF-11, D-0018, D-0027)
`evaluateCheckin(sessions, profile, checkins, now, tz)`:
- **Period k** covers local days [onboarded + 14k, onboarded + 14k + 13]. It has ended when its last day < D.
- **Completed session:** a session with ≥ 1 hard set (not warm-up, not tombstoned), dated by the local date of `started_at`. A **planned session** has no row: the plan is `2·rhythmMin – 2·rhythmMax` sessions per period. Suggested but unstarted workouts count for nothing.
- **Under:** completed < 0.7 × 2·rhythmMin. **Over:** completed > 1.1 × 2·rhythmMax. Anything else is on plan.
- **Reset:** `resetDate = max(local date of the last checkins.answered_at, local date of `profiles.plan_changed_at` (engine field `planUpdatedAt`, D-0035, D-0041))`. A period is eligible if its end ≥ `resetDate`.
- **Proposal:** Look at the last ended period, if it is eligible. If it is under, propose (min − 1, max − 1). If it is over, propose (min + 1, max + 1). Clamp to 1–7, keeping min ≤ max. If the result equals the current rhythm, there is no proposal. With no eligible ended period, there is no proposal (D-0061 §2, D-0094).
- **Output:** `{periods[{index, start, end, completed, status}], proposal: {direction, rhythmMin, rhythmMax, previewTargets} | null, nextCheckinDate}`. `periods` holds at most one entry: the last ended period if it is eligible, otherwise none (D-0094). `previewTargets` is rule 4 with the proposed rhythm. `nextCheckinDate` is the day after the current period ends. The engine never changes targets. Only an Accept (UI → API) does.
- **R9-E1…E11** are UF-11 spec AC1, AC2, AC3, AC4, AC5, AC7 (engine part), AC8, AC11, AC12, AC13 and AC14, with that spec's fixtures, re-derived for one period (D-0094). AC6 and AC16 are covered by statelessness and R0-E1.
- **R9-E12 (mid-period reset)** Given a Keep on 2026-09-30 and P3 = 3, P4 = 3, Then on 2026-10-11 the result lists P4 alone and proposes 2–3 (P4 ends 10-10 ≥ 09-30, so it is eligible; on 2026-09-30 itself P3 ends 09-26 < 09-30, so there is no proposal; D-0094).
- **R9-E13 (edit plan resets)** Given P2 = 4 and P3 = 3 and `plan_changed_at` 2026-09-20, Then on 2026-09-27 the result lists P3 alone and proposes 2–3 (P3 ends 09-26 ≥ 09-20, so it is eligible; an edit on 09-27 would leave no eligible period and no proposal; D-0094).

## 10. Explanation
Every item carries machine-readable reasons, and the UI or an optional LLM only turns them into words. The codes are: `main_lift`, `area_deficit {area, deficit}`, `days_since {area, days | null}`, `recovering_skipped {area}`, `energy_low_trim`, `energy_high_backoff`, `swap {reason}`, `prefill {kind: first_time|carry|reentry|hold_after_break|increase|deload|hold|add_rep}`. `sessionReasons` (≤ 3) starts with at most 2 `recovering_skipped {area}` entries for the recovering areas in the fixed order, then is filled with `area_deficit` entries for the items' distinct first primary areas, in session order, up to 3 in total (D-0040).
- **R10-E1** For R7-E4, bench-press has `main_lift` and `area_deficit {chest, 1}`, and `sessionReasons` covers chest, back and quads.

## 11. Balance output (UF-10, D-0013, D-0027)
`balance()` returns `{windowStart, windowEnd, computedAt (= now), areas[9]}`. Each area has `area, load, target, targetSource, targetUpdatedAt, deficit, coverageStep, needsAttention, recovering, lastTrainedDate | null, days[14], contributors[{exerciseId, weightedSets, lastDate}]`.
- `coverageStep`: 0 if load = 0. Otherwise, with `r = load/target`: 1 if r < 0.33, 2 if r < 0.66, 3 if r < 1, and 4 if r ≥ 1.
- `days[0]` = D−13 … `days[13]` = D: the weighted hard sets for the area on that local day.
- `contributors`: the exercises with more than 0 weighted sets for the area in the window, sorted by weightedSets desc, then name, then id.
- `areas` are sorted: needsAttention first, then deficit desc, then the fixed order.
- **R11-E1** Given quads loads 0, 6, 7, 14, 20 and 24 with a target of 20, Then the steps are 0, 1, 2, 3, 4 and 4 (UF-10 AC4).
- **R11-E2** Given 4 romanian-deadlift sets on 09-20 and 4 back-squat sets on 09-25, Then hamstrings has load 6, the contributors are [romanian-deadlift 4 (09-20), back-squat 2 (09-25)], days[6] = 4 and days[11] = 2 (UF-10 AC9).
- **R11-E3** R5-E1 at `now` 2026-10-01: hamstrings has load 0, all 14 days are 0, and lastTrainedDate is 09-17 (UF-10 AC7).
- **R11-E4** Offline: the history includes 3 queued romanian-deadlift sets, so hamstrings +3 and glutes +1.5 (UF-10 AC8).

## 12. Swap ranking (UF-08.3, UF-05.1, D-0025)
`rankSwaps(current, reason | null, session, profile, library, history, now, tz)`. **Candidates** are the eligible exercises, not in the session, that share a weight-1.0 area with `current`. The main slot takes compounds only. `muscleMatch = Σ min(w_cur, w_alt) / Σ w_cur`. The alternative keeps the slot's set count. Each result has `{exerciseId, muscleMatch, timeCostS, equipment, fitsBudget, bestMatch}`. Sort keys:
- none: muscleMatch desc, same type first, not in the last session first, id.
- `equipment_taken`: drop candidates that share an equipment item with `current` (if that drops all of them, keep all and sort by fewest shared), then muscleMatch desc, id.
- `discomfort`: no shared equipment first, guided (machine or cable) first, muscleMatch desc, id.
- `variety`: never done first, last done date asc, muscleMatch desc, id.
- `short_on_time`: timeCostS asc, muscleMatch desc, id.

Fixture: the session is bench-press × 4 (main), barbell-row × 3, leg-extension × 2. The current exercise is barbell-row.
- **R12-E1 (none)** db-row, inverted-row, lat-pulldown, seated-cable-row (muscleMatch 1.0), then straight-arm-pulldown (0.667). pull-up is excluded by level (D-0056).
- **R12-E2 (short_on_time)** straight-arm-pulldown (375 s), db-row, inverted-row, lat-pulldown, seated-cable-row. All have `fitsBudget` true.
- **R12-E3 (variety)** Given lat-pulldown last done 09-20 and db-row 09-10, Then inverted-row, seated-cable-row, straight-arm-pulldown, db-row, lat-pulldown.
- **R12-E4 (discomfort)** lat-pulldown, seated-cable-row, straight-arm-pulldown, db-row, inverted-row.
- **R12-E5 (equipment_taken, main slot)** For current bench-press, [push-up] (db-bench-press shares the bench; muscleMatch 0.75).

### 12.1 applySwap (UF-05.1, UF-08.3, D-0071 §7, D-0093)
`applySwap(workout, current, candidate, reason | null, history, profile, library, now, tz)` returns a new `Workout` with the item `current` replaced by `candidate`, built the way `suggest` builds an item. Let `old` be that item and `new` the candidate.
- **Item:** same position, `sets` and `isMain` as `old`. The reps are rule 7.2's slot for `new` at `isMain` (null for a timed `new`). `prefill` is rule 14 for `new` with `previous = {old.exerciseId, old.prefill.weightKg}`, so step 1 may `carry`. A timed `new` has `durationS = prefill.durationS`, its planned duration (rule 7.1, D-0092, D-0096 §1); otherwise null. If `old.backoff` is set and `new` is not timed, the back-off is recomputed as the rule 7.4 back-off for `new`: its pre-fill weight and `new`'s inc in the same formula, at `repsMin` (null weight stays null, D-0131); otherwise it is null. `costS = itemCostS(new, sets)` at the planned duration, plus one set cost with a back-off, so without a back-off it equals the candidate's rule 12 `timeCostS`.
- **Reasons** are rebuilt in the rule 10 order for `new`'s first primary area `A` (fixed order): `main_lift` (if `isMain`), `area_deficit {A, plan.startDeficits[A]}`, `days_since {A, D − lastTrainedDate(A)}` over `history` at `now` (rule 5, so sets logged today count; null if never), `swap {reason}`, `energy_low_trim` (if `old` had it), `energy_high_backoff` (if the new back-off is set), `prefill {kind}`. A second swap of a slot carries one `swap` reason, the newest, and its `previous` is the exercise it replaces.
- **Workout:** `plan.mainLiftId = new` when `isMain`. `itemsTotalS = Σ costS`, `totalS = itemsTotalS + 180`, `unusedS = max(0, available − itemsTotalS)`. A `fitsBudget: false` candidate may be applied, so `itemsTotalS` may exceed `available`. `plan.version`, `plan.warmup` (not regenerated), `plan.startDeficits`, `budgetMin`, `warmupInBudget`, `energy`, `sessionReasons` and every other item are unchanged. Inputs are never mutated.
- **Validation (structural only):** `RangeError` when `current` is not an item of the plan; `candidate` is not in `library` or is a warm-up move; `candidate` equals `current` or is already another item; the slot is the main slot and `candidate` is not a compound; `candidate` shares no weight-1.0 area with `current`; `reason` is not a swap reason or null; `now` has no offset. Rule 12's equipment, level, recovery and budget filters are not repeated: the UI offers only `rankSwaps` candidates.
- **fitsBudget (D-0105):** rule 12's `fitsBudget` for a candidate `c` replacing slot `s` is `itemsTotalS − s.costS + c.timeCostS + extra ≤ available`, with `extra = setCostS(c)` at `c`'s planned duration when `s.backoff` is set and `c` is not timed, and 0 otherwise. This is the condition under which the item above gets a back-off (one shared predicate), so `fitsBudget` equals `applySwap(…).itemsTotalS ≤ available` for every candidate, including on a plan already over budget. `timeCostS` is unchanged (`itemCostS(c, s.sets)`, no back-off set); without a back-off this is the rule 12 value.

Fixture W is R7-E4 (bench-press × 4 main 720 s, inverted-row × 3 555 s, leg-extension × 2 270 s; 1545 s, `unusedS` 75).
- **R12-E6 (accessory, zero history, D-0093)** W, inverted-row → barbell-row, `variety`: barbell-row × 3, 8–12, 555 s, pre-fill null × 8 `first_time` (inverted-row's weight 0 does not carry), reasons `area_deficit {back, 1}`, `days_since {back, null}`, `swap {variety}`, `prefill {first_time}`. Totals unchanged: 1545 s, 1725 s, `unusedS` 75.
- **R12-E7 (carry, D-0093)** With lat-pulldown at pre-fill 50 kg, lat-pulldown → seated-cable-row: 50 × 8 `carry` (shares back and cable, R14-E7). barbell-row at 60 kg → db-row: null × 8 `first_time` (no shared equipment).
- **R12-E8 (main slot, D-0093)** W, bench-press → push-up, `equipment_taken`: push-up × 4, `isMain`, 6–8, 720 s, 0 × 6 `first_time`, reasons start with `main_lift`. `mainLiftId` is push-up; the warm-up is unchanged.
- **R12-E9 (timed, D-0093, D-0092, D-0096 §1)** bench-press × 4 (main) and dead-bug × 2 at `budgetMin 20`, warm-up off (990 s). Given plank 3 × 115 s on 09-24, dead-bug → plank, `short_on_time`: plank × 2 at 120 s (`add_rep`), 2 × (120 + 60) + 60 = 420 s, `days_since {core, 3}`; 1140 s, 1320 s, `unusedS` 60, equal to plank's `timeCostS`. With no history: 45 s, 270 s, `first_time`.
- **R12-E10 (back-off, D-0093)** R14-E9 (bench-press 80 × 7, back-off 70 × 6, 885 s), bench-press → db-bench-press: 80 × 6 `carry`, back-off `floorInc(72, 2)` = 72 × 6, 720 + 165 = 885 s, reasons `main_lift`, `area_deficit {chest, 0.85}`, `days_since {chest, 3}`, `swap {null}`, `energy_high_backoff`, `prefill {carry}`; `unusedS` 15.
- **R12-E11 (over budget, D-0093)** W, leg-extension → back-squat: back-squat × 2, 8–12, 390 s, reasons for glutes (before quads): `area_deficit {glutes, 1}`, `days_since {glutes, null}`. 1665 s > 1620 s, so `totalS` 1845 and `unusedS` 0; rule 12 marks it `fitsBudget: false`, and it is applied anyway.
- **R12-E12 (fitsBudget on an over-budget back-off slot, D-0105)** R14-E9 at `budgetMin 14`, warm-up off (available 840 < 885 s), current bench-press: db-bench-press and push-up each have `timeCostS` 4 × 165 + 60 = 720 and `fitsBudget: false`, because 885 − 885 + 720 + 165 = 885 > 840; `applySwap` to db-bench-press gives 885 s. At `budgetMin 15` (available 900) both have `fitsBudget: true` (885 ≤ 900).

## 13. Shuffle (UF-08.2, D-0025)
`sessionInput.shuffle = n`. Every accessory slot not in `pinnedIds`, in session order, takes entry `n mod len` of `[original, …variety ranking]`, skipping exercises already taken by an earlier slot. If the pick doesn't fit `available` at the slot's set count, the slot keeps the original. The main lift is never shuffled. There is no randomness.
- **R13-E1** For R7-E4 with n = 1, the items are bench-press, barbell-row × 3, leg-extension × 2 (back-squat × 2 would make 1665 s > 1620 s).
- **R13-E2** With n = 2: bench-press, db-row, leg-extension. With n = 6: the R7-E4 list exactly.

## 14. Progression and pre-fill (UF-09.3, UF-09.4, D-0026)
**Last performance** is the hard sets of this exercise in the most recent session that contains it. `W` is their highest weight. `minReps` and "all at W" use the sets at `W`. `gap` = D − that session's local date. Ranges come from rule 7.2 (low/high). The first match wins:
1. No history: if this is a swap or shuffle and the slot's previous exercise shares a weight-1.0 area and an equipment item, carry its pre-fill weight (`carry`). Otherwise the weight is null, or 0 for bodyweight (`first_time`). Low reps.
2. `gap ≥ 21`: `max(inc, floorInc(0.9 W))` (0 when `W = 0`), low reps (`reentry`).
3. `gap ≥ 10`: `W`, low reps (`hold_after_break`).
4. Every set at W has reps ≥ high: `W + inc`, low reps (`increase`) (bodyweight: 0 at high reps, `increase`).
5. The last two sessions both at W with `minReps < low`: `max(inc, floorInc(0.9 W))` (0 when `W = 0`), low reps (`deload`).
6. The last session alone with `minReps < low`: `W`, low reps (`hold`).
7. Otherwise: `W`, `min(high, minReps + 1)` (`add_rep`).

For timed sets, the first time uses `default_duration_s`. After that the duration is `min(last) + 5 s` (≤ 120). When `gap ≥ 10` it stays at `min(last)`, and when `gap ≥ 21` it is `max(15, floor5(0.9 × min))`. `floorInc(x) = floor(round3(x) / inc) × inc`.

**Edge cases (D-0057, D-0062, D-0132):**
- **Bodyweight (D-0057 §2):** for `externalLoad: false`, `W` is 0 and the weight stays 0 in every branch. Every set with non-null reps counts as "at W", whatever weight was logged (D-0057 §2). Step 4 gives 0 at high reps (`increase`). `floorInc` is never applied.
- **Usable sets (D-0057 §3, D-0062 §2, §3):** `W` is the highest non-null weight among the session's hard sets, including sets whose reps are null. Sets whose reps are null are ignored for `minReps` and "all at W". If the most recent session containing the exercise has no usable set (no non-null weight on a loaded lift, no non-null reps at `W`, or no non-null `durationS` when timed), step 1 applies. The engine never falls back to an older session. Step 5's second session must be usable too, or step 5 does not match.
- **Drop floor (D-0057 §4, D-0062 §4):** `inc = incrementKg ?? 2.5`. Steps 2 and 5 never give less than one increment when `W > 0`. A loaded lift logged at 0 kg has `W = 0`, a recorded weight: steps 2, 3, 5, 6 and 7 give 0, and step 4 gives `0 + inc`.
- **Carry (D-0062 §1):** step 1 carries only when the previous weight is > 0, the exercise is non-timed with `externalLoad: true`, and the previous exercise is a library row of kind `exercise` sharing a weight-1.0 area and an equipment item (`[]` ≡ `["none"]`, D-0040 §1). The carried weight is rounded to 3 decimals. Otherwise step 1 is `first_time`.
- **Timed (D-0057 §6, D-0062 §5):** `min(last)` is the minimum non-null `durationS` over that session's hard sets. Weight and reps are null. Every non-first-time result is clamped to [15, 120] s: `gap ≥ 21` → `clamp(max(15, floor5(0.9 × min)))` (`reentry`); `gap` 10–20 → `clamp(min)` (`hold_after_break`); otherwise `clamp(min + 5)`, which is `add_rep` when greater than `min` and `hold` when not. `floor5(x) = floor(round3(x) / 5) × 5`. The first time is `defaultDurationS`, unclamped.

- **R14-E1** back-squat as the main lift, last on 09-24 at 100 × 8, 8, 8: 102.5 × 6 (`increase`).
- **R14-E2** 100 × 8, 7, 6 on 09-24: 100 × 7 (`add_rep`).
- **R14-E3 (returning after 10 days off)** 100 × 8, 8, 8 on 09-15: 100 × 6 (`hold_after_break`).
- **R14-E4** 102.5 × 8, 8, 8 on 09-01: 90 × 6 (`reentry`).
- **R14-E5** 100 × 5, 5, 4 on 09-20 and 100 × 5, 4, 4 on 09-24: 90 × 6 (`deload`). The 09-24 session alone: 100 × 6 (`hold`).
- **R14-E6** leg-curl with no history: null × 10. push-up as an accessory: 0 × 8.
- **R14-E7 (carry)** lat-pulldown pre-fill 50 → seated-cable-row with no history: 50 (shares back and cable). barbell-row 60 → db-row: null (no shared equipment).
- **R14-E8** plank, last 45, 45, 40 s on 09-24: 45 s.
- **R14-E9** High-energy back-off on a bench-press pre-fill of 80 × 6: 70 × 6.

## Required tests
- Every `Rn-Em` above is a unit test. R7-E8 is a property test.
- Simulated 14-day histories (T-0202), each run through `suggest`, `balance` and `evaluateCheckin`: balanced; all-chest-no-legs (legs and back get attention, and the main lift is a compound for the first zero-load area (inverted-row), D-0040); returning after 10 days off (R5-E1, R14-E3); 15-minute budget (R7-E2); 90-minute budget (R7-E8 caps). Plus offline-merged history (R0-E2, R11-E4).

## Traceability
| Rules / examples | Build ticket |
|---|---|
| 0–6, 11 (R0–R6, R11) | T-0200 |
| 7, 8, 10, 12, 13, 14 | T-0201 (a split is proposed by T-0101) |
| 9 + simulated suite | T-0202 |
| 7.1 timed planned duration (R7-E13, D-0092) | T-0219 |
| 9 one-period check-in (R9-E1…E13 re-derived, D-0061 §2, D-0094) | T-0215 |
| 12.1 applySwap (R12-E6…E11, D-0071 §7, D-0093, D-0096 §1) | T-0224 |
| 7.2 rep slots by goal (F-goal, R7-E14, R7-E15, D-0061 §1, D-0095) | T-0214 |
| 12.1 fitsBudget counts the back-off set (R12-E12, D-0105) | T-0226 |
| 7.4 / 12.1 light-lift back-off floor (R7-E16, D-0131) | T-0220 |
| 14 text: D-0057 §2/§4/§6, D-0062 §1/§2/§4/§5 (D-0132) | T-0221 |
| 12 rankSwaps signature order `now, tz` (D-0130) | T-0212 |
