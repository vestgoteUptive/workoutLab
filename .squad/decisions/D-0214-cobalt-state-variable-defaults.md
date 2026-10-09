---
id: D-0214
title: "Cobalt state-variable defaults D-0211 left open: plan progress-off = plan.raise, sheets in lift/rest use plan.scrim, paper raise = paper.line, paper selected = paper.action, lift/rest keep the legacy coverage ramp"
status: revisit
date: 2026-10-09
by: orchestrator (T-0589 code review)
area: design
amends: D-0211
---
## Context
T-0589 maps tokens to the generic `--wl-*` state variables in `apps/web/src/main.css`. D-0211 doesn't name five of those mappings. The builder picked defaults, and code review asked for them to be recorded. Review also found that two of them went against the sources.

## Decision
1. **Plan `--wl-progress-off` is `plan.raise`.** The README calls plan.raise the "empty bars". It is decorative only (D-0211 §4). The builder's `plan.line` was changed to this.
2. **Lift and rest `--wl-scrim` is `plan.scrim`.** D-0211 §5 says sheets use the plan sheet, so the scrim follows. The builder's own-bg default was changed to this.
3. **Paper `--wl-raise` is `paper.line`, and paper `--wl-selected` is `paper.action`.**
4. **Lift and rest inherit the legacy coverage ramp.** No lift or rest screen shows coverage. Revisit this if one does.

## Revisit when
- A lift or rest screen shows coverage or progress-off in a way the owner reviews.
- The screen tickets nest a non-plan sheet. `html:has()` picks the state by CSS source order, while theme-color takes the outermost `[data-screen-id]`, and the two only agree while nested sheets are plan (T-0589 review).
