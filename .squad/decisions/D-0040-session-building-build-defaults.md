---
id: D-0040
title: Session building (T-0201 groom) — "none" equipment, warm-up source and cost, library fields, first-time pre-fill seam, reason placement, totals, timeCheck edges, most-recent session, split
status: revisit
date: 2026-09-28
by: product-owner (T-0201 groom)
area: engine
---
## Context
T-0201 builds engine rules 7, 8 and 10 (`docs/engine-rules.md` v1, D-0004, D-0024) and takes over from D-0034 §7 the eligible-exercise rule and R0-E1 applied to `suggest`. Grooming found gaps that the rules, D-0024, D-0033, D-0034 and D-0037 don't settle:
- The L1 fixture writes "no equipment" as `[]`, but D-0033 and `data/exercises` write `["none"]`, and the equipment profiles contain `"none"`.
- Engine-rules §7 lists 8 `wu-*` fixture moves. `data/exercises` ships 4 warm-up rows (`hip-circles` glutes .5/quads .5, `cat-cow` back .5/core .5, `jumping-jacks` and `arm-circles` general), all 40 s.
- The engine's `LibraryExercise` (D-0034 §1) has no `timed`, `defaultDurationS`, `incrementKg` or `externalLoad`, but rule 7 needs timed work, R7-E6 needs "0 kg" for bodyweight, and High energy needs the increment.
- `WorkoutItem.prefill` is required (D-0037 §7), but rule 14 is T-0205, which T-0201 doesn't depend on.
- Rule 6 puts `recovering_skipped` in the session reasons, rule 10 fills `sessionReasons` with up to 3 `area_deficit` entries, and D-0037 caps `sessionReasons` at 3.
- Nothing says what `totalS`/`unusedS` are when the warm-up is off or the budget is too small, which items get `days_since`, what `timeCheck` returns after the last item, or what "the most recent session" is.
- Engine-rules "Required tests" says the all-chest history gives "a leg compound" main lift. Rule 7.2 as written picks back first (back is also at load 0 and comes first in the fixed order): inverted-row.

