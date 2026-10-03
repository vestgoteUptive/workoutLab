---
id: T-0362
title: "UF-11.3 Edit plan: a product decision on the D-0070 §3 save-order window (targets written, profile not). Closed by D-0166: no change in v1"
lane: product
screens: [UF-11.3, UF-11.2, UF-11.1]
decisions: [D-0166, D-0070, D-0081]
deps: [T-0308b]
status: done
---
<!-- Groomed and closed 2026-10-03 by product-owner. Decision only: no build, no implementation ticket. -->

## Why
T-0308b's review found that on "(1) ok, (2) fails" UF-11.3 Save leaves `area_targets` with the new
numbers (`From your plan`) and `profiles` with the old goal/rhythm/priorities, so UF-11.2 shows
targets that don't match their inputs. The code follows D-0070 §3, and AC-B12 pins the split.
The question was whether v1 should close the window.

## Scope
- In: the decision (D-0166).
- Out: any code, contract or spec change.

## Acceptance criteria
- AC1 Given D-0166 is `revisit` and cites D-0070 §3, When the board is groomed, Then T-0362 moves
  to `done` with no implementation ticket. The existing `features/UF-11/__tests__/save-plan.test.tsx`
  AC-B12 tests (the split state after a step-2 failure, and the retry re-running from step 1)
  stay unedited as the encoded behaviour.

## Paths you may change
- `docs/tickets/T-0362-uf11-save-order-window.md`: this file.

## Contract impact
None. The trigger for a transactional `save_plan`/`accept_plan` function, and the contract change
it would need, are in D-0166 Revisit / Consequences.

## Definition of done
D-0166 filed · `check-all` green · the board row moves to `done` (orchestrator).

## Build / accept log
Archived in `docs/tickets/log/T-0362.md` (D-0157).
