---
id: T-0201
title: "Engine: session building — eligibility, time budget, main lift + greedy, warm-up, reasons (rules 0-eligible, 7, 10) and energy + time check (rules 7.4, 8); split into T-0201a / T-0201b"
lane: engine
screens: [UF-08.1, UF-08.4, UF-09.8, UF-01.5]
decisions: [D-0004, D-0024, D-0027, D-0033, D-0034, D-0036, D-0037, D-0040]
deps: [T-0200]
status: done
---
## Why
`suggest()` is the core of the product. It is the time-boxed workout on UF-08.1 and UF-08.4, and the first plan a user sees after onboarding (UF-01, under 60 s). `timeCheck()` is UF-09.8, the "time running out" decision point during a workout. `docs/engine-rules.md` v1 rules 7, 8 and 10 (D-0024, D-0004) make both testable with fixed inputs. D-0034 §7 moved the eligible-exercise rule and R0-E1 on `suggest` here. D-0037 §6–§8 fix the output shapes, and D-0040 settles the build gaps. Principles: time budget as an input (Σ cost never exceeds `available`), a deterministic engine (pure, no clock, no randomness), and one task on screen (UF-09.8 offers exactly three options).

## Split (D-0040 §12)
This ticket is about 2 days of agent work. The board keeps `T-0201` as the parent row (`split → T-0201a, T-0201b`). It is `done` only when both children are done.
- **T-0201a** (deps T-0200, about 1 day): AC1–AC24. It unblocks T-0203 and T-0301.
- **T-0201b** (deps T-0201a, about half a day): AC25–AC36.
Both children use this file. Each child's branch implements only its own ACs.

## Scope
- In (a): `packages/engine/src`: `LibraryExercise` gains `timed`, `defaultDurationS`, `incrementKg`, `externalLoad` (D-0040 §3), plus the types `EngineProfile`, `SessionInput`, `Workout`, `SessionPlan`, `WorkoutItem`, `PrefillResult` and `Reason` (D-0037 §6–§7 names). Also: `isEligible` (rule 0), the time model (7.1), main lift, pinned and greedy (7.2), the warm-up generator (7.3), reasons (rule 10), the first-time pre-fill seam (D-0040 §4) and `suggest()`. Fixture helpers in `test/fixtures/common.ts` gain the D-0040 §3 fields, and T-0200's tests stay green. Two sentence changes in `docs/engine-rules.md` (D-0040 §6, §11).
- In (b): energy Low/High (7.4), `floorInc`, `timeCheck()` (rule 8) and `TimeCheckResult` (D-0037 §8).
- Edge cases in scope: zero history (R7-E2, R7-E4); returning after 10 days off (AC18); offline-merged history with queued rows, replays and tombstones (AC19); time running out (rule 8, AC31–AC35, plus the after-last-item case); a budget too small for anything (AC13); no equipment (R7-E6); recovering areas (R7-E3); a stale or small warm-up library (AC16); `"none"` equipment and the `pullup-bar` spelling (AC1).
- Out: shuffle and swaps (rules 12–13, T-0204; `shuffle` is ignored, D-0040 §8); rule 14 pre-fill beyond `first_time` (T-0205); adaptive targets (T-0202); the Edge Function (T-0203); UI (T-03xx); switching to `@workoutlab/shared` types (follow-up after T-0102a).

## Acceptance criteria
Fixtures unless stated: F-tz, F-targets, F-profile (beginner, `equipment` = full), F-input (`budgetMin 30, warmupInBudget true, energy normal, shuffle 0, mainLiftId null, pinnedIds [], excludeIds []`), zero history, and `LIBRARY` (L1 + the `wu-*` moves) from `packages/engine/test/fixtures/common.ts` with the D-0040 §3 fields. "X × n" means an item with `sets = n`. The simulated histories are the T-0200 exports in `test/fixtures/histories.ts`. Every AC is at least one Vitest test in `packages/engine/test/**`, and a test that implements an `Rn-Em` example starts its title with that id.

