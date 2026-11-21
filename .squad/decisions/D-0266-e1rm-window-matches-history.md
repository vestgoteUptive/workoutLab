---
id: D-0266
title: "UF-06.2: the estimated-1RM chart uses the screen's existing window (today−55 to today, D-0034 §3), so the chart and the session rows always agree; this clarifies D-0254/D-0258's '56 days'"
status: decided
date: 2026-11-21
by: orchestrator (T-0963 build)
area: product
amends: D-0254, D-0258
---
## Context
T-0963 AC10 says a session "56 days old is plotted and 57 is not". UF-06.2 already shows sessions from today−55 to today, which is 56 calendar days including today (D-0034 §3).

## Decision
The chart, the table and the delta use exactly the session rows' window: local dates from today−55 to today. A session dated today−56 is outside the window and is not plotted. AC10 reads "inside the 56-day window" in that sense.

## Revisit when
The history window changes.
