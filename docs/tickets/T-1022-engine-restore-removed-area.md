---
id: T-1022
title: "Engine: adding back an area removed in the same visit restores its removed items (ctx.restore on addArea and areaCandidates), T-0999 bug"
lane: engine
screens: [UF-08.2]
decisions: [D-0290, D-0275, D-0287, D-0289]
deps: []
status: ready
---
## Why
T-0999 found that on the 45-min plan, Remove Hamstrings (Leg curl x 2, about 5 min) then Add Hamstrings gives "No time left": rule 12.6 only tries the top candidate (Romanian deadlift). The spec promises one tap puts the area back. D-0290 fixes it in the engine with an input the web supplies, keeping `addArea` pure.

## Scope
- In: `AreaEditContext.restore?: readonly WorkoutItem[]` (types, JSDoc). `addArea` (rule 12.6) and `areaCandidates` (rule 12.7) read it as D-0290 §1 to §5 say. Rule text in `docs/engine-rules.md` with examples R12-E66 onward. Vendored copy re-run (`vendor.mjs`).
- Out: any web change (T-1023), `suggest`, `removeArea` (unchanged, the web keeps the removed items), the openapi contract.

## Acceptance criteria
Test titles start `T-1022 ACn`. Fixture W is R12.5's W (`budgetMin 45`).
- AC1 (round trip) Given W, When `removeArea(W, back)` then `addArea(that, back, {...ctx, restore: <the removed items>})`, Then the result deep-equals W (items, sets, reps, pre-fill, order, `unusedS`, `itemsTotalS`, `mainLiftId`). Same for every area of W, and for an area with two items (R12-E52's plan, `removeArea(back)` then add back).
- AC2 (the bug) Given a 45-min plan with Leg curl x 2 as hamstrings and 5 min left after `removeArea(hamstrings)` where the top candidate (Romanian deadlift) does not fit 2 sets, When `addArea(hamstrings)` with `restore` [Leg curl x 2], Then the result is Leg curl x 2 and not `{refused: "time"}`. Given no `restore`, Then `{refused: "time"}` as today (rule 12.6 unchanged).
- AC3 (restore does not fit, falls back) Given `restore` whose cost exceeds `available - Σ costS`, Then `addArea` behaves exactly as without `restore` (the top candidate at 3 sets, else 2, else the same refusal). Same for: a restored exercise now in `excludeIds`, not in `library`, no longer eligible; the area now recovering or avoided (refusal `area_unavailable`, never a restore); a restored exercise already in the plan (a swap took it); 7 items in the plan and 2 to restore (cap 8). No partial restore.
- AC4 (main lift) Given the removed area held the main lift and the plan has none now, Then the restored item is `isMain` and `mainLiftId` is set. Given the plan has a main lift now, Then it is an accessory: accessory reps, pre-fill re-derived, no back-off, `min(sets, 3)` sets, reasons without `main_lift`; its fit is checked at that cost (a 4-set main that does not fit but whose 3-set demotion does is restored at 3).
- AC5 (items of other areas ignored) Given `restore` holding items of hamstrings and chest, When `addArea(hamstrings)`, Then only hamstrings items come back. An empty or absent `restore` changes nothing anywhere (the R12-E44 to R12-E50 examples still pass).
- AC6 (areaCandidates agrees) Given the AC2 plan, When `areaCandidates` with `restore`, Then hamstrings reads `available: true` (without `restore`: `{reason: "time"}`). Property: for every area, `available: true` if and only if `addArea` (same ctx) returns a `Workout`; the order of the list is unchanged by `restore`.
- AC7 (time budget changed) Given items removed at 45 min and the plan rebuilt for 20 min (the caller kept the stale `restore`), When `addArea`, Then a restore that does not fit 20 min falls back as AC3 and the plan is never over `available`.
- AC8 (purity) Inputs and the `restore` array are not mutated; restored items are copies; same input twice gives deep-equal output; `suggest` output is unchanged (R12-E65 and the existing suite untouched).
- AC9 (simulated histories) In `packages/engine` simulated-history tests (zero history, 10 days off, budgets 15 to 120, three energies): remove then add back round-trips when nothing else changed, never over budget, deterministic; with a main-lift change in between (`setMainLift` elsewhere) the restored item is an accessory and the plan is never over budget.
- Planted faults (record in the log): F1 restore skips the fit check (AC3 red); F2 keeps `isMain` when a main exists (AC4 red); F3 no `orderItems` after a restore (AC1 red); F4 `areaCandidates` ignores `restore` (AC6 red); F5 a partial restore (AC3 red).

Checklist (D-0197 §7): fits/doesn't fit, main/not main, one item/two items, with/without `restore`, area available/recovering.

## Paths you may change
- `packages/engine/**`, `docs/engine-rules.md` (rules 12.6 and 12.7 text, R12-E66 onward, the rule index line), `supabase/functions/_shared/vendor/**` (via `vendor.mjs`)
- `.squad/decisions/D-0290-restore-removed-area.md` (only to correct details the build found; keep `revisit`)

## Contract impact
`docs/engine-rules.md` rules 12.6 and 12.7 under D-0290. No openapi, data or token change.

## Definition of done
Every AC has a test · engine is a shared path, so the full local suite per D-0285 (`turbo run typecheck lint test`, `test:repo-checks`, vendor `--check`) · commit messages start with `T-1022` and cite UF-08.2.

## Build / accept log