### T-0201a

**Eligibility (rule 0, D-0034 §7, D-0033, D-0040 §1)**
- AC1 Given F-profile, When `isEligible` runs over `LIBRARY`, Then `pull-up` and every `kind: warmup` row are false, and `hanging-knee-raise` is true. With level `intermediate`, `pull-up` is true. With equipment `[]`, exactly `dead-bug`, `plank` and `push-up` are true, and equipment `["none"]` gives the same set. An exercise with equipment `["none"]` is eligible for a profile with `[]`. A test exercise with `["pull-up-bar"]` is false for the full profile. With `excludeIds ["bench-press"]`, `bench-press` is false.
- AC2 Given F-input with `budgetMin 15` and `excludeIds ["bench-press"]`, When `suggest` runs, Then the items are [db-bench-press × 4].

**Time model (7.1)**
- AC3 (R7-E1) `itemCostS`: back-squat × 4 = 720, leg-curl × 3 = 375, plank × 2 = 270 (the timed work is 45 s). `availableS`: budget 30 with the warm-up on gives 1620, and off gives 1800.

**Main lift and greedy (7.2)**
- AC4 (R7-E2) Given `budgetMin 15`, Then the items are [bench-press × 4], `mainLiftId` is `bench-press`, and `itemsTotalS` is 720 (900 with the warm-up).
- AC5 (R7-E3) Given 6 back-squat sets at `now − 24 h`, Then the first item is bench-press (`isMain`), no item has quads or glutes at weight 1.0, and `sessionReasons` = `[recovering_skipped glutes, recovering_skipped quads, area_deficit {chest, 1}]` (D-0040 §6).
- AC6 (R7-E4) Given F-input, Then the items are bench-press × 4 (main), inverted-row × 3 and leg-extension × 2. `itemsTotalS` is 1545, `totalS` 1725 and `unusedS` 75.
- AC7 (R7-E5) Given F-input with `budgetMin 20` and `mainLiftId "bench-press"`, Then the items are bench-press × 4 and straight-arm-pulldown × 2.
- AC8 (R7-E6) Given equipment `[]` and `budgetMin 15`, Then the items are [push-up × 4], with `repsMin` 6 and pre-fill `weightKg` 0, `reps` 6, kind `first_time`.
- AC9 (R7-E7) Given one session with 3 inverted-row sets on 2026-09-25, When `rankCandidates("back", …)` runs, Then the order is barbell-row, db-row, lat-pulldown, seated-cable-row, straight-arm-pulldown, inverted-row.
- AC10 (mainLiftId fallback, D-0040 §8) Given the AC5 history and `mainLiftId "back-squat"`, Then the main lift is bench-press. Given F-input with `mainLiftId "no-such-id"`, or with `"leg-extension"` (an isolation), Then the result deep-equals AC6.
- AC11 (pinned) Given F-input with `pinnedIds ["biceps-curl"]`, Then the items are bench-press × 4, biceps-curl × 3 and inverted-row × 2, with `itemsTotalS` 1485 and `unusedS` 135. With `pinnedIds ["bench-press", "pull-up"]` (a duplicate and an ineligible exercise), Then the result deep-equals AC6.
- AC12 (all-chest history, D-0040 §11) Given `allChestNoLegsHistory` and F-input, Then the items are inverted-row × 4 (main), back-squat × 3 and calf-raise × 2, with `itemsTotalS` 1545, `totalS` 1725 and `unusedS` 75. `sessionReasons` = `[recovering_skipped chest, area_deficit {back, 1}, area_deficit {glutes, 1}]`, and no item has chest at weight 1.0.
- AC13 (budget too small, D-0040 §7) Given `budgetMin 5` with the warm-up on, Then `items` is `[]`, `mainLiftId` is null, `itemsTotalS` 0, `totalS` 180 and `unusedS` 120. The warm-up is wu-jumping-jack, wu-march-in-place, wu-arm-circle, wu-band-pull-apart. Given `budgetMin 2`, Then `unusedS` is 0. Given `budgetMin` 0, 481 or 30.5, Then `suggest` throws `RangeError`.
- AC14 (R7-E8, property) For every `budgetMin` in 15..120 step 5, with the warm-up on and off, over `[]` and each of the 4 simulated histories, plus 200 histories and budgets 1–480 from the seeded mulberry32 generator (D-0036 §5; a failure prints its seed), Then: Σ `costS` ≤ `max(0, available)`; there are ≤ 8 items; no area is the primary area of more than 2 items; no `exerciseId` repeats; every item is eligible and has no recovering area at weight 1.0; `itemsTotalS` = Σ `costS`; `totalS` = `itemsTotalS` + 180; `unusedS` = `max(0, available − itemsTotalS)`; the warm-up has `min(4, #warmup rows)` distinct moves; and a second run is deep-equal.

