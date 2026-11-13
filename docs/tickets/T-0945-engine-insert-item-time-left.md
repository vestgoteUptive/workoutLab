---
id: T-0945
title: "Engine: add one exercise to a workout in progress (sets, reps, weight and whether it fits) and work out how much time is left"
lane: engine
screens: [UF-09.10, UF-09.9]
decisions: [D-0244, D-0246, D-0243, D-0092, D-0105, D-0191, D-0096, D-0239]
deps: [T-0936]
status: todo
---
## Why
A mid-workout add (`docs/specs/add-exercise-in-session.md`) needs the engine, not the UI, to pick the set count, reps, pre-fill and cost and to decide whether the item fits (principle 3). `suggest` with pins is the wrong tool (D-0244 Context). This ticket adds two pure functions: `insertItem` (new rule 12.3) and `timeLeftS` (rule 8 extended), as amended by D-0246 §8–§14. Branch from `main` after T-0936 merges: it changes the same files, `engine-rules.md` §0 and the vendored copy (D-0246 §14, serial engine lane D-0096).

## Scope
- In: `insertItem(workout, exerciseId, {atIndex, leftS}, history, profile, library, now, tz)` → `{workout, sets}` or `{refused: "time" | "items_cap"}`; `timeLeftS(workout, {elapsedS, setsDone, skippedItems, warmupLeftS})` → integer (may be negative); exports from `packages/engine/src/index.ts`; rule 12.3 and the rule 8 paragraph (consistency condition and model limits) in `docs/engine-rules.md`, examples R12-E20+ and R8-E4+, the §0 purity list and the traceability table; re-vendor.
- Implementation notes (D-0246 §9): reuse `buildItem`, `repRange`, `prefillFrom`, `plannedDurationFrom` and the totals from `apply-swap.ts`; pass `swap: undefined` (never `null`), `previous = null` to `prefillFrom`, `backoff: false`; per-set cost is `perSetS` from `timecheck.ts`.
- Out: any web code, openapi or data-model change, a new reason code, the equipment/level/exclusion/recovery filters (they stay in the UI).

## Acceptance criteria
Fixture **P** (spec): F-tz, F-profile, F-goal, L1, `budgetMin 45`, warm-up in budget, energy normal; items bench-press × 4 (main, 720 s), inverted-row × 3 (555 s), leg-extension × 2 (270 s); `itemsTotalS` 1545, `available` 2520; empty history unless stated; `now` = `NOW`.

`timeLeftS` (rule 8)
- AC1 (R8-E4, B1) Given P with `elapsedS` 600, `setsDone` [2,0,0], `skippedItems` [], `warmupLeftS` 0, Then `timeLeftS` is 945.
- AC2 (R8-E5, B2–B4) Given AC1 with `budgetMin` 35, 32 and 30, Then the results are 345, 165 and 45.
- AC3 (R8-E6, B7) Given P with `elapsedS` 60, `setsDone` [0,0,0], `warmupLeftS` 120, Then 975.
- AC4 (R8-E7, B8) Given P with `setsDone` [4,3,1], `elapsedS` 1500, Then 1095.
- AC5 Given a skipped item, Then its cost is not subtracted; given `warmupInBudget` off, Then `warmupLeftS` must be 0.
- AC6 Given any of: a non-integer `elapsedS`, `elapsedS < 0`, `warmupLeftS` outside [0,180] or non-zero with `warmupInBudget` off, a negative or non-integer `setsDone[i]`, `setsDone.length ≠ items.length`, an out-of-range `skippedItems` entry, Then `RangeError`.
- AC7 (consistency, D-0246 §11) Given a point between exercises where no item at or after the next one has sets logged ahead and none is skipped, Then `timeLeftS = −timeCheck(...).behindS`. Given one later item with a set logged ahead (sibling), Then the test documents that the equality is not asserted.

