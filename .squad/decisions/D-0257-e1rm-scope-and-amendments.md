---
id: D-0257
title: "Estimated 1RM v1 scope: UF-06.2 only; the number stays off Today's Latest PR, UF-03.3 and UF-06.1; amends D-0068 (no e1RM or chart) and the 'never show the e1RM number' line of D-0219 for UF-06.2 alone"
status: revisit
date: 2026-11-20
by: product-owner
area: product
amends: D-0068, D-0219
builds-on: D-0254, D-0255, D-0256, D-0217
---
## Context
D-0068 cut e1RM and charts from UF-06 v1. D-0219 (H-36) ranks records by Epley but says a caller shows the actual set, never the e1RM number. The canvas mock rows 10 and 16 (UF-03.3 "Est. 1RM about 124 kg, up 3 kg", UF-06.2 "Est. 1RM chart") are deferred in D-0217. The owner now asks for the chart.

## Decision
1. **Reverses the UF-06.2 part of D-0068 §5 and row 16 of the mock deferral:** an e1RM card and chart are in. Streak, volume and the rest of D-0068's cuts stay out.
2. **Amends D-0219 narrowly:** the number may be shown on UF-06.2, labelled "Est." and "about". Today's "Latest PR" keeps showing the actual set. The reason is the same: the estimate is a guide, and a record is a fact about a set.
3. **Out of v1:** UF-03.3 and UF-06.1 placements (mock row 10), a range switch, history beyond 56 days, RIR adjustment, bodyweight-with-load, lb, targets or pre-fills derived from the e1RM, a chart library.
4. **Never in UF-08 or UF-09** (principle 1).
5. **Tickets:** engine (T-0961), design (T-0962), web (T-0963), user-flows and PRD (T-0964), e2e (T-0965).

## Consequences
- D-0068 and D-0219 gain "amended by D-0257" in the index.
- `docs/engine-rules.md` rule 15's last line in its Key bullet ("never the e1RM number") is narrowed by T-0961 to "on Today".

## Revisit when
- The owner wants the estimate on the workout summary or Progress overview, or a longer range.