**Warm-up (7.3, D-0004, D-0040 §2)**
- AC15 (R7-E9, R7-E10) For AC4, the warm-up is wu-scap-push-up, wu-arm-circle, wu-jumping-jack, wu-march-in-place. For AC6, it is wu-scap-push-up, wu-band-pull-apart, wu-bodyweight-squat, wu-arm-circle. For AC12, it is wu-band-pull-apart, wu-bodyweight-squat, wu-cat-cow, wu-leg-swing. Every entry has `durationS` 40.
- AC16 (the real library) Given L1 plus the 4 `kind: warmup` rows read from `data/exercises/library/*.json` (read-only, mapped to `LibraryExercise`) instead of the `wu-*` moves, When AC6 runs, Then the items are unchanged and the warm-up is cat-cow, hip-circles, arm-circles, jumping-jacks. Given only `jumping-jacks` and `arm-circles`, Then the warm-up is [arm-circles, jumping-jacks] and `totalS` is still `itemsTotalS + 180`.

**Reasons (rule 10, D-0040 §6)**
- AC17 (R10-E1) For AC6, the bench-press reasons are exactly `[main_lift, area_deficit {chest, 1}, days_since {chest, null}, prefill {first_time}]`. Inverted-row has `[area_deficit {back, 1}, days_since {back, null}, prefill {first_time}]`. `sessionReasons` = `[area_deficit chest 1, area_deficit back 1, area_deficit quads 1]`.

**Edge histories**
- AC18 (returning after 10 days off) Given `returningAfter10DaysHistory` and F-input, Then the main lift is bench-press × 4, with reasons that include `area_deficit {chest, 1}` and `days_since {chest, 15}`.
- AC19 (offline-merged) Given `offlineMergedHistory`, When `suggest` runs, Then it deep-equals `suggest` on `normalizeHistory(offlineMergedHistory)` with `pending` removed from every row. Appending a second copy of every queued row (a replay) gives a deep-equal result.

**Determinism and shape**
- AC20 (R0-E1 on `suggest`) For `[]` and each simulated history at F-input: two runs are deep-equal; deep-frozen inputs don't throw and give the same result; and reversing `history` or reversing `library` gives a deep-equal result.
- AC21 (Workout shape, D-0037 §7) For AC6, the result has exactly the keys `plan, budgetMin, warmupInBudget, energy, itemsTotalS, totalS, unusedS, sessionReasons`. `plan` has exactly `version (1), mainLiftId, warmup, items, startDeficits`, and `startDeficits` has 9 keys equal to `balance()` deficits for the same inputs. Each item has exactly `exerciseId, isMain, sets, repsMin, repsMax, durationS, costS, backoff (null), prefill, reasons`. Reps are bench-press 6–8, inverted-row 8–12 and leg-extension 10–15. Bench-press has pre-fill `weightKg` null and `reps` 6. Given F-input with `pinnedIds ["plank"]`, the plank item (× 3, `costS` 375) has `repsMin`/`repsMax` null, `durationS` 45 and pre-fill `durationS` 45.
- AC22 (purity) `pnpm --filter @workoutlab/engine lint` passes on the finished `src/`. The T-0200 purity-lint and housekeeping tests stay green.
- AC23 (public API) `import { suggest, isEligible, rankCandidates, itemCostS, availableS, generateWarmup, WARMUP_COST_S } from "@workoutlab/engine"` typechecks, and `WARMUP_COST_S === 180`.
- AC24 (contract text and traceability) `docs/engine-rules.md` rule 10 carries the D-0040 §6 `sessionReasons` sentence, and the Required-tests all-chest bullet reads as D-0040 §11. Both cite D-0040, and no other rule text changes. The test titles contain R0-E1, R7-E1…R7-E10 and R10-E1.