## Decision
1. **"none" is no equipment.** The eligibility check ignores the item `"none"` on both sides, so `["none"]` ≡ `[]` for exercises and profiles. Other spellings aren't aliased: the vocabulary is D-0033's (`pullup-bar`). An exercise tagged `pull-up-bar` is simply not eligible for a profile holding `pullup-bar`, and the content validator (T-0103) already rejects that spelling.
2. **Warm-up source.** The generator reads `kind: "warmup"` rows from the passed library (D-0033 §6). `areas: {}` means general. The `wu-*` moves stay test fixtures. The real `data/exercises` rows must also produce 4 distinct moves (tested in T-0201). Each plan warm-up entry has `durationS: 40`, and the warm-up always costs 180 s (rule 7.1). Neither depends on the rows' `default_duration_s` or on how many moves exist. With fewer than 4 warm-up rows, the plan holds all of them.
3. **Library fields.** T-0201 adds `timed`, `defaultDurationS | null`, `incrementKg | null` and `externalLoad` to the engine's `LibraryExercise`, using D-0037 §6 names. The T-0200 fixture helpers set them from the L1 table: "bw" rows have `externalLoad: false` and `incrementKg: null`, plank has `timed: true` and `defaultDurationS: 45`, and warm-ups have `timed: true`, 40 and `externalLoad: false`.
4. **First-time pre-fill seam.** Until T-0205 lands, `suggest` fills each item's `prefill` with rule 14 step 1 without the carry case: weight `null`, or `0` when `externalLoad` is false; `reps = repsMin`; `durationS = defaultDurationS` for timed items; `kind: first_time`. Each item gets the reason `prefill {kind}`. T-0205 replaces the internal function behind the same call and must keep T-0201's zero-history tests green. The High-energy back-off weight is `floorInc(0.9 × prefill weight)`, or `null` when the pre-fill weight is `null`, with `reps` = the main lift's `repsMin`.
5. **Item shape.** Timed items have `repsMin = repsMax = null` and `durationS = defaultDurationS`. Other items have `durationS: null`. `costS` = `sets × (work + rest) + 60`, plus one main-lift set cost when `backoff` is set. `sets` never counts the back-off set.
6. **Reasons.** Item reasons are in this order: `main_lift` (main only), `area_deficit {first primary area, session-start deficit}`, `days_since {same area, D − lastTrainedDate | null}`, then `energy_low_trim` (on a trimmed accessory) or `energy_high_backoff` (on the main lift, only when a back-off was added), then `prefill`. `sessionReasons` (≤ 3, D-0037) starts with at most 2 `recovering_skipped {area}` entries for the recovering areas in the fixed order. It is then filled with `area_deficit` entries for the items' distinct first primary areas, in session order, up to 3 in total. **This names a one-sentence clarification to rule 10**, and T-0201 adds it.
7. **Totals.** `available = budgetMin × 60 − (warmupInBudget ? 180 : 0)`, which may be negative. `itemsTotalS = Σ costS`. `totalS = itemsTotalS + 180` always, because the warm-up is always generated and done. `unusedS = max(0, available − itemsTotalS)`. When nothing fits, `items = []` and `mainLiftId = null`, and this is not an error. `suggest` throws `RangeError` for a `budgetMin` that isn't an integer in 1–480.
8. **Main lift and pinned inputs.** `mainLiftId` or a `pinnedIds` entry that is unknown, ineligible, a duplicate, recovering at weight 1.0, over a cap, or doesn't fit is ignored. The main lift then falls back to the automatic choice, and a pinned entry is skipped. `mainLiftId` must also be a compound. `sessionInput.shuffle` is ignored until T-0204.
9. **Most recent session** (candidate rank 1) is the `sessionId` whose hard sets (D-0036 §2, local date ≤ D) have the greatest `completedAt`. Ties go to the smaller `sessionId`.
10. **timeCheck edges.** `trim` and `skipNext` are always computed, even when `show` is false. Their `items` are the full plan with started items unchanged. When `nextItemIndex = items.length`, the result has `show: false` and `trim`/`skipNext` equal to the plan. Skip next removes the next item even if it is the main lift (it's the user's explicit choice), and `plan.mainLiftId` stays. `timeCheck` throws `RangeError` for a negative or non-integer `elapsedS`, and for a `nextItemIndex` outside 0…items.length. Trimmed items get their `costS` recomputed and keep their reasons.
11. **All-chest expectation.** The Required-tests bullet changes to "legs and back get attention, and the main lift is a compound for the first zero-load area (inverted-row)". **This names that one-line change to `docs/engine-rules.md`**, and T-0201 makes it, because the engine lane owns the contract.
12. **Split.** T-0201 is about 2 days of agent work, so it becomes a parent with two children: **T-0201a** (eligibility, the time model, main lift and greedy, warm-up, reasons, the Workout shape, R0-E1 on `suggest` and R7-E8) and **T-0201b** (energy Low/High and `timeCheck`, which depends on T-0201a). This follows the D-0037 §12 pattern: the `T-0201` row stays as the parent until both children are done.

## Consequences
- engine (T-0201a/b): implements points 1–11 and makes the two sentence changes (points 6 and 11) in `docs/engine-rules.md`.
- engine (T-0205): replaces the point-4 seam and keeps the zero-history expectations.
- engine (T-0202): the all-chest simulated test expects inverted-row as the main lift.
- web (UF-09, T-03xx): passes `elapsedS` without paused time, and without the warm-up when `warmupInBudget` is off (rule 8). The engine can't check this.
- data (T-0102): `WorkoutItem.backoff.weightKg` must be nullable.
- orchestrator: adds the T-0201a/T-0201b board rows (point 12). T-0203 and T-0301 depend on T-0201a.

## Revisit when
- T-0205 lands (point 4).
- Users ask why a recovering area isn't trained more often than the 2-entry cap shows.
- The real library gains warm-ups with durations other than 40 s.
