---
id: D-0235
title: "UF-08.2: a UF-08.3 swap survives later re-suggests — the swap-in becomes a pin (or the main lift) and the swapped-out exercise is excluded for the visit (T-0935)"
status: decided
date: 2026-11-13
by: human (bug report), written up by orchestrator
area: product
amends: D-0109, D-0205
---
## Context
The human (2026-11-13): "If I first replace one exercise with another and then try to add a new one, the exercise list is reverted to its initial suggestion."

Cause: `SessionSetup.tsx` applies a UF-08.3 swap to the shown `Workout` only. The visit record keeps no trace of it. Add, Shuffle, a time chip and "Start with this" all call `suggest` again with `pinnedIds = addedIds` and `mainLiftId` from the plan, so the engine picks the swapped-out exercise again and the swap-in disappears. D-0205 named this as its own revisit trigger ("A UF-08.3 swap being dropped by an Add re-suggest confuses people (then the visit's swap-ins become pins)"). The trigger has now fired.

## Decision
1. **A swap of a non-main item** adds the swap-in to the visit's `addedIds` (it becomes a pin, taking the old id's place if that was pinned) and appends the swapped-out id to the visit's `excludeIds`, which is the same session-only list Remove uses (D-0191 §4). It is not written to the stored excluded list. "Don't suggest again" keeps its own behaviour (D-0199).
2. **A swap of the main lift** needs no pin. `applySwap` already sets `plan.mainLiftId` to the swap-in, and every re-suggest passes it. The swapped-out lift is still excluded for the visit.
3. Pins behave as they do for Add (D-0205): Shuffle never touches them, and a time chip may drop one that no longer fits, silently, as the engine does today. A swap-in counts towards the 8-item and per-area caps, the same as an added exercise.
4. Adding the swapped-out exercise back through UF-08.5 removes it from the visit's `excludeIds`, as Add already does.
5. Everything stays per visit. Back to UF-08.1 discards it all (D-0109 §1 unchanged).

## Consequences
- web UF-08: T-0935. The existing test "a UF-08.3 swap of an added item takes it off the pins" changes: the swap-in now replaces the old id in the pins.
- No contract change. The engine and its rules are unchanged.

## Revisit when
People want a swap to be undone by Shuffle, or swap-ins should outlive the visit.
