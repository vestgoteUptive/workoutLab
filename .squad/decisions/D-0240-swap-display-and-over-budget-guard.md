---
id: D-0240
title: "UF-08.2 swap display (T-0935) and the over-budget guard in suggested mode (T-0943): swap-outs stay off the Removed line, swap-ins aren't labelled 'Added by you', a dropped swap-in is named, and an over-budget plan refuses Add/Start with this/Shuffle"
status: decided
date: 2026-11-13
by: orchestrator (human said "implement all"; recommended defaults)
area: product
amends: D-0235, D-0239
---
## Context
T-0935 implemented D-0235 and had to make two display choices that D-0235 left open. Triage of the empty-start spec (D-0239) left one follow-up, T-0943: in suggested mode, after a swap confirmed with `fitsBudget: false`, the next Add re-suggests and the engine silently drops the swap-in pin.

## Decision
1. **Swap-outs are not removes.** The UF-08.2 "Removed" line lists only exercises the user removed. A swapped-out exercise is excluded for the visit (D-0235 §1) but not listed there.
2. **Swap-ins aren't labelled "Added by you".** They are pins for the engine and count towards the caps, but the row keeps its swap reason (T-0303c).
3. **A dropped swap-in is never silent.** If a time chip drops a swap-in, the "Doesn't fit in {n} min: {names}." line (D-0205) names it, like a dropped added exercise. This supersedes the silent drop in D-0235 §3. T-0943 implements it.
4. **The over-budget guard in suggested mode** extends D-0239 §13.1 to suggested mode. While the plan is over budget, a UF-08.5 Add or "Start with {name}" is refused on the sheet. A row's "Start with this" or Shuffle is refused in the UF-08.2 status line. Both use "Your workout is {over} min over. Remove or swap an exercise first." Time chips still re-run, as in point 3.

## Consequences
T-0943 becomes ready after T-0935 and T-0940, because it reuses T-0940's copy. T-0935 ships with points 1 and 2.

## Revisit when
People find the over-budget refusal blocking rather than helpful.
