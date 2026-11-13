---
id: T-0936
title: "Engine: optional SessionInput `autoMainLift` / `fill` for empty-start planning (rule 7.2 steps 1 and 3), deep-equal when absent"
lane: engine
screens: [UF-08.2]
decisions: [D-0237, D-0239, D-0238, D-0236, D-0063]
deps: []
status: ready
---
## Why
Empty-start planning (`docs/specs/empty-start-plan.md`, D-0236) needs the plan to hold only what the user picked. Today `suggest` always picks a main lift when none is given (rule 7.2 step 1) and always fills the rest of the time (step 3), so "only the picks" can't be expressed, and emulating it with `removeItem` gives wrong set counts (D-0237). This ticket adds two optional booleans on the steps that already exist. No new ranking, reason code or function. Every result with the switches absent is deep-equal to today's (B18).

## Scope
- In:
  - `SessionInput.autoMainLift?: boolean` and `SessionInput.fill?: boolean` in `packages/engine/src/types.ts`, read in `packages/engine/src/session.ts` (and `warmup.ts` for the empty-items warm-up). Only `=== false` turns a switch off. A present value that isn't a boolean throws `RangeError`, like the other `SessionInput` checks. The switches are never copied into `Workout` (D-0239 §4).
  - `autoMainLift: false`: rule 7.2 step 1 makes no fallback main-lift choice. An explicit eligible `mainLiftId` is still placed as today.
  - `fill: false`: rule 7.2 step 3 (fill the remaining time) is skipped. The main lift (if any) and the pins are placed as today, with the caps and the time fit.
  - An auto main lift equal to a pin is placed once, as the main lift (D-0239 §4).
  - `docs/engine-rules.md` text (contract, D-0237 + D-0239 name the change): §0 input list; 7.2 step 1 (no fallback when `autoMainLift` is false) and step 3 (skipped when `fill` is false); 7.3 the warm-up when `items` is empty; a rule 13 note (shuffle with `fill: false` only changes what the fill would have picked, so it has no effect on items); examples R7-E31 onward, each with a traceability row in `packages/engine/test/rule-7-traceability.test.ts`.
  - Re-vendor: run `node supabase/scripts/vendor.mjs` and commit `supabase/functions/_shared/vendor/**`, or the root `node supabase/scripts/vendor.mjs --check` goes red (D-0239 §14).
- Out: openapi and the `/workouts/suggest` validator (T-0937, T-0938, deferrable); any UI; a new ranking rule or per-area ranked lists (D-0238 revisit).

## Acceptance criteria
Fixtures are the engine's (F-profile, L1). "R7-E4 inputs" = 30 min, warm-up in budget, energy `normal`, zero history, shuffle 0, no pins, no exclusions.

Switch semantics
- AC1 (B18) Given every existing engine example (all `R*-E*` ids in `docs/engine-rules.md` that call `suggest`), When `autoMainLift` and `fill` are absent, Then the result is deep-equal to the same call with both `true`, and to the committed expectation.
- AC2 (B18 widened, D-0239 §15) Given the R7-E4 inputs with `mainLiftId` bench-press, When `autoMainLift: false` and `fill` absent, Then the result is deep-equal to the same call without `autoMainLift`.
- AC3 (B18, new example R7-E31) Given the R7-E4 inputs with `autoMainLift: false`, `fill: false` and no pins, When `suggest` runs, Then `items` is `[]`, `mainLiftId` is null, `itemsTotalS` is 0, and `unusedS` is 1620 (available 1800 − 180 s warm-up); the warm-up follows the new rule 7.3 empty-items text.
- AC4 (B18) Given the R7-E4 inputs, When `autoMainLift` or `fill` is any present non-boolean (`"false"`, `0`, `null`, `1`), Then `suggest` throws `RangeError` naming the key. `undefined` is treated as absent.
- AC5 Given any input with the switches set, Then the returned `Workout` has no `autoMainLift` or `fill` key (checked with `Object.keys` on the result).

