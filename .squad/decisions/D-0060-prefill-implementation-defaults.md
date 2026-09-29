---
id: D-0060
title: Progression and pre-fill (T-0205 build) — carry scope, unusable sessions, W = 0, timed clamp, test fixtures that the ticket mis-derived
status: revisit
date: 2026-09-29
by: engine-dev (T-0205 build)
area: engine
---
## Context
T-0205 builds rule 14 (`prefill`, D-0026) with the defaults in D-0057. During the build, a few points came up that neither the rule text nor D-0057 settles. Three ticket fixtures also turned out not to exercise what their ACs describe once real rule 7.2 selection runs. The build keeps every D-0057 point literally. This record covers only what was left open.

## Decision
1. **Carry scope (step 1, D-0057 §1).** `carry` applies only when all of these hold: `previous` is non-null; `previous.weightKg` is non-null and **> 0**; the exercise being pre-filled is non-timed with `externalLoad: true`; `previous.exerciseId` is a library row of kind `exercise`; the two share a weight-1.0 area; and they share an equipment item, with `[]` ≡ `["none"]` (D-0040 §1). A bodyweight exercise stays at 0 (D-0057 §2 "the weight stays 0 in every branch"). A timed exercise's weight is always null (D-0057 §6). Carrying 0 kg onto a loaded lift is never useful (the D-0057 §4 reasoning), so that case is `first_time`. The carried weight is rounded to 3 decimals.
2. **An unusable most-recent session does not fall back.** The "most recent session containing the exercise" is picked over all of its hard sets. If that session has no usable set (D-0057 §3: no non-null weight on a loaded lift, no non-null reps, or no non-null `durationS` when timed), step 1 applies. The engine does **not** look at an older session. `W` is the highest non-null weight among that session's hard sets, including sets whose reps are null (§3 ignores reps-null sets only for `minReps` and "all at W").
3. **Step 5's second session.** The second session is the second most recent one containing the exercise. If it has no usable set, step 5 does not match (the result is `hold`).
4. **A loaded lift logged at 0 kg.** `W = 0` is a recorded weight, not a missing one. Steps 2 and 5 give 0 (D-0057 §4: "when W = 0 the result is 0"), steps 3, 6 and 7 give 0, and step 4 gives `0 + inc`.
5. **Timed durations stay in 15…120 s.** Every non-first-time timed result is clamped to `[TIMED_MIN_S, TIMED_MAX_S]`, not only the `+ 5 s` and `gap ≥ 21` branches. This keeps AC21's bound for the `hold_after_break` branch when an old log is outside the range. The `+ 5 s` branch reports `hold` when the clamped result is not greater than `min(last)` (e.g. already at 120 s).
6. **Shuffled slot `previous`.** `suggest` passes the original exercise's own rule 14 pre-fill weight: it runs `prefill` for the original at its own rule 7.2 range, with `previous: null`. The weight is not the original's raw logged `W`. The item's `durationS` and `costS` still use `defaultDurationS` (rule 7.1). Pre-fill never changes selection or cost (AC23).
7. **Ticket fixture corrections (no behaviour change).**
   - AC9: with only a bench-press session in history, rule 7.2 rank 1 puts bench-press last, so the main lift is inverted-row. The test sets `mainLiftId: "bench-press"` (the user's chosen main lift, UF-08.1) and asserts the AC's literals.
   - AC17/AC22 `balancedHistory`: at F-input the plan is db-bench-press, db-row, leg-extension. None of them appears in the history (rank 1 prefers exercises not in the 09-27 session), so all are `first_time`. The tests assert that literally and add a pinned/main-lift variant that reaches `increase`, `add_rep` and `deload` over the same history.
   - AC18: with `S(09-24, inverted-row, …)` at shuffle 1, the swapped slot is back-squat → hip-thrust. back-squat has no history (pre-fill weight null), and inverted-row is bodyweight anyway, so `carry` cannot occur. The test asserts that case literally and adds a cable-only case: lat-pulldown (pre-fill 55) → seated-cable-row, `carry` 55 × 8.
8. **The T-0204 AC13 baseline test.** `rule-13-shuffle.test.ts` compares `suggest` at shuffle 0 against a pre-T-0204 snapshot that holds first-time pre-fills for non-empty histories. T-0205 AC22 requires two of those values to change: `returningAfter10Days` bench-press and calf-raise become 50 kg `hold_after_break`. The test now overlays exactly those two pre-fills (and their `prefill {kind}` reasons) on the snapshot, and still compares every other field deep-equal. The JSON snapshot itself is unchanged. `pre-t0205-suggest.json` is a new snapshot captured at 455c10d, before T-0205, for AC16/AC23.

## Consequences
- engine: implemented and tested in `packages/engine/src/prefill.ts`, `test/rule-14-*.test.ts`.
- docs follow-up (under D-0057 §10): if rule 14's text should carry D-0057 §2/§4/§6, it should also carry points 1, 2, 4 and 5 here.
- web (T-0304): a timed item's pre-filled duration is `prefill.durationS`. `item.durationS` stays the rule 7.1 costing duration.

## Revisit when
- A shuffled or swapped bodyweight exercise needs a load input (D-0057's own revisit trigger).
- Rule 7.1 should cost timed items at the progressed `prefill.durationS` instead of `defaultDurationS`.
- Users log incomplete sessions often enough that falling back to an older usable session (point 2) would give better pre-fills.
