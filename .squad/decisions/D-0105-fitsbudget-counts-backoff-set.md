---
id: D-0105
title: "rankSwaps fitsBudget on a back-off slot counts the back-off set applySwap re-adds, so fitsBudget is exactly applySwap(…).itemsTotalS ≤ available (supersedes D-0056 §3 in part)"
status: revisit
date: 2026-10-02
by: product-owner (groom T-0226)
area: engine
builds-on: D-0056 §3, D-0093 §2 and §5, D-0092, T-0224 AC12
supersedes: D-0056 §3 (the fitsBudget formula only; timeCostS is unchanged)
---
## Context
D-0056 §3 defines `fitsBudget` as
`session.itemsTotalS − slot.costS + timeCostS ≤ availableS(budgetMin, warmupInBudget)`, with
`timeCostS = itemCostS(candidate, slot.sets)`. D-0093 §2 then has `applySwap` rebuild a slot that had
a High-energy back-off with a new back-off, so the new item costs `timeCostS + setCostS(candidate)`
whenever the old slot had a back-off and the candidate is not timed.

`slot.costS` already includes the old back-off set, but `timeCostS` leaves out the new one. On a
back-off slot the formula is therefore one set cost (165 s for a compound) too optimistic.

On a fresh `suggest` result this never shows. The only back-off slot is the main lift, and the plan
leaves less than one set of slack, so both sides agree (T-0224 AC12 passes). It does show once the
plan is over budget, which D-0093 §5 allows after a `fitsBudget: false` accessory swap.

QA repro (T-0224 review): `balancedHistory`, `budgetMin 31`, warm-up off, energy high. Apply
leg-extension → back-squat, which gives `itemsTotalS` 1995 against `available` 1860. `rankSwaps`
on the main slot then marks bench-press and push-up `fitsBudget: true`, but `applySwap` gives
1995 > 1860. A sweep found 26 such mismatches. UF-05.1 and UF-08.3 would then show a "fits"
candidate that pushes the plan over the budget, which breaks principle 2.

## Decision
1. **`fitsBudget` counts the back-off set.** For a candidate `c` replacing slot `s` in `session`:
   `fitsBudget = session.itemsTotalS − s.costS + c.timeCostS + extra ≤ availableS(session.budgetMin, session.warmupInBudget)`.
   - `extra = setCostS(c)` at `c`'s planned duration (D-0092) when `s.backoff` is non-null and `c`
     is not timed.
   - `extra = 0` otherwise.

   This is the same condition under which `applySwap` sets a back-off (D-0093 §2). So for every
   candidate `rankSwaps` returns, `c.fitsBudget === (applySwap(session, s, c, …).itemsTotalS ≤ available)`.
   This holds for every session, over budget or not.
2. **One predicate.** The "this slot gets a back-off" test (old slot has a back-off, and the
   candidate has a non-null rep slot, meaning it is not timed) lives in one engine function, used by
   both `applySwap`'s item build and `rankSwaps`' `fitsBudget`. The two cannot drift.
3. **`timeCostS` is unchanged.** It stays `itemCostS(c, s.sets)` at the planned duration, without the
   back-off set (D-0056 §3, D-0092 §2). The `SwapCandidate` schema in `api/openapi.yaml` and its
   description are unchanged. The `short_on_time` sort order is unchanged, because `extra` is the
   same 165 s for every non-timed candidate of a compound main slot. T-0224 AC12's "costS =
   timeCostS plus one set cost with a back-off" still holds.
4. **No other caller changes.** Rule 13's shuffle calls the ranking with an always-true fit (its
   own fit check runs before energy, so no shuffled slot has a back-off). Every `suggest` result is
   byte-identical. On a slot without a back-off, `fitsBudget` is the D-0056 §3 value, so R12-E1…E5
   and R12-E11 are unchanged.
5. **Contract text (engine lane).** `docs/engine-rules.md` §12.1 gains one `**fitsBudget**`
   bullet stating §1, citing D-0105, and one worked example **R12-E12**. It goes in §12.1, not
   the rule 12 intro, because T-0204's and T-0224's guards pin rule 12 up to R12-E5 against
   `main` (D-0092 §6). Add one Traceability row. No other line changes.

## Consequences
- engine (T-0226): implements §1–§2 in `src/swaps.ts`, with the shared predicate exported from
  wherever `applySwap`'s back-off condition lives. It also makes the §5 text edit.
- web (T-0306b SwapSheet, T-0303c): no change. They render `fitsBudget` and `timeCostS` as
  returned. A "fits" chip is now never followed by an over-budget plan.
- backend: the vendored engine is regenerated at merge (D-0053 §1).

## Revisit when
- The UI needs to show the cost the swap will actually add on a back-off slot. Then either
  `timeCostS` includes the back-off set (an `api/openapi.yaml` description change), or a new field
  is added.
- A back-off can sit on a non-main slot, or a timed exercise can get a back-off (D-0047).
