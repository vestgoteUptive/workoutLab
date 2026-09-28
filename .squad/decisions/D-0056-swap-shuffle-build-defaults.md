---
id: D-0056
title: Swap ranking and shuffle (T-0204 groom) — R12-E1 muscleMatch correction, rankSwaps signature, fitsBudget and slot definitions, shuffle placement, caps, swap reason, shuffle validation
status: revisit
date: 2026-09-28
by: product-owner (T-0204 groom)
area: engine
---
## Context
T-0204 builds `docs/engine-rules.md` rules 12 and 13 (D-0025). Grooming found one contract error and several gaps that neither rule 12/13, D-0025, D-0037 nor D-0040 settle:

1. **R12-E1 contradicts the muscleMatch formula.** Rule 12 defines `muscleMatch = Σ min(w_cur, w_alt) / Σ w_cur`. The current exercise is barbell-row (`back 1, arms .5`, `Σ w_cur = 1.5`). db-row, inverted-row, lat-pulldown and seated-cable-row all carry `back 1, arms .5`, so each scores `1.5 / 1.5 = 1.0`, not the `0.667` the example's parenthetical claims. Only straight-arm-pulldown (`back 1`) is `1 / 1.5 = 0.667`. R12-E5 confirms the formula: bench-press (`Σ w_cur = 2.0`) vs push-up (`chest 1, arms .5`) gives `1.5 / 2.0 = 0.75`, exactly as written. The **listed orders of R12-E1…E4 are correct either way** (they are decided by type, timeCostS, guided-ness or id), so only the parenthetical value is wrong.
2. Rule 0 lists `rankSwaps(current, reason | null, session, profile, library, history, tz, now)` but doesn't say what `current` and `session` are, where the slot's set count comes from, or what `fitsBudget` measures.
3. Rule 12 says "the main slot takes compounds only" without saying how the engine knows the slot is the main one.
4. `variety` sorts by "last done date asc" without naming the lookback, and `equipment_taken`/`discomfort` compare equipment without saying how `"none"` is treated (D-0040 §1 settled that only for eligibility).
5. Rule 13 doesn't say whether shuffle runs before or after energy (rule 7.4), whether a shuffled pick must respect the rule 7.2 caps, what happens to the item's reasons and pre-fill, or what `shuffle` values are legal.
6. Rule 14 step 1's `carry` case is owned by T-0205, but T-0204 produces the swapped slots that need it.

## Decision
1. **Contract fix (one line).** R12-E1 in `docs/engine-rules.md` becomes: "db-row, inverted-row, lat-pulldown, seated-cable-row (muscleMatch 1.0), then straight-arm-pulldown (0.667). pull-up is excluded by level." T-0204 makes this edit and cites this decision; the engine lane owns the contract. No other rule-12 text changes, and the listed order is unchanged. `packages/shared/test/schemas.test.ts` keeps its `0.667` fixture: it only asserts schema validity, not engine values, so it is out of scope.
2. **`rankSwaps` signature.**
   `rankSwaps(currentExerciseId, reason, session, profile, library, history, now, tz)` where `session: Workout` (the plan being edited), `reason: SwapReason | null`, and `profile: Pick<EngineProfile, "level" | "equipment">`. Note the `now, tz` order matches every other engine function; rule 0's `tz, now` is a typo in the rule list and is **not** fixed by this ticket (a follow-up may correct it).
   - The **slot** is the item in `session.plan.items` whose `exerciseId === currentExerciseId`. If there is none, `rankSwaps` throws `RangeError`.
   - The **slot's set count** is that item's `sets` (never counting a back-off set, D-0040 §5).
   - It is the **main slot** when that item has `isMain: true`. Then candidates must be `type: "compound"`.
   - `excludeIds` is not an input: `rankSwaps` takes it from nothing, so the caller filters. Eligibility uses `isEligible(exercise, profile)` with an empty `excludeIds`.
