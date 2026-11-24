---
id: T-1021
title: "Engine: 'Start with this' on UF-08.6 makes the chosen exercise the main lift locally, without a suggest() rebuild that can drop the user's set edits in other areas"
lane: engine
screens: [UF-08.6, UF-08.2]
decisions: [D-0205, D-0275, D-0288]
deps: []
status: ready
---
## Why
T-0997 build note: "Start with this" on the new area detail still calls `suggest()` once (D-0205 §5). In the areas-first flow (D-0274) that rebuild can change other areas and drop the user's − / + edits, which the area plan otherwise never does (one suggest per time chip only).

## Acceptance criteria
- AC1 A pure engine function (e.g. `setMainLift(plan, exerciseId, ctx)`) moves the chosen exercise to the main slot with main-lift sets/reps (rule 7.2 numbers), keeps every other item and its sets unchanged, and re-orders with `orderItems` (rule 7.6).
- AC2 Refuses with a reason when the exercise is not a compound, not admissible, or the main-lift set count does not fit the time left; the plan is unchanged.
- AC3 docs/engine-rules.md documents it with examples; simulated-history tests (zero history, 10 days off, budgets 15–120) show never over budget and determinism; vendor re-run.
- AC4 `suggest()` output unchanged.

## Paths you may change
- `packages/engine/**`, `docs/engine-rules.md`, `supabase/functions/_shared/vendor/**` (via `vendor.mjs`)

## Contract impact
`docs/engine-rules.md` (new rule) under a decision the builder records.

## Definition of done
Every AC has a test · full suite (engine is a shared path, D-0285) · commit messages start with `T-1021`. The web switch-over is a one-line change in the UF-08 stack (T-0998 or T-1009) after this merges.

## Build / accept log
