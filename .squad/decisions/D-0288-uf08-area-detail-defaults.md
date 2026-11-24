---
id: D-0288
title: "UF-08.6 area detail defaults: Not today takes the engine's first candidate even if it is homed in another area, Start with this keeps the D-0205 suggest path, Add's refusal minutes are the minutes left"
status: revisit
date: 2026-11-24
by: frontend-dev (T-0997)
area: web
builds-on: D-0274, D-0275, D-0276, D-0286, D-0287, D-0205
---
## Context
T-0997 built UF-08.6 from `UF-08.6.md`. Three details were open.

## Decision
1. **Not today is literally the first `equipment_taken` candidate** (D-0275 §8). D-0287 §4 homes an exercise in its first primary area, so the candidate can sit in another area (leg extension, Quads, gives back squat, Glutes). The screen follows the plan: if the area still has exercises the Not today line shows here (Undo works); if it has none, UF-08.2 opens with "{old} replaced by {new}." and focus on the area's row place. No candidate is skipped for its area.
2. **Start with this** keeps its D-0205 §5 path (one `suggest` call with `mainLiftId`), then the plan is `orderItems`-ed. It can therefore rebuild other areas; the local rule of D-0274 §5 applies to Add only, as the ticket says.
3. **"{name} doesn't fit in {n} min"** on UF-08.5 from UF-08.6 uses the minutes left (`unusedS`, rounded down), not the budget, because an Add is checked against what is left.
4. The Removed line of UF-08.6 lists the visit's removed ids whose first primary area is the screen's area; the line is derived, so a removed id of an area that was emptied and re-added reappears there.

## Consequences
None for contracts. T-0998 deletes the old exercise list; its Swap/Remove/Add tests move here (AC11).

## Revisit when
People find a Not today that leaves the area confusing (then prefer the first candidate in the same area), or Start with this must not touch other areas (then it needs an engine function).
