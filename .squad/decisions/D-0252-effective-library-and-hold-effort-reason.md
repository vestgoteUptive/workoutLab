---
id: D-0252
title: "Engine inputs for RIR and own steps: HistorySet.rir optional, the user's step travels as LibraryExercise.incrementKg in an effective library built by the web layer, prefill's signature is unchanged, new prefill reason kind hold_effort"
status: revisit
date: 2026-11-20
by: product-owner (idea mode, owner request 2026-11-20)
area: engine
builds-on: D-0250, D-0251, D-0026, D-0131
---
## Context
Principle 3: the engine is pure. RIR and the user's step must reach it as plain inputs.

## Decision
1. `HistorySet` gains `rir?: number | null` (absent is null). A value outside 0-5 or not an integer is treated as null; history rows never make the engine throw.
2. The user's step replaces `incrementKg` in the library rows passed to every engine call (`suggest`, `prefill`, `applySwap`, `insertItem`, `rankSwaps`). No new parameter. `prefill.ts` and `session.ts` (back-off floor) then use one step.
3. The rule 10 `prefill` kind list gains `hold_effort` (no extra fields). The UI turns it into words.
4. No other engine output changes.

## Consequences
Engine ticket T-0952 (types, rule 14 and rule 10 text, examples, simulated histories, re-vendor `supabase/functions/_shared/vendor/**`). Web tickets T-0953 (history mapper passes `rir`) and T-0954 (effective library).

## Revisit when
Another engine input needs the same per-user library overlay (then name it a first-class `userLibraryOverrides`).
