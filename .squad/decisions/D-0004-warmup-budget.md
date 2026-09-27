---
id: D-0004
title: Warm-up counts in the time budget by default
status: decided
date: 2026-09-27
by: orchestrator
area: engine
---
## Decision
Follow v2 UF-08.1: a toggle, default on. The warm-up is 4 moves × 40 s plus 20 s get-ready, about 3 min. It is generated for the session's primary areas. Warm-up sets never count as hard sets (engine rule 2).

## Consequences
Engine rule 7 is updated. When the toggle is on, the warm-up time is subtracted from the budget before exercises are selected.
