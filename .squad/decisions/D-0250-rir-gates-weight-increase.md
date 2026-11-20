---
id: D-0250
title: "Rule 14 uses RIR for the weight increase only: top of the range with the lowest RIR at the top weight below 2 holds the weight (hold_effort), at most once in a row; no RIR means today's behaviour; breaks, deload and rep steps are unchanged"
status: revisit
date: 2026-11-20
by: product-owner (idea mode, owner request 2026-11-20)
area: engine
amends: D-0026
builds-on: D-0057, D-0062, D-0137
---
## Context
D-0026 (decided, confirmed in D-0061) says "RIR is logged but not used in v1" and reopens when there is enough RIR data. The owner asked on 2026-11-20 to use RIR, inspired by wger: increase only when the top of the range was hit with RIR >= 2, hold at RIR 0. No earlier decision rejected RIR on the merits. RIR is optional on UF-09.4, so many sets have none.

## Decision
1. Rule 14 step 4 gets a gate and a sibling step 4b (spec `docs/specs/rir-progression-and-increments.md`). `rirMin` is the lowest non-null `rir` among the hard sets at `W` in the last session. `effortOk` = no RIR logged, or `rirMin >= 2`. `heldOnce` = the session before the last has the same `W` and every set at `W` has reps >= high.
2. Step 4: every set at `W` >= high and (`effortOk` or `heldOnce`): `W + inc`, low reps, `increase`. Step 4b: >= high, not `effortOk`, not `heldOnce`: `W`, high reps, new reason `hold_effort`.
3. Unchanged: steps 1-3 (a break beats RIR), 5-7, bodyweight (no weight to hold), timed (no RIR). Only the weight increase is gated; `add_rep` is not.
4. Null RIR is no signal: absent `rir` everywhere gives today's output for every R14 example and simulated history.
5. This amends only the "RIR not used in v1" clause of D-0026; D-0026's other rules stand.

## Consequences
Engine ticket writes rule 14 text, examples R14-E10+ and simulated histories (T-0952).

## Revisit when
Fewer than about a third of sets carry RIR (then a nudge on UF-09.4 is worth a spec), or users hit `hold_effort` twice in a row often (the `heldOnce` escape is wrong).