`insertItem` (rule 12.3)
- AC8 (R12-E20, B1) Given P, AC1's state, `atIndex` 1, `leftS` 945, When lateral-raise is inserted, Then items are bench-press, lateral-raise × 3 (reps 10–15, pre-fill null × 10 `first_time`, `costS` 375, `isMain` false, `backoff` null, no `swap` key), inverted-row, leg-extension; `itemsTotalS` 1920, `totalS` 2100, `unusedS` 600; `mainLiftId` bench-press; `plan.version`, `warmup`, `startDeficits`, `sessionReasons`, `budgetMin`, `warmupInBudget`, `energy` unchanged.
- AC9 (R12-E21, B2) Given `leftS` 345, Then lateral-raise × 2 (270 s).
- AC10 (R12-E22, B3/B4) Given `leftS` 165, and given `leftS` 45, Then `{refused: "time"}` and no workout.
- AC11 (R12-E23, B5) Given `leftS` 945, When back-squat is inserted, Then back-squat × 3, reps 8–12, `isMain` false, `costS` 555, at index 1.
- AC12 (R12-E24, B6) Given energy low and `leftS` 945, Then lateral-raise × 2 with reasons in order `area_deficit`, `days_since`, `energy_low_trim`, `prefill`; with energy normal (sibling) the same order without `energy_low_trim`.
- AC13 (R12-E25, B8) Given P after bench-press and inverted-row, `atIndex` 3, `leftS` 1095, When biceps-curl is inserted, Then it is appended at index 3 as × 3.
- AC14 (R12-E26, B13) Given lateral-raise last logged 2026-09-17 at 10 × 12, 12, 12 and `now` 2026-09-27, Then pre-fill is 10 × 10 `hold_after_break` and `days_since {shoulders, 10}`.
- AC15 (check order, D-0246 §8) Given each structural fault (unknown id, warm-up move, id already an item, id already a skipped item, `atIndex` −1, `atIndex` items.length + 1, `atIndex` 1.5, `leftS` 1.5, `now` without offset), Then `RangeError` — including on an 8-item plan and with `leftS` 0 (structural beats cap and time). Given an 8-item plan with a valid new id and `leftS` 0, Then `{refused: "items_cap"}` (cap beats time).
- AC16 (9th item) Given a valid 8-item plan, When any insert runs, Then `items_cap`, never a 9-item plan.
- AC17 (duplicate) Given an id already in the plan, Then `RangeError`; no result ever holds a duplicate id.
- AC18 (determinism, purity) Given frozen inputs, When `insertItem` and `timeLeftS` run twice, Then results are deep-equal and inputs unchanged; both appear in the §0 purity list and `rule-0-purity-lint` passes.
- AC19 (invariants, D-0246 §10) Given a plan with a skipped item whose kept cost makes `itemsTotalS > available` after the insert, Then `unusedS` is 0 and no R7-E8 assertion is made.

Simulated 14-day history tests (new file `packages/engine/test/rule-12-3-insert-histories.test.ts`; D-0246 §13)
- AC20 Given zero history, `SIMULATED_HISTORIES.balanced` and `allChestNoLegs`, each at `budgetMin` 45, When every L1 non-warm-up exercise not in the plan is inserted at index 1 with `leftS` from `timeLeftS`, Then each result is a valid insert or `{refused: "time"}`, with no RangeError.
- AC21 Given `returningAfter10Days`, Then an inserted exercise last trained 10 days ago has pre-fill `hold_after_break`.
- AC22 Given a 15-min plan at its start, Then every insert is `{refused: "time"}`.
- AC23 Given a 90-min plan, When exercises are inserted until the plan has 8 items, Then the next insert is `{refused: "items_cap"}`.

Seeded properties (≥ 200 cases each, `mulberry32` from `packages/engine/test/fixtures/random.ts`, seed reported on failure; no fast-check)
- AC24 After a successful insert, `timeLeftS` drops by exactly the new item's `costS` and stays ≥ 0.
- AC25 Every other item and the warm-up deep-equal their pre-insert values.
- AC26 Insert then `removeItem` of the same index round-trips to a deep-equal workout.
- AC27 Between exercises with nothing logged ahead and nothing skipped, `timeLeftS = −timeCheck.behindS`.

Docs and vendor
- AC28 Given `docs/engine-rules.md`, Then rule 12.3 states the item build, sets 3→2, low energy, reasons, check order, invariants and "`sessionReasons` unchanged"; rule 8 gains the `timeLeftS` paragraph with the consistency condition and the model limits (rest pause overstates by up to 120 s; mid-set understates; "never over budget" holds against the 7.1 cost model). Traceability rows name T-0945.
- AC29 Given the change, When `node supabase/scripts/vendor.mjs --check` runs, Then it exits 0.

Checklist (D-0197 §7): zero vs returning history (AC20–AC21); fits vs refused (AC8–AC10); energy low vs normal (AC12); between exercises with vs without sets ahead (AC7).

## Paths you may change
`packages/engine/**`, `docs/engine-rules.md`, `supabase/functions/_shared/vendor/**` (regenerated by `node supabase/scripts/vendor.mjs` only, never hand-edited)

## Contract impact
`docs/engine-rules.md` — D-0244 §3, D-0246 §8–§14 (rule 12.3, rule 8 paragraph, examples). openapi and data model: none (`maxItems: 8` exists; no new reason code).

## Definition of done
Tests for every AC pass · simulated 14-day history tests pass · `pnpm -w typecheck lint test` green · `vendor.mjs --check` green · commit messages start with `T-0945` and cite UF-09.10.

Per-package commands: write one command per script — `pnpm --filter @workoutlab/engine typecheck`, then a separate `… lint`, then a separate `… test`.
