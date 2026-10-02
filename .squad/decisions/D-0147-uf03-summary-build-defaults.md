---
id: D-0147
title: "UF-03.3 summary defaults: null plan shows, no-targets partial summary, non-finite duration is unreadable, 'Go to Today' copy"
status: revisit
date: 2026-10-02
by: orchestrator (from the T-0419 review)
area: web
builds-on: D-0142 §4, D-0068 §1
---
## Context
T-0419 built UF-03.3 Summary content. D-0142 §4 fixes the states (not on this device, still running,
ended) but leaves four visible behaviours open. The builder chose them in its build log; the review
asked that they be recorded as a decision, since a build log can't settle visible behaviour.

## Decision
1. A session row whose plan is null (`parseSessionPlan` ok) is shown like any other row, because no
   summary number depends on the plan. Only a plan that fails `parseSessionPlan` counts as "This
   workout isn't on this device".
2. When the cached targets don't hold all nine areas, an ended summary shows Time, budget,
   Exercises, Sets and "See balance", and leaves out the before → after rows and "Next up". Any
   other error while computing the summary is not swallowed.
3. A row whose `ended_at − started_at` isn't a finite number is unreadable, so it shows "This
   workout isn't on this device". A negative duration reads 0 min.
4. The link on the not-on-device state reads "Go to Today" and points to `/`.

## Consequences
- T-0419 gets direct tests for (1), (2) and a tombstoned set, each with its pair, and narrows its
  catch to the missing-targets case.

## Revisit when
- UF-03.3 gets a real design pass, or targets can legitimately be partial.