Examples (each gets an R7-E3x id and a traceability row)
- AC6 (B3, R7-E32 explicit main, nothing else) Given the R7-E4 inputs with `mainLiftId` bench-press, `autoMainLift: false`, `fill: false`, Then `items` is bench-press × 4 (main, 720 s) only, `itemsTotalS` 720 and `unusedS` 900.
- AC7 (B4, R7-E33 picks only) Given the R7-E4 inputs with `pinnedIds` [leg-extension], `autoMainLift: false`, `fill: false`, Then `items` is leg-extension only (not main), `mainLiftId` is null, and `unusedS` = 1620 − leg-extension's cost.
- AC8 (R7-E34 auto main equal to a pin) Given the R7-E4 inputs with `pinnedIds` [bench-press], `fill: false`, `autoMainLift` absent, Then bench-press appears exactly once, as the main lift (`isMain` true, first), and there are no other items.
- AC9 (R7-E35 caps on pins) Given the R7-E4 inputs at 60 min with `autoMainLift: false`, `fill: false` and `pinnedIds` [bench-press, db-bench-press, push-up] (L1's three chest-primary exercises), Then at most 2 items have chest as a primary area, the third pin is the one dropped (pin order), and nothing else is added.
- AC10 (R7-E36 suggestions call) Given the R7-E4 inputs with `pinnedIds` [leg-extension], `fill: true`, `autoMainLift: true`, Then leg-extension is in `items`, and every other item is one the engine would add after the pins (the D-0238 §3 order: main → pins → fill).

Simulated 14-day history tests (D-0239 §14; new file `packages/engine/test/rule-7-switches-histories.test.ts`)
- AC11 Given each of the 5 histories (zero, plus `SIMULATED_HISTORIES` balanced, allChestNoLegs, returningAfter10Days, offlineMerged), every `budgetMin` 15..120 step 5, warm-up on/off, energy low/normal/high and shuffle 0..6, When the switches are absent and when both are `true`, Then the two results are deep-equal.
- AC12 Given the same grid with `autoMainLift: false`, `fill: false` and no pins and no `mainLiftId`, Then `items` is `[]` in every case.
- AC13 (B15 engine side) Given returningAfter10Days at 30 min, When the user's picks are the R7-E30 items fed as `pinnedIds` with `mainLiftId` = R7-E30's main and both switches false, Then the items equal R7-E30's items (same ids, order, sets).
- AC14 (R7-E8 with switches) Given R7-E8's grid with `autoMainLift` and `fill` drawn at random per case from the seeded PRNG, Then Σ item costs ≤ `available`, ≤ 8 items and no area is primary for more than 2.
- AC15 (R0-E1) Given any of the above inputs with switches set, When `suggest` runs twice, Then the results are deep-equal.
- AC16 (B5 fits-by-construction property) For every budget 15..120 step 5, warm-up on/off, energy low/normal/high, over zero, balanced, allChestNoLegs and returningAfter10Days, and for every sequence of up to 8 suggestion taps (always the first row, and always the last row), where a tap simulates the web's two calls (spec table: suggestions call with `autoMainLift` true while `mainPickId` is null, `fill: true`; fallback call with `autoMainLift: false` when a plan id is missing from the first result; a "Main lift" row sets `mainPickId`, any other row is appended to `pinnedIds`; then the plan call with both false), Then no tap is refused (the new item, every earlier pick and the main lift are all in the plan result), Σ item costs ≤ `available`, ≤ 8 items and no area is primary for more than 2. It is seeded through the existing `test/fixtures/random.ts` mulberry32 harness and reports its seed on failure (D-0239 §14 asks for "a seeded fast-check property"; fast-check is not a dependency, and adding it would touch `pnpm-lock.yaml` in the infra lane, so the existing seeded harness gives the same guarantee).

Vendor
- AC17 Given the change, When `node supabase/scripts/vendor.mjs --check` runs, Then it exits 0 (the vendored copy is committed).

Checklist (D-0197 §7): switches absent vs present are both covered (AC1–AC2 vs AC3–AC16); empty vs non-empty pins are both covered (AC3, AC12 vs AC7–AC9); zero vs returning history (AC11–AC13, AC16).

## Paths you may change
`packages/engine/**`, `docs/engine-rules.md`, `supabase/functions/_shared/vendor/**` (regenerated by `node supabase/scripts/vendor.mjs` only, never hand-edited)

## Contract impact
`docs/engine-rules.md` — D-0237 (switches), D-0239 §4, §14, §15 (semantics, tests, B18 widened). openapi is untouched here (T-0937).

## Definition of done
Tests for every AC pass · the simulated 14-day history tests (AC11–AC16) pass · `pnpm -w typecheck lint test` green (includes `vendor.mjs --check`) · contracts unchanged or decision linked · commit messages start with `T-0936` and cite UF-08.2.

Per-package commands: write one command per script — `pnpm --filter @workoutlab/engine typecheck`, then a separate `… lint`, then a separate `… test`.
