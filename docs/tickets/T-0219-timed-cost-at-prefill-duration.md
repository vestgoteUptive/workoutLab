---
id: T-0219
title: "Engine: rule 7.1 costs timed sets at the planned (pre-fill) duration, so a plan with a progressed plank stays inside the budget (D-0092)"
lane: engine
screens: [UF-08.1, UF-08.2, UF-08.3, UF-09.5, UF-05.1]
decisions: [D-0024, D-0040, D-0056, D-0057, D-0062, D-0092]
deps: [T-0205]
status: ready
---
<!-- Written by product-owner 2026-10-01 (groom mode). Build flow: wl-build-engine (the board's wl-idea step is done: D-0092 is the decision). About ½ day. Priority: lands before T-0304 ships (principle 2). Serialise with T-0224 and T-0214, which also change src/session.ts; order T-0219 → T-0224 → T-0214. -->

## Why
Principle 2: the time budget is a first-class input, and R7-E8 promises Σ item costs ≤ `available`. Today a timed set is costed at the library's `defaultDurationS`, but since T-0205 the user is shown the rule 14 pre-fill `prefill.durationS`, which grows 5 s per session up to 120 s. A plank logged at 115 s last time is planned at 3 × (45 + 60) + 60 = 375 s. It is shown at 120 s, so it takes 600 s. In a 20-minute plan with the warm-up off, the plan says 1095 s and the user spends 1320 s. D-0092 settles the reading of rule 7.1: a timed set's work is the **planned duration**, which is the rule 14 pre-fill duration for that exercise over the same history and `now`. It applies everywhere the engine costs time.

## Scope
- In:
  - `packages/engine/src`:
    - The planned duration (D-0092 §1). It is a pure function of `(exercise, history, now, tz)` that returns rule 14's timed `durationS` (or `null` for a non-timed exercise), exported from `src/index.ts`.
    - Wire it into every time cost (D-0092 §2):
      - rule 7.2 `tryAdd` (main, pinned, greedy);
      - rule 7.4 Low (the freed time) and High (the back-off check);
      - rule 13's fit check in `applyShuffle`;
      - rule 12 `rankSwaps` `timeCostS` and `fitsBudget`;
      - each item's `costS`.
    - `item.durationS` = `prefill.durationS` for a timed item (D-0092 §3).
    - `setCostS(exercise)` and `itemCostS(exercise, sets)` keep their current results when called without the new argument (D-0092 §4). R7-E1 and `apps/web/src/features/UF-04/CompareContent.tsx` depend on that.
  - `docs/engine-rules.md` (D-0092 §5):
    - rule 7.1's text;
    - the new example R7-E13;
    - one Traceability row.
  - Re-scoping the two whole-file "rules unchanged against main" guards (D-0092 §6).
  - Tests: every AC below, plus a new timed simulated history (`test/fixtures/histories-timed.ts`, a new file) run through `suggest`, `balance`, `rankSwaps` and `evaluateCheckin`.
  - Edge cases:
    - zero history (byte-identical);
    - returning after 10 days off (`hold_after_break` keeps the last duration);
    - returning after 21+ days (`reentry` shortens it, so the cost drops);
    - offline-merged history, where a queued timed set raises the planned duration;
    - a timed set logged with `durationS: null`, which falls back to `defaultDurationS`;
    - the 120 s cap;
    - time running out (rule 8 reads the new `costS`).
- Out:
  - Any change to rule 14 itself (T-0221 carries the rule 14 text follow-up).
  - Rep slots by goal (T-0214). `applySwap` (T-0224) consumes this ticket's helper.
  - The UF-09.5 timed screen (T-0304).
  - The vendored engine copy in `supabase/functions/_shared/vendor`, which is regenerated at merge (D-0053 §1).
  - `api/openapi.yaml` and `docs/data-model.md` (no field changes: `durationS` and `costS` keep their types).
  - `test/fixtures/histories.ts` stays as it is. The new timed history goes in a new fixture file.

## Acceptance criteria
**Fixtures unless an AC says otherwise:**
- F-tz: `Europe/Stockholm`, `now = "2026-09-27T12:00:00+02:00"`, D = 2026-09-27.
- F-targets, F-profile (`goal: build_muscle`), F-input, and `LIBRARY` from `test/fixtures/common.ts`.
- Each AC is at least one Vitest test in `packages/engine/test/**`. A test that implements R7-E13 starts its title with `R7-E13`.

**Notation:**
- `P(date, [d1, d2, …])` is `setsWithReps(date, "plank", [{durationS: d1}, …])`: one session at 10:00 local with one hard plank set per entry.
- A plank set costs `work + 60` (isolation rest), and an item adds the 60 s transition.

- **AC1 (R7-E13, the overrun case)**
  - Given `P(2026-09-24, [115, 115, 115])` and F-input with `budgetMin 20`, `warmupInBudget false` and `pinnedIds ["plank"]` (`available` 1200), When `suggest` runs:
    - The items are exactly [bench-press × 4 (main), plank × 2].
    - plank's `prefill` is `{weightKg: null, reps: null, durationS: 120, kind: "add_rep"}`, its `durationS` is 120, and its `costS` is 2 × (120 + 60) + 60 = 420.
    - bench-press's `costS` is 720, `itemsTotalS` is 1140, `unusedS` is 60, and `totalS` is 1320.
  - **Contrast:** at zero history the same input gives plank × 3 at `durationS` 45 and `costS` 375 (`itemsTotalS` 1095, `unusedS` 105). These are today's values, unchanged.
  - Why: bench-press × 4 leaves 480 s. plank × 3 at 120 s would cost 600 s, so the pinned try falls back to 2 sets. Nothing else fits in the last 60 s.
- **AC2 (the duration can go down: `reentry`)** Given `P(2026-09-01, [40, 40, 40])` (gap 26), the same F-input as AC1, When `suggest` runs:
  - plank is × 3 with `prefill.durationS` 35 (`max(15, floor5(36))`), `durationS` 35 and `costS` 3 × 95 + 60 = 345.
  - `itemsTotalS` is 1065 and `unusedS` is 135.
  - With `energy: "low"`, plank goes to × 2 at `costS` 250, `itemsTotalS` is 970 and `unusedS` is 230. The freed time is exactly one planned set, 95 s.
- **AC3 (returning after 10 days off)** Given `P(2026-09-15, [100, 100])` (gap 12), AC1's F-input: plank's `prefill.durationS` and `durationS` are both 100 (`hold_after_break`), and its `costS` is computed at 100 s. Assert the item set count and `costS` as literals derived from rule 7.2 in the test.
- **AC4 (the cost helpers)**
  - `itemCostS(plank, 2)` is still 270 (R7-E1, unchanged), and `setCostS(plank)` is still 105.
  - With the planned duration passed in (however the builder exposes it), a plank set at 120 s costs 180 and plank × 3 costs 600.
  - The exported planned-duration function returns:
    - 120 for AC1's history;
    - 45 for `[]`;
    - 45 for `P(2026-09-24, [null, null])`;
    - `null` for `back-squat` (non-timed).
  - It deep-equals `prefill(plank, {repsMin: null, repsMax: null}, …, previous)` `.durationS` for any `previous`.
- **AC5 (rule 12 `timeCostS` and `fitsBudget`)** Given `sessionOf([["bench-press", 4, true], ["dead-bug", 2]], {budgetMin: 20, warmupInBudget: false})` (`costS` 720 and 270, `itemsTotalS` 990) and AC1's history, When `rankSwaps("dead-bug", "short_on_time", …)` runs:
  - The order is [hanging-knee-raise, plank].
  - hanging-knee-raise has `timeCostS` 270.
  - plank has `timeCostS` 420 and `fitsBudget` true (990 − 270 + 420 = 1140 ≤ 1200).
  - With `budgetMin 18` (`available` 1080), plank has `fitsBudget` false (1140 > 1080). At zero history plank has `timeCostS` 270 and `fitsBudget` true at both budgets.
- **AC6 (rule 13 shuffle fit)** Over every `shuffle` in 0…6 with AC1's history and `pinnedIds []`, each shuffled timed slot is accepted only when its planned-duration cost fits. Assert Σ `costS` ≤ `available` and that each timed item satisfies AC8's identity. If no shuffle at F-input puts plank in a slot, the test says so and uses `excludeIds: ["dead-bug", "hanging-knee-raise"]` to force core onto plank.
- **AC7 (zero history is byte-identical, D-0092 §1)**
  - Given `[]` and F-input over `energy` normal, low and high, `budgetMin` 15, 20, 30 and 90, `warmupInBudget` on and off, and `pinnedIds` `[]` and `["plank"]`: every `suggest` result deep-equals the pre-change result. Capture it from `main` before the change as a committed JSON snapshot, the way T-0205 captured `pre-t0205-suggest.json`.
  - `rankSwaps` over the R12-E1…R12-E5 fixtures deep-equals today's results.
  - Every existing T-0200, T-0201a, T-0201b, T-0202, T-0204 and T-0205 test stays green with no expectation edited. Two exceptions:
    - the two guards re-scoped in AC11;
    - an independent oracle that encodes the old "timed work = `defaultDurationS`" rule over a history with logged timed sets (for example `rule-14-properties.test.ts`, if it costs items). Such an oracle is updated to D-0092 §1, and the commit lists each changed line.

    Any other change means stop and raise triage.
- **AC8 (the identity, every item)** For every `suggest` result in AC9 and AC10, every timed item has `durationS === prefill.durationS` and `costS === sets × (durationS + rest) + 60`, with rest = 60 for isolation and 120 for compound (plus one set when `backoff` is non-null). Every non-timed item has `durationS === null` and `costS === sets × (45 + rest) + 60` (+ one set for a back-off).
- **AC9 (simulated 14-day histories, including a timed one)**
  - Add `timedCoreHistory` in `test/fixtures/histories-timed.ts`:
    - 4 sessions at 18:00 local on 2026-09-20, 09-22, 09-24 and 09-26;
    - each session has 3 × bench-press 50 × 8 and 3 × barbell-row 50 × 8;
    - each session also has 3 plank sets at 100, 105, 110 and 115 s respectively, so the last plank session's `min` is 115.
  - For each of `balancedHistory`, `allChestNoLegsHistory`, `returningAfter10DaysHistory`, `offlineMergedHistory`, `timedCoreHistory` and `[]`, at F-input with `pinnedIds` `[]` and `["plank"]`:
    - `suggest` satisfies AC8 and R7-E8's caps;
    - `balance` is unchanged by this ticket (deep-equal to `main`'s result);
    - `evaluateCheckin` (F-checkin, via `checkinSessions`) is unchanged.
  - For `timedCoreHistory` with `pinnedIds ["plank"]`, plank's `prefill.durationS` and `durationS` are 120, and the literal items, `costS`, `itemsTotalS` and `unusedS` are asserted in the test, derived by hand from rule 7.2.
- **AC10 (R7-E8 extended: never over)** For every `budgetMin` in 15…120 step 5, with the warm-up on and off, over the AC9 histories, with `pinnedIds` `[]` and `["plank"]`:
  - Σ `costS` ≤ `available`;
  - ≤ 8 items;
  - ≤ 2 items per primary area;
  - AC8 holds.

  This is the property that would have caught the overrun.
- **AC11 (offline-merged)** Given `P(2026-09-24, [60, 60])` from the server plus a queued (`pending: true`) replacement of one of those sets at `durationS` 110 with a newer `editedAt`: the plank set rows stay as they are, the planned duration is `min(60, 110) + 5 = 65`, and `costS` uses 65. Given a queued tombstone of the 09-24 session's sets instead, the planned duration is 45 (first time) and `costS` uses 45.
- **AC12 (rule 8 reads the new cost)** For AC1's plan, `timeCheck(workout, {elapsedS: 900, nextItemIndex: 1})` gives `behindS` = 900 + 420 − 1200 = 120, `show` true and `minutesBehind` 2. Trim leaves plank at 2 sets: it is the only accessory, and rule 8 trims only items with more than 2 sets. It then removes plank (`projectedS` 900).
- **AC13 (the contract text, D-0092 §5)** A Vitest test reads `docs/engine-rules.md` and asserts:
  - rule 7.1 contains the sentence "For a timed set, work is its **planned duration**: the rule 14 pre-fill `durationS` for that exercise over the same history and `now`, which is `defaultDurationS` with no usable history (D-0092)";
  - rule 7.1 contains "Every time cost in the engine uses this model: rule 7.2 selection, rule 7.4, rule 12 `timeCostS` and `fitsBudget`, rule 13's fit check and `applySwap`";
  - a line starting `- **R7-E13` cites D-0092 and contains `1140`;
  - the Traceability table has a row for T-0219;
  - R7-E1 is unchanged;
  - no other rule's text changed. Compare each `## n.` section other than 7 with `main`, and skip on a shallow clone.
- **AC14 (guards re-scoped, D-0092 §6)**
  - `rule-14-suggest.test.ts`'s "docs/engine-rules.md is unchanged against main" compares only rule 14's section (from `## 14.` up to `## Required tests`) with `main`.
  - `t0204-traceability.test.ts`'s "differs by at most that one line" compares only rule 12 (up to and including the `- **R12-E5` line, with the existing D-0056 one-line allowance) and rule 13 with `main`.
  - Both still pass on a clean `main` checkout.
  - A planted edit to rule 14's text, or to the R12-E3 line, makes the matching guard fail. Show this in the commit message or with a QA fault proof.
- **AC15 (determinism and purity, R0-E1)** For AC1, AC9 and AC10's inputs, two runs are deep-equal, deep-frozen inputs neither throw nor change, and reversing `history` or `library` gives deep-equal results. `pnpm --filter @workoutlab/engine lint` passes (no clock or randomness in `src/**`).

## Paths you may change
- `packages/engine/**` (the lane: `engine`).
- **Listed extras:**
  - `docs/engine-rules.md`: rule 7.1's text, the new R7-E13 line, and one Traceability row (D-0092 §5).

## Contract impact
- `docs/engine-rules.md` rule 7.1 changes under D-0092 (engine lane owns this contract): the planned-duration sentence, the "one time model" sentence, R7-E13, and the Traceability row.
- No change to `api/openapi.yaml` or `docs/data-model.md`. `WorkoutItem.durationS` and `costS` keep their types and meaning ("the target duration" and "the item's cost").

## Coordination
- **Files this ticket changes:**
  - `packages/engine/src/cost.ts`, `src/session.ts`, `src/swaps.ts`, `src/index.ts`, and possibly `src/prefill.ts`;
  - new tests and `test/fixtures/histories-timed.ts`;
  - edits to `test/rule-14-suggest.test.ts` and `test/t0204-traceability.test.ts` (AC14 only);
  - `docs/engine-rules.md` §7.1 and the Traceability table.
- **Serialise with T-0224 and T-0214**, which both change `src/session.ts` and `docs/engine-rules.md`. Order: T-0219 → T-0224 → T-0214. T-0215 changes `src/checkin.ts` and rule 9 only. It overlaps this ticket only in `docs/engine-rules.md` (a different section) and possibly `src/index.ts`, so it may run in parallel if the orchestrator accepts that merge.
- Whichever engine ticket edits `docs/engine-rules.md` first does AC14. If T-0224, T-0214 or T-0215 lands first, it does AC14 and this ticket checks it is already done.
- T-0304 (UF-09.5) can read `item.durationS` or `prefill.durationS`, since they are equal now. This closes the T-0205 web follow-up "use `prefill.durationS` rather than `item.durationS`".

## Definition of done
- Tests for every AC pass, including R7-E13 and the simulated 14-day histories (AC9, AC10).
- `npx -y pnpm@10.28.2 -w typecheck lint test --force` is green.
- The contract change is linked to D-0092.
- Commit messages start with `T-0219` and cite UF-08.2 or UF-09.5 (e.g. `T-0219 UF-08.2: cost timed sets at the planned duration`).
