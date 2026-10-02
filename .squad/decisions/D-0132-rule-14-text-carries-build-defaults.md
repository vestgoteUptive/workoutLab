---
id: D-0132
title: Rule 14's text carries the D-0057 §2/§4/§6 and D-0062 §1/§2/§4/§5 build defaults; the T-0205 rule 14 guard narrows to the R14 example lines
status: revisit
date: 2026-10-02
by: product-owner (groom, T-0221)
area: engine
builds-on: D-0057 §10, D-0062 (Consequences, docs follow-up), D-0092 §6, D-0096 §2
---
## Context
D-0057 §10 and D-0062's Consequences leave one docs follow-up open. Rule 14 in `docs/engine-rules.md` doesn't state build details that the engine implements and tests. Those are bodyweight progression, the drop floor, usable sessions, carry scope, the 0 kg loaded case and the timed clamp. So a reader of the contract can't derive R14 results for those inputs. The T-0205 review asked for the exact wording, including the gap 10–20 timed case, which is `clamp(min(last))`.

No behaviour changes. `packages/engine/src/prefill.ts` already does all of it.

The T-0205 guard (`rule-14-suggest.test.ts`, "rule 14 (## 14. up to ## Required tests) is unchanged against main", re-scoped by D-0092 §6) covers the whole rule 14 section. Any edit there fails it on the branch.

## Decision
1. **Contract edit (engine lane), rule 14 only:**
   - Steps 2 and 5: `floorInc(0.9 W)` becomes `max(inc, floorInc(0.9 W))` (`0` when `W = 0`).
   - Step 4 gains: "(bodyweight: 0 at high reps, `increase`)".
   - A bullet block titled `**Edge cases (D-0057, D-0062, D-0132):**` goes after the timed paragraph and before R14-E1, with these five bullets (wording may be tightened, but each fact and its citation must be there):
     - **Bodyweight (D-0057 §2):** for `externalLoad: false`, `W` is 0 and the weight stays 0 in every branch. Step 4 gives 0 at high reps (`increase`). `floorInc` is never applied.
     - **Usable sets (D-0057 §3, D-0062 §2, §3):** `W` is the highest non-null weight among the session's hard sets, including sets whose reps are null. Reps-null sets are ignored for `minReps` and "all at W". If the most recent session containing the exercise has no usable set (no non-null weight on a loaded lift, no non-null reps, or no non-null `durationS` when timed), step 1 applies. The engine never falls back to an older session. Step 5's second session must be usable too, or step 5 does not match.
     - **Drop floor (D-0057 §4, D-0062 §4):** `inc = incrementKg ?? 2.5`. Steps 2 and 5 never give less than one increment when `W > 0`. A loaded lift logged at 0 kg has `W = 0`, a recorded weight: steps 2, 3, 5, 6 and 7 give 0, and step 4 gives `0 + inc`.
     - **Carry (D-0062 §1):** step 1 carries only when the previous weight is > 0, the exercise is non-timed with `externalLoad: true`, and the previous exercise is a library row of kind `exercise` sharing a weight-1.0 area and an equipment item (`[]` ≡ `["none"]`, D-0040 §1). The carried weight is rounded to 3 decimals. Otherwise step 1 is `first_time`.
     - **Timed (D-0057 §6, D-0062 §5):** `min(last)` is the minimum non-null `durationS` over that session's hard sets. Weight and reps are null. Every non-first-time result is clamped to [15, 120] s: `gap ≥ 21` → `clamp(max(15, floor5(0.9 × min)))` (`reentry`); `gap` 10–20 → `clamp(min)` (`hold_after_break`); otherwise `clamp(min + 5)`, which is `add_rep` when greater than `min` and `hold` when not. `floor5(x) = floor(round3(x) / 5) × 5`. The first time is `defaultDurationS`, unclamped.
   - One Traceability row: `| 14 text: D-0057 §2/§4/§6, D-0062 §1/§2/§4/§5 (D-0132) | T-0221 |`.
   - The R14-E1…R14-E9 lines, the rule 14 heading, the "Last performance" paragraph and steps 1, 3, 6 and 7 stay byte-identical.
2. **Guard narrowing (D-0092 §6 manner).** The T-0205 guard stops comparing all of rule 14 with `main`. It compares the nine `- **R14-E…` example lines, the `## 14.` heading line and the "Last performance" paragraph with `main`, where they are unchanged. The T-0221 test pins the new content positively (D-0096 §2). The rest of rule 14 is now owned by T-0221's guard. No committed test compares "every other section" with `main`. The build agent runs `git diff main...HEAD -- docs/engine-rules.md` and lists the changed sections (D-0096 §2).
3. **Each stated fact has a test.** For every bullet in §1, the build names an existing engine test that pins the behaviour. Where none exists, it adds one. The test must pass on today's `src/**` (docs catch-up, not a behaviour change).

## Consequences
- engine (T-0221): makes the §1 edit, the §2 guard change and any §3 tests. `src/**` is unchanged, so there is no vendor regen.
- D-0057 §10's "follow-up edit under this decision's id" and D-0062's docs follow-up are discharged.
- If T-0220 (D-0131) has merged first, the rule 7.4 back-off floor lives in rule 7.4, not here. Rule 14's R14-E9 line is unchanged either way.

## Revisit when
- Rule 14 behaviour changes (for example D-0062's "fall back to an older usable session" trigger). The edge-case bullets then change under that decision.