3. **`timeCostS` and `fitsBudget`.** `timeCostS = itemCostS(candidate, slot.sets)`. `fitsBudget` is true when replacing the slot keeps the plan inside the budget: `session.itemsTotalS − slot.costS + timeCostS ≤ availableS(session.budgetMin, session.warmupInBudget)`. Candidates that don't fit are **still returned** (the UI shows the cost and lets the user decide, UF-08.3), just flagged `false`.
4. **`bestMatch`** is true for index 0 only, and for no entry when the list is empty.
5. **Equipment comparison.** `equipment_taken` and `discomfort` compare the real equipment sets (`"none"` filtered out on both sides, D-0040 §1). "Shares an equipment item" means the intersection is non-empty; an exercise with no equipment never shares. "Guided" means the candidate's real equipment includes `machine` or `cable`.
6. **`variety` lookback.** "Last done" is the latest local date of a hard set of that exercise anywhere in the passed history (rule 0: callers pass at least 56 local days), not just the 14-day window. "Never done" means no hard set at all in the passed history. Ties on the same last-done date fall through to muscleMatch desc, then id asc.
7. **"Not in the last session"** (the `none` sort key) reuses D-0040 §9: the `sessionId` whose hard sets with local date ≤ D have the greatest `completedAt`, ties to the smaller `sessionId`.
8. **Shuffle runs inside selection, before energy.** Order in `suggest`: main lift → pinned → greedy → **shuffle (rule 13)** → energy (rule 7.4). So Low energy trims, and High energy backs off, the post-shuffle exercises.
9. **A shuffled pick must keep the rule 7.2 / R7-E8 invariants.** Beyond rule 13's own rules (not pinned, not the main lift, not already taken by an earlier slot, fits `available` at the slot's set count), a pick is rejected — and the slot keeps its original — when it has a recovering area at weight 1.0 (rule 6 is absolute) or when taking it would make any area the primary area of more than 2 items. The `≤ 8 items` cap can't be broken by a 1-for-1 replacement.
10. **The shuffle list is built against the live plan.** For slot k, in session order, the `variety` ranking is `rankSwaps(originalExerciseId, "variety", …)` computed against the plan as it stands after slots 0…k−1 have been resolved (so "not in the session" already excludes earlier picks, and rule 13's "skipping exercises already taken by an earlier slot" is automatic). `len = 1 + ranking.length`, and entry 0 is always the original.
11. **Reasons and pre-fill on a shuffled slot.** A slot whose exercise actually changed gets `swap {reason: null}` inserted into its item reasons directly after `days_since` (rule 10's code list; `null` because the user did not give a reason). A slot that keeps its original gets no `swap` reason. Its `area_deficit`/`days_since` use the **new** exercise's first primary area at the session-start deficit. Its pre-fill stays the T-0201 first-time seam (D-0040 §4) until T-0205, but `suggest` passes the slot's previous exercise id into that seam so T-0205 can fill in `carry` without another signature change.
12. **`shuffle = 0` is a guaranteed no-op.** `n mod len = 0` picks the original at every slot, so every T-0201 expectation stays byte-identical and no `swap` reason appears. This is an acceptance criterion, not just an observation.
13. **Validation.** `suggest` throws `RangeError` when `shuffle` is not an integer ≥ 0 (matching `SessionInput.shuffle` in `api/openapi.yaml`: `integer, minimum: 0`). There is no upper bound: `n` is a counter that wraps.
14. **No new output component.** `SwapCandidate`/`SwapCandidateList` already exist in `api/openapi.yaml` (D-0037 §2, D-0039 §1) with exactly the rule-12 fields, so `api/openapi.yaml` does not change.

## Consequences
- engine (T-0204): implements points 2–13 and makes the point-1 contract edit.
- engine (T-0205): replaces the point-11 pre-fill seam with rule 14, including `carry` for a shuffled or swapped slot.
- web (T-0303 UF-08.2/UF-08.3, T-0306 UF-05.1): renders `rankSwaps` order without re-sorting, shows `fitsBudget: false` candidates with their cost, and increments `shuffle` by 1 per tap (never resetting it) so the user cycles rather than re-rolls.
- A `swap` applied by the *user* (UF-08.3, UF-05.1) carries the reason they chose; the engine only fills `null` for a shuffle. Applying a user swap to a stored plan is UI work (T-0303/T-0306), not `suggest`.

## Revisit when
- Exercise variants or movement-pattern tags exist (D-0025's own revisit trigger): `discomfort` should then exclude same-pattern variants.
- Users report that shuffle "skips" an alternative — that is point 9 rejecting it, and the UI may need to say why.
- Rule 0's `rankSwaps(… tz, now)` argument order is corrected.
