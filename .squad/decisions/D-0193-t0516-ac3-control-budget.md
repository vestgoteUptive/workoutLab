---
id: D-0193
title: "T-0516 AC3 (R6-E5): the avoidAreas: [] control runs at budgetMin 75, because at 45 the R6-E2 history gives no quads or glutes item"
status: revisit
date: 2026-10-06
by: engine-dev (T-0516)
area: engine
builds-on: D-0191
---
## Context
T-0516 AC3 asks for 6 hard back-squat sets at `now − 49 h` (R6-E2, nothing recovering), `budgetMin 45`:
with `avoidAreas: [quads, glutes]` no item has quads or glutes at weight 1.0, and with `avoidAreas: []`
"at least one item does". The second half is false on the engine as specified: those sets give quads
and glutes r = 0.3 while seven areas sit at 0, so at 45 min (warm-up on or off) the plan is
bench-press, inverted-row, calf-raise, overhead-press and a back accessory. The first quads item
(leg-extension) appears at `budgetMin 60` with warm-up off and at `budgetMin 75` with warm-up on.
The AC's numbers were groomed without a run; the rule (D-0191 §2) is not in question.

## Decision
R6-E5 / the AC3 test keeps the avoided half at `budgetMin 45` exactly as written, and runs the
avoided/control pair again at `budgetMin 75` (F-input otherwise, warm-up on). There the control has
leg-extension × 3 and the avoided run has no quads or glutes item, so the input is shown to cause the
difference. `docs/engine-rules.md` R6-E5 states both budgets.

## Consequences
No rule changes. The test is not weakened: it asserts the AC's avoided case at 45 and a control
that genuinely contains the avoided areas.

## Revisit when
The product owner wants the AC3 control at a different fixture (for example legs sets further back).
