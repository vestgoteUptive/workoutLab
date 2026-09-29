---
id: D-0059
title: Swap ranking and shuffle (T-0204 build) — recovering filter in rankSwaps, excludeIds in the shuffle pool, missing library row throws
status: decided
date: 2026-09-29
by: product-owner (T-0204 accept), recording engine-dev build defaults
area: engine
---
## Context
The T-0204 build (rules 12 and 13, D-0056) had to settle three points that neither `docs/engine-rules.md`, D-0025 nor D-0056 decide. The engine-dev chose defaults during the build; code review and QA accepted them. This record makes them traceable.

## Decision
1. **(a) `rankSwaps` drops recovering candidates.** A candidate with a recovering area (rule 6) at weight 1.0 is never returned by `rankSwaps`, for any reason. T-0204 AC10 requires this. The rule 13 shuffle builds its list from `rankSwaps(original, "variety", …)` (D-0056 §10), so a recovering candidate never reaches the shuffle. **D-0056 §9's "reject a pick with a recovering area at weight 1.0" is therefore covered by the AC10 filter.** The explicit check inside the shuffle is unreachable code: it stays as a guard, and mutation testing reports it as an equivalent mutant. The AC19 recovering test asserts the behaviour end to end.
2. **(b) The shuffle pool excludes `sessionInput.excludeIds`.** `rankSwaps` has no `excludeIds` input (D-0056 §2, the caller filters). Inside `suggest` the caller is the engine, so the shuffle removes every id in `excludeIds` from the `variety` ranking before it computes `len` and `n mod len`. A shuffle can never bring back an exercise the user excluded. Tested in `packages/engine/test/t0204-qa-mutation-gaps.test.ts`.
3. **(c) A current exercise missing from the library throws.** If `currentExerciseId` is an item in `session.plan.items` but has no row in `library`, `rankSwaps` throws `RangeError`, the same as the D-0056 §2 "not a plan item" case. Without a row there is no `Σ w_cur`, so `muscleMatch` has no meaning. There is no test yet (the AC11 `no-such-id` case fails the plan check first). A follow-up adds one.

## Consequences
- engine: a follow-up adds a test for (c): a plan item whose id is missing from `library`.
- D-0056 §9: at its revisit, note that the recovering half is enforced by `rankSwaps` (this decision, point 1). Only the "more than 2 primary items" half is shuffle-specific.
- web (T-0303, T-0306): when excluded exercises are hidden in UF-08.2 they also drop out of Shuffle, so the UI needs no extra filtering.

## Revisit when
- Rule 6 recovery gets softer, e.g. a recovering area is allowed at reduced volume. Then `rankSwaps` might return recovering candidates flagged instead of dropped, and the §9 check in the shuffle would become live.
- `rankSwaps` gains an `excludeIds` input (e.g. for UF-05.1 mid-session swaps).
- The library becomes user-editable and a plan can outlive its exercise row. Then (c) may need to degrade gracefully instead of throwing.

## Confirmed
Confirmed by the human 2026-09-29 (D-0061). It reopens only through its own "Revisit when" trigger.
