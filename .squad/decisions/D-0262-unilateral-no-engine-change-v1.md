---
id: D-0262
title: "One side at a time: no engine change in v1; the time model keeps 45 s work per set and under-estimates a flagged set by about 45 s (parked as T-0978)"
status: revisit
date: 2026-11-20
by: product-owner
area: engine
supersedes: null
builds-on: D-0260, D-0024
---
## Context
Rule 7.1 prices a non-timed set at 45 s work plus rest. A one-side-at-a-time set takes about two sides of work plus one rest, so the plan is short by about 45 s per flagged set (about 2 min 15 s for 3 sets).

## Decision
1. **No engine change in v1.** `packages/engine` does not read `unilateral`; rules 7.1, 14 and 15, balance and e1RM are unchanged, so nothing is re-vendored and no worked example moves. A test pins that a flagged and an unflagged row cost the same.
2. The under-estimate is accepted and stated in the spec. Principle 2 is bent by at most about 15 % on a 30-minute plan with two flagged rows; the label (the cause of wrong logs) ships first.
3. **Parked follow-up (T-0978, `idea`):** doubling work per set for a flagged row (timed: twice the planned duration) in rule 7.1, with examples and a re-vendor. Start it when real overruns justify it.

## Consequences
Plans with flagged rows can run a little long. Status `revisit` because the default trades time honesty for scope.

## Revisit when
Users report workouts overrunning the chosen time, or any engine ticket reopens rule 7.1.