### T-0201b

**Energy (7.4)**
- AC25 (R7-E11) Given F-input with `energy low`, Then the items are bench-press × 4, inverted-row × 2 and leg-extension × 2. `itemsTotalS` is 1380, `totalS` 1560 and `unusedS` 240. Inverted-row has `energy_low_trim`, and bench-press has neither energy reason and is unchanged.
- AC26 (R7-E12) Given F-input with `energy high`, Then the plan deep-equals AC6's (75 < 165: no back-off, no `energy_high_backoff`). Given `budgetMin 15`, the warm-up off and `energy high`, Then bench-press × 4 has `backoff {weightKg: null, reps: 6}`, `costS` 885 and the reason `energy_high_backoff`, `sets` stays 4, `itemsTotalS` is 885 and `unusedS` is 15.
- AC27 (`floorInc`) `floorInc(0.9 × 80, 2.5)` = 70, `floorInc(0.9 × 102.5, 2.5)` = 90 and `floorInc(0.9 × 100, 2.5)` = 90 (round3 before the floor).
- AC28 (energy properties) The AC14 sweep with `energy` low and high keeps every AC14 invariant. Low never changes the main item and never adds items. High adds at most one back-off, only on the main item.

**Time check (rule 8, UF-09.8)**. Fixture: `budgetMin 45`, warm-up on, plan bench-press × 4 (main, 720), barbell-row × 3 (555), leg-curl × 3 (375), lateral-raise × 3 (375), and `startDeficits` chest 0.8, back 0.6, hamstrings 0.9, shoulders 0.5, others 1.
- AC29 (R8-E1) Given `{elapsedS 1500, nextItemIndex 1}`, Then `behindS` 105, `show` true, `minutesBehind` 2 and `projectedS` 2805. `trim.items` are bench-press × 4, barbell-row × 3, leg-curl × 3 and lateral-raise × 2 (`costS` 270), with `trim.projectedS` 2700.
- AC30 (R8-E2) Given `elapsedS 1800`, Then `behindS` 405. `trim.items` are bench-press × 4, barbell-row × 2 and leg-curl × 2, with `trim.projectedS` 2460. `skipNext.items` drop barbell-row, with `skipNext.projectedS` 2550.
- AC31 (R8-E3, boundary) Given `elapsedS 1454`, Then `behindS` 59, `show` false and `minutesBehind` null. Given 1455, Then `show` true and `minutesBehind` 1.
- AC32 (tie: the later item first) Given `startDeficits` back 0.5, hamstrings 0.5, shoulders 0.9 and `elapsedS 1500`, Then `trim.items` are bench-press × 4, barbell-row × 3, leg-curl × 2 and lateral-raise × 3, with `projectedS` 2700.
- AC33 (the main lift is never cut) Given `{elapsedS 2000, nextItemIndex 0}`, Then `behindS` 1325, `trim.items` = [bench-press × 4] and `trim.projectedS` 2720. `skipNext.items` are the three accessories, with `projectedS` 3305.
- AC34 (after the last item, D-0040 §10) Given `{elapsedS 3000, nextItemIndex 4}`, Then `behindS` 300, `show` false, `minutesBehind` null, and `trim.items` and `skipNext.items` deep-equal the plan.
- AC35 (validation and purity) Given `elapsedS` −1 or 12.5, or `nextItemIndex` −1 or 5, Then `timeCheck` throws `RangeError`. With a deep-frozen workout and progress, two runs are deep-equal and the input is unchanged. The result has exactly the keys `behindS, show, minutesBehind, projectedS, trim {items, projectedS}, skipNext {items, projectedS}`, and `behindS` is an integer.
- AC36 (traceability) `timeCheck` and `floorInc` are exported from `@workoutlab/engine`. The test titles contain R7-E11, R7-E12 and R8-E1…R8-E3.

