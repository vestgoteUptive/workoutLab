# Recommendation engine rules (v0 — all numbers are tunable defaults)

The engine is a pure function:
`suggest(history, targets, profile, session_input, now) -> Workout`

## 1. Exercise → area mapping
Each exercise has area weights: primary = 1.0, secondary = 0.5.
Example: back squat → quads 1.0, glutes 1.0, hamstrings 0.5, core 0.5.

## 2. Hard sets
A logged set counts as hard if not marked as warm-up. Area load for one set = area weight.

## 3. Rolling window
`load(area) = Σ weighted hard sets in the last 14 days` (no decay in v0; test a light recency weighting later).

## 4. Targets
Per-area targets are hard sets per 14 days, derived from goal + level + rhythm in onboarding.
Starting defaults: large areas (back, quads, glutes, chest) 20, medium (shoulders, hamstrings) 16, small (arms, core, calves) 12. Priority areas get +25 %.

## 5. Deficit and attention
`deficit(area) = max(0, target - load) / target`
An area "needs attention" when deficit ≥ 0.5 and fewer than ~40 % of the window's days remain to catch up.

## 6. Recovery
Skip an area as primary if it received ≥ 6 weighted hard sets in the last 48 h.

## 7. Time budget
Estimated time per set = work 45 s + rest (compound 120 s, isolation 60 s). Add 60 s transition per exercise.
Warm-up: pending decision (see PRD open questions).
Selection: greedy. Pick the area with the highest remaining deficit, pick the best available exercise for it (equipment, level, not done in the last session if possible), assign 2–4 sets, update the remaining deficits, repeat until the budget is used. Never exceed the budget.

## 8. Running over time (UF-06.2)
If the elapsed + remaining estimate exceeds the budget, drop sets from the lowest-deficit areas first, then remove whole exercises.

## 9. Adaptive targets (UF-09)
Every 14 days: if the user completed < 70 % of planned sessions twice in a row, propose a lower rhythm. If > 110 %, propose a higher one. Always ask; never change silently.

## 10. Explanation
Each suggestion carries machine-readable reasons (e.g. `{area: "hamstrings", deficit: 0.62}`), which the UI or an optional LLM turns into a sentence.

## Required tests
- Unit tests per rule
- Simulated histories: balanced, all-chest-no-legs, returning after 10 days off, 15-minute budget, 90-minute budget
