---
id: D-0227
title: "UF-05.1 Swap opened from UF-09.9 Pause sets theme-color to plan.bg (not lift.bg) until Pause has a state; T-0602 AC1 amended"
status: revisit
date: 2026-10-12
by: orchestrator (T-0602 review)
amends: T-0602 AC1
builds-on: D-0210, D-0216
---
## Context
T-0602 AC1 said that opening Swap mid-workout keeps the root in lift and leaves theme-color at lift.bg. That can't happen inside the UF-05 lane: UF-09 replaces its screen root with the overlay, so UF-05.1 becomes the only `[data-screen-id]`. UF-09.9 Pause also has no `data-wl-state` until T-0598. theme-color follows the outermost `[data-screen-id]` (T-0589), so it becomes plan.bg.

## Decision
1. While the Swap sheet is open from Pause, theme-color is plan.bg. The e2e asserts this.
2. The sheet itself is plan, inside any host (T-0630 keeps plan type in lift or rest roots).

## Revisit when
T-0598 gives UF-09.9 Pause a state, or UF-09 keeps its root under the overlay. AC1's original lift.bg expectation can then be restored.
