---
id: D-0024
title: Session building — library is an engine input, main lift first, greedy by lowest projected coverage, fixed set/rep slots, warm-up generator, energy modifiers, UF-09.8 time check
status: revisit
date: 2026-09-27
by: product-owner (T-0101)
area: engine
---
## Context
Gap B4: engine rule 7 had no main-lift concept, no warm-up generator (D-0004 only fixed its length), no energy modifiers (UF-08.1), no tie-breaks, and "assign 2–4 sets" was not deterministic. Rule 8 cited the v1 ID UF-06.2 and did not define "behind" or the three UF-09.8 options. None of it could be tested with fixed inputs.

## Decision
This decision names the change to `docs/engine-rules.md` rules 0, 7, 8 and 10.
- **Signature:** `suggest(history, targets, profile, library, sessionInput, now, tz)`. The exercise library is an explicit input, and there is no hidden global state.
- **Time model:** a set takes work + rest. Work is 45 s, or the target duration for timed sets. Rest is 120 s for compounds and 60 s for isolation. Each exercise adds a 60 s transition. The warm-up takes 180 s and is subtracted only when `warmupInBudget` is on. When the toggle is off, the warm-up is still generated but not counted.
- **Main lift:** the first item. It is the top-ranked compound for the eligible area with the lowest projected coverage ratio (ties go by the fixed area order). It gets 4 sets, and falls back to 3 or 2 if 4 do not fit. It is never shuffled, never trimmed by Low energy or rule 8, and `sessionInput.mainLiftId` keeps it when the time changes.
- **Greedy:** after the main lift, repeat. Take the eligible area with the lowest projected `load/target`. Try its ranked candidates at 3 sets, then 2. If none fits, the area is exhausted. Caps: 8 exercises per session, 2 per primary area. Candidate rank: not in the most recent session first, then gap fit `Σ w(a) × projectedDeficit(a)` descending, then id ascending.
- **Reps:** the main lift uses 6–8, other compounds 8–12, isolation 10–15. Goal and level do not change reps in v1.
- **Warm-up:** 4 moves (kind `warmup` in the library). Go round-robin over the session's primary areas in session order, taking the highest-weighted unused move for each. Fill with general (area-less) moves by id, then with any move by id.
- **Energy** (applied after selection): Low removes 1 set from every accessory that has 3, and leaves the freed time unused. Weights are unchanged. High adds 1 back-off set to the main lift at `floor(0.9 × weight)` to the increment, but only if its cost fits in the unused budget.
- **Time check (UF-09.8):** evaluated only between exercises. "Behind" means projected (elapsed + remaining estimate) − budget ≥ 60 s. The three options are Continue (unchanged), Trim (rule 8 cuts) and Skip next exercise. Rule 8 cuts one set at a time from not-started accessories with more than 2 sets. It starts with the lowest session-start deficit (ties go to the later item first), then removes whole accessories in the same order.

## Consequences
T-0201 implements and tests rules 7, 8 and 10 using the worked examples R7-E*, R8-E*. content (T-0103) adds warm-up moves, `increment_kg`, `default_duration_s` and the equipment vocabulary. data (T-0100/T-0102) stores `warmup_in_budget` and the session plan with session-start deficits (needed by rule 8).

## Revisit when
The first 20 real sessions show the greedy picking odd combinations, or users skip the main lift often.