## Paths you may change
`packages/engine/**` (engine lane: `src/**`, `test/**`, including extending `test/fixtures/common.ts` without changing T-0200 expectations). `docs/engine-rules.md`: only the two sentences named by D-0040 §6 and §11. Tests may read `data/exercises/library/*.json` but must not change them. Don't add dependencies to `packages/engine/package.json` (that changes the lockfile, which infra owns).

## Contract impact
`docs/engine-rules.md`: the rule 10 `sessionReasons` sentence and the Required-tests all-chest bullet, both named by D-0040 (the engine owns this contract). Otherwise none. The output shapes follow D-0037 §6–§8. `WorkoutItem.backoff.weightKg` nullable goes to data (T-0102) as a follow-up.

## Definition of done
Tests for every AC of the child pass · `npx -y pnpm@10.28.2 -w typecheck lint test` green · the contract sentences are linked to D-0040 · commit messages start with `T-0201a`/`T-0201b` and cite UF-08.1/UF-08.4/UF-09.8 where relevant.

## Accept log
- 2026-09-28 T-0201a (commit 40ba07a) accepted. AC1–AC21, AC23 and AC24 each have a named test in `rule-7-session.test.ts`, `rule-7-histories.test.ts` or `rule-7-traceability.test.ts`. AC22 is covered by the T-0200 purity-lint and housekeeping tests plus a clean engine lint. The builder rechecked AC11, AC12, AC13, AC15, AC16 and AC18 and found no value to change. QA re-derived AC3, AC4, AC6, AC11 and AC13 independently, and the PO checked the AC12 totals (720 + 555 + 270 = 1545). Selection details are in D-0042 (`revisit`). T-0201b (AC25–AC36) is still open, so the parent `T-0201` stays open. Housekeeping: the Scope edge-case line now cites AC18/AC19 instead of AC20/AC21.
- 2026-09-28 T-0201b (commit 93824e3) accepted. AC25–AC36 each have a named test in `rule-7-energy.test.ts` or `rule-8-timecheck.test.ts`, plus property coverage in `rule-7-histories.test.ts` (AC28, AC35) and export/id checks in `rule-7-traceability.test.ts` (AC36). The main lift is never cut by Low energy (AC25) or by Trim (AC33), and Skip next can remove it (AC33), per D-0040 §10. The builder rechecked AC25–AC34 by hand against rules 7.4/8 and found every value correct, so no test value or this log needed a correction. QA independently re-derived AC26, AC29–AC34 (including AC30's multi-step trim and AC33's main-lift-protected trim vs skipNext) and confirmed all match. Review independently re-checked AC26, AC32 and AC33's arithmetic and confirmed the same. Build details (trim area sourced from the `area_deficit` reason since `timeCheck` has no library, per-set cost as `(costS − 60) / sets`, `floorInc`'s float guard, no back-off on a timed main lift) are recorded in D-0047 (`revisit`); none contradicts a decided decision or `docs/engine-rules.md`. No contract file changed. All of `pnpm -w typecheck lint test`, `pnpm check:repo` and `pnpm format:check` are green, and `pnpm-lock.yaml` is unchanged. Both children (T-0201a, T-0201b) are now done, so the parent `T-0201` is closed.
