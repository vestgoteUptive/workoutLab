---
id: T-0516
title: "UF-08.1: engine SessionInput.avoidAreas, a per-workout skipped area that suggest treats like a recovering area (rule 6.1, GitHub #33)"
lane: engine
screens: [UF-08.1, UF-08.2]
decisions: [D-0191, D-0024, D-0027, D-0037]
deps: []
status: ready
groomed: 2026-10-06
---
<!-- Groomed 2026-10-06 by product-owner from GitHub #33 (D-0191 §2-§3). Build flow:
wl-build-engine. About ⅓ day. Runs before T-0519: both change packages/engine and
docs/engine-rules.md. -->

## Why
GitHub #33: the owner was sore from legs and couldn't keep legs out of today's workout. There is no
area input for a workout (D-0191 Context), and principle 3 forbids a UI-side filter, so the choice
has to be an engine input. The engine already has the right behaviour for recovering areas (rule
6). This ticket lets the caller name extra areas to treat that way.

## Scope
- In:
  - `SessionInput.avoidAreas?: readonly Area[]` in `packages/engine/src/types.ts`. Absent means
    `[]`. An unknown area is a `RangeError`, and duplicates are ignored.
  - `suggest` (rules 7.2 and 13) applies rule 6.1 exactly as D-0191 §2 states it.
  - Write rule 6.1 and the examples below into `docs/engine-rules.md` (this lane owns the contract,
    and D-0191 §3 names the change). Add `avoidAreas` to the rule 0 input list and to F-input
    ("no main/pinned/excluded ids, no avoided areas").
- Out: `rankSwaps` / `applySwap` (D-0191 revisit), openapi (T-0517), the Edge Function (T-0518),
  any UI (T-0520). There are no new reason codes.

## Acceptance criteria
Fixtures are the `docs/engine-rules.md` fixtures (F-profile, F-library, F-history = zero history).
`LEGS` = [glutes, quads, hamstrings, calves].
- AC1 (absent ≡ empty) Given the R7-E4 inputs, When `suggest` runs with `avoidAreas` absent and
  again with `avoidAreas: []`, Then both results are deep-equal to each other and to R7-E4
  (bench-press × 4, inverted-row × 3, leg-extension × 2; 1545 s; `unusedS` 75).
- AC2 (legs skipped) Given the R7-E4 inputs with `avoidAreas: LEGS`, Then no item has glutes, quads,
  hamstrings or calves at weight 1.0, and the items start bench-press × 4 (main) and
  inverted-row × 3. The engine-dev writes the full resulting list and totals into rule 6.1 as
  **R6-E3**, and the test asserts that exact list.
- AC3 (sore legs, not recovering by rule 6) Given 6 hard back-squat sets at `now − 49 h` (R6-E2,
  so nothing is recovering) and `avoidAreas: [quads, glutes]`, When `suggest` runs at `budgetMin 45`,
  Then no item has quads or glutes at weight 1.0. With `avoidAreas: []` and the same history, at
  least one item does (the control proves the input caused the difference).
- AC4 (mainLiftId ignored) Given `mainLiftId: "bench-press"` and `avoidAreas: [chest]` at
  `budgetMin 30`, Then bench-press is not an item, the main lift (if any) has no chest at weight 1.0,
  and `plan.mainLiftId` ≠ "bench-press".
- AC5 (shuffle) Given the R13-E1 inputs (n = 1) with `avoidAreas: LEGS`, Then no shuffled slot has a
  LEGS area at weight 1.0, and for n = 0..6 every result has Σ item costs ≤ `available`.
- AC6 (everything skipped) Given `avoidAreas` = all nine areas, Then `items` is `[]`,
  `plan.mainLiftId` is null and `itemsTotalS` is 0.
- AC7 (validation) Given `avoidAreas: ["legs"]`, Then `suggest` throws `RangeError`. Given
  `avoidAreas: [chest, chest]`, Then the result is deep-equal to `[chest]`.
- AC8 (gap fit counts an avoided area 0) Given the R7-E4 inputs with `avoidAreas: [core]`, Then
  the second item is barbell-row × 3, not inverted-row. In R7-E4, inverted-row's gap fit (1.917)
  beats barbell-row's (1.417) only through its core .5. With core counted 0 both are 1.417, and id
  ascending picks barbell-row. Write this into rule 6.1 as **R6-E4**.
- AC9 (simulated history, DoD) Over every simulated 14-day history in the engine suite and every
  `budgetMin` 15..120 step 5, with `avoidAreas` = LEGS and = [chest, back], Then R7-E8 holds and
  no item has an avoided area at weight 1.0. `suggest` stays deterministic: two runs are deep-equal.
- AC10 (purity) The lint rule for `Date.now`/`Math.random` stays green, and inputs are not mutated.

## Paths you may change
`packages/engine/**`, `docs/engine-rules.md` (contract, D-0191 §3).

## Contract impact
`docs/engine-rules.md`: new rule 6.1 and R6-E3+, D-0191 §3. `api/openapi.yaml` follows in T-0517.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0516` and cite UF-08.1.

Per-package commands: write one command per script — `pnpm --filter <pkg> typecheck`, then a
separate `… lint`, then a separate `… test`. Listing several script names after one `--filter`
runs only the first; pnpm passes the rest to it as plain CLI arguments, so they never run.

## Build / accept log
Archived in `docs/tickets/log/T-0516.md` (D-0157).
