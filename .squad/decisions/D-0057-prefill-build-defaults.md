---
id: D-0057
title: Progression and pre-fill (T-0205 groom) — prefill signature, bodyweight progression, missing weights, floorInc floor, "last two sessions", timed edges, carry scope
status: revisit
date: 2026-09-28
by: product-owner (T-0205 groom)
area: engine
---
## Context
T-0205 builds `docs/engine-rules.md` rule 14 (D-0026) and replaces the first-time pre-fill seam D-0040 §4 left in `suggest`. All nine worked examples R14-E1…E9 were re-derived by hand during grooming against the rule text and hold as written. Grooming did find gaps the rule, D-0026, D-0037 and D-0040 don't settle:

1. Rule 0 lists `prefill(…)` with no argument list, and step 1's `carry` needs "the slot's previous exercise" and its pre-fill weight, which only `suggest` knows.
2. `W` is "their highest weight", but a bodyweight exercise (`externalLoad: false`) logs `weightKg` 0 or `null`. With `incrementKg: null` there is no `W + inc`, so step 4 as written would reset reps from high back to low every session — a strict loss for push-ups and inverted rows.
3. Nothing says what happens when an `externalLoad: true` exercise has history but **no** recorded weight (every `weightKg` null), or reps null on a non-timed exercise.
4. `floorInc(0.9 W)` can floor to 0 (W = 2.5, inc = 2.5 → `floorInc(2.25) = 0`), which would pre-fill an empty barbell for steps 2 and 5.
5. "The last two sessions both at W" doesn't say whether "at W" means the same `W` in both sessions, nor how sessions are ordered when two share a `completedAt`.
6. The timed branch caps at 120 s and floors at 15 s but doesn't say which sets `min(last)` covers, or what happens when a timed exercise has history with `durationS` null.
7. Rule 14 sits under UF-09.3/UF-09.4, but `suggest` also needs it at plan time (UF-08.2 shows "sets × reps · weight").

## Decision
1. **Signature.**
   `prefill(exercise, slot, history, library, now, tz, previous)` where:
   - `exercise: LibraryExercise` — the exercise being pre-filled.
   - `slot: {repsMin: number | null, repsMax: number | null}` — the rule 7.2 range for this slot (main 6–8, other compounds 8–12, isolation 10–15; both null for timed). "Low reps" is `repsMin`, "high" is `repsMax`.
   - `previous: {exerciseId: string, weightKg: number | null} | null` — the slot's previous exercise and its pre-fill weight, for step 1's `carry`. `null` when the slot was not swapped or shuffled.
   It returns `PrefillResult` (`{weightKg, reps, durationS, kind}`, D-0037 §7). It is exported from `@workoutlab/engine`.
2. **Bodyweight progression (`externalLoad: false`).** `W` is 0 and the weight stays 0 in every branch (`floorInc` is never applied, and `incrementKg: null` means no weight step). Steps 2, 3, 5 and 6 give `0` at low reps with their own kind. **Step 4 becomes reps-based:** when every set at `W` has reps ≥ high, the result is `0` at **high** reps with kind `increase` (instead of `W + inc` at low reps). Step 7 is unchanged (`0`, `min(high, minReps + 1)`, `add_rep`). This keeps push-up progression monotone; without it, hitting the top of the range would drop the user back to the bottom of it with no compensating load.
3. **Missing weights on a loaded exercise.** For `externalLoad: true`, only hard sets with a non-null `weightKg` can define `W`. If the most recent session containing the exercise has no such set, the exercise is treated as having **no history**: step 1 applies (`carry` if `previous` qualifies, otherwise `weightKg: null`, low reps, `first_time`). A non-timed set with `reps` null is ignored when computing `minReps` and "all at W"; if that leaves no usable set at `W`, step 1 applies too.
4. **`floorInc` floor.** Steps 2 (`reentry`) and 5 (`deload`) return `max(inc, floorInc(0.9 × W))` when `W > 0`, where `inc = exercise.incrementKg ?? 2.5`. A 0 kg pre-fill for a loaded lift is never useful, and one increment is the smallest honest suggestion. When `W = 0` the result is 0 (see point 2).
5. **"The last two sessions both at W."** Take the two most recent sessions containing the exercise (most recent first). Step 5 matches only when **both** have the same `W` as the most recent session **and** both have `minReps < low`. Session recency reuses D-0040 §9: greatest `completedAt` among that exercise's hard sets, ties to the smaller `sessionId`.
6. **Timed edges.** `min(last)` is the minimum `durationS` over the hard sets of the exercise in the most recent session containing it, ignoring sets with `durationS` null. If that leaves none, the timed first-time branch applies (`durationS = exercise.defaultDurationS`, `first_time`). `+ 5 s` is capped at 120 s; the `gap ≥ 21` branch is `max(15, floor5(0.9 × min))` where `floor5(x) = floor(round3(x) / 5) × 5`. `weightKg` and `reps` are always `null` for a timed item, and `kind` is the same code the non-timed waterfall would give for the same `gap`/rep comparison (`first_time`, `reentry`, `hold_after_break`, or `add_rep` when the duration increases, `hold` when it does not).
7. **`suggest` calls `prefill` for every item.** It replaces the D-0040 §4 seam at the same call site, passing the slot range and `previous` (from a rule 13 shuffle, D-0056 §11; `null` otherwise). The item's `prefill {kind}` reason then reports the real kind. The High-energy back-off keeps using `floorInc(0.9 × prefill weight)` at the main `repsMin` (rule 7.4, D-0040 §4) — this ticket does not change `applyEnergy`.
8. **Zero-history results are unchanged.** For an empty history and no `previous`, rule 14 step 1 gives exactly what the T-0201 seam gave (`weightKg: null`, or `0` when `externalLoad` is false; `reps = repsMin`; `durationS = defaultDurationS` for timed; `kind: first_time`). Every existing T-0201/T-0202 expectation therefore stays byte-identical, and that is an acceptance criterion.
9. **`gap` uses local dates.** `gap = dayDiff(session local date, D)` where D is the local date of `now` in `tz`. A session later today gives `gap = 0`. A future-dated session (local date > D) is still the most recent session and gives `gap = 0`; rule 3's window exclusion does not apply, because rule 14 reads last performance, not load.
10. **No contract change.** Rule 14 and `PrefillResult` (`api/openapi.yaml`, `docs/data-model.md`) already cover every field. Points 2, 4 and 6 are build details inside the rule; if a human wants them in the rule text, that is a follow-up edit under this decision's id.

## Consequences
- engine (T-0205): implements points 1–9 and keeps T-0201's and T-0202's expectations green.
- web (T-0304 UF-09.3/UF-09.4): renders `prefill.weightKg`/`reps`/`durationS` as the pre-filled values and may show `prefill.kind` as the "why"; `null` weight means "ask" (the first session on a loaded lift).
- content (T-0103): `increment_kg` and `default_duration_s` must be right, because points 2, 4 and 6 read them. `external_load = NOT bodyweight` on every row (D-0044).
- If rule 14's text should carry points 2, 4 and 6, that is a one-ticket doc follow-up, not a behaviour change.

## Revisit when
- D-0026's own trigger fires (enough RIR data, or users edit the pre-filled weight on more than 30 % of sets).
- Users on bodyweight-only equipment ask for weighted progression (point 2 then needs a load input, not a rep cap).
- A loaded lift's `reentry`/`deload` floor of one increment turns out to be too heavy after a long layoff (point 4).
