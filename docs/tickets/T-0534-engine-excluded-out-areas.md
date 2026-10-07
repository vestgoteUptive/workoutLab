---
id: T-0534
title: "Engine rule 0.1 (part 2): new pure excludedOutAreas, R0-E3…E5, R7-E17…E20, three simulated 14-day histories with exclusions, fast-check properties, vendor regen"
lane: engine
screens: [UF-08.2, UF-11.5]
decisions: [D-0199, D-0200, D-0024, D-0040, D-0036]
deps: [T-0533]
status: todo
---
<!-- Written by product-owner 2026-10-07 (groom, D-0199 item b, split per D-0200 §3). Flow: wl-build-engine (agent engine-dev). About ½ day. Same files as T-0533, so it runs after it. -->

## Why
D-0199 §3 and §8: when exclusions leave an area with no exercise, UF-08.2 and UF-11.5 show a neutral notice. Which areas are "excluded out" is an engine decision (principle 3), so it's a new pure function. `suggest` needs no code change (rule 0 already drops `excludeIds`), but D-0199 requires examples, simulated histories and properties that prove "never means never".

## Scope
- In:
  - `docs/engine-rules.md` rule 0.1, second part: `excludedOutAreas(profile: Pick<EngineProfile, "level" | "equipment">, library, excludeIds): Area[]`, listed in rule 0's function list. It returns the areas, in the fixed order, that have an eligible weight-1.0 exercise with `excludeIds = []` and none with `excludeIds`. Areas already empty because of equipment or level are not reported. Unknown ids are ignored. Duplicates and order don't change the result. Also: the `suggest` consequences (an excluded `mainLiftId` is ignored, an excluded pinned id is skipped, **exclusion beats a routine pin**, no fallback: an exhausted area stays exhausted per rule 7.2). Examples R0-E3…E5 (in rule 0.1) and R7-E17…E20 (rule 7.2). "Required tests" gains the three histories below. A Traceability row: "0.1 excludedOutAreas, suggest with exclusions (R0-E3…E5, R7-E17…E20, D-0199 §3) | T-0534".
  - `packages/engine/src`: `excludedOutAreas`, exported from the package index.
  - Tests: the examples, the histories and the properties below.
  - Regenerate `supabase/functions/_shared/vendor/engine/**` (`node supabase/scripts/vendor.mjs`).
- Out:
  - Any change to `suggest`, `applySwap`, `removeItem`, `timeCheck`, `balance`, `evaluateCheckin` or `prefill` (D-0199 §3: no exclusion input).
  - Anything inside the rule 12 guarded slice (T-0533 is done with it).

### Edge cases that are in scope
- **Zero history:** R7-E17…E20 run on F-history empty.
- **Returning after 10 days off:** the returning-after-10-days history with an exclusion (AC6).
- **Every exercise for an area excluded:** the area is reported by `excludedOutAreas` and gets no weight-1.0 item (AC2, AC7).
- **Equipment already empties an area:** not reported (AC4).
- Offline and time running out: not engine concerns; the engine is pure.

## Acceptance criteria
Fixtures: engine-rules F-tz, F-profile, F-input, L1, F-history empty, unless stated.
- **AC1 (R7-E17, R7-E18)** Given the R7-E4 inputs with `excludeIds` [bench-press], When `suggest` runs, Then the items are db-bench-press × 4 (main), inverted-row × 3, leg-extension × 2, 1545 s, `unusedS` 75. With `mainLiftId` bench-press as well, Then the result is the same.
- **AC2 (R7-E20)** Given the R7-E4 inputs with `excludeIds` [back-squat, leg-extension], Then the items are bench-press × 4 (main), inverted-row × 3, leg-curl × 2 (1545 s, `unusedS` 75), and no item has quads at weight 1.0.
- **AC3 (R7-E19)** Given `pinnedIds` [plank] and `excludeIds` [plank], Then plank is not an item, and the result is deep-equal to `pinnedIds` [] with the same `excludeIds`.
- **AC4 (R0-E3…E5)** Given F-profile and `excludeIds` [calf-raise], Then `excludedOutAreas` is [calves]. Given [bench-press, db-bench-press], Then [] (push-up still covers chest). Given equipment [] and [push-up], Then [chest] (back, already empty by equipment, is not reported). Given [] or [no-such-id], Then [].
- **AC5 (simulated histories)** Each run through `suggest`, `balance` and `evaluateCheckin`, as in `simulated-histories.test.ts`: balanced excluding db-bench-press → push-up × 4, db-row × 3, leg-extension × 2; all-chest-no-legs excluding inverted-row → barbell-row × 4, back-squat × 3, calf-raise × 2; returning-after-10-days excluding bench-press → db-bench-press × 4, inverted-row × 3, calf-raise × 2. For all-chest-no-legs (which logs db-bench-press), `suggest` with `excludeIds` [db-bench-press] still counts its past sets: the chest deficit the engine reports equals the one without the exclusion (the exclusion is not a history filter).
- **AC6 (properties, fast-check, D-0036 §5)**
  - no excluded id appears in any `suggest` output over budgets 15..120, every energy, warm-up on/off and shuffle 0..6;
  - `suggest` and `excludedOutAreas` are invariant under permutation, duplication and unknown ids in `excludeIds`;
  - `rankSwaps(…, [])` deep-equals the 8-argument call;
  - `excludedOutAreas` is in the fixed area order and monotone (a superset of `excludeIds` gives a superset of areas);
  - no `suggest` item has an excluded-out area at weight 1.0.
- **AC7 (fault proof)** Planted faults (backup copy, restored with `cp`), each recorded in the log: drop the `excludeIds` filter from `excludedOutAreas` → AC4 fails; report equipment-empty areas → R0-E5 fails; return areas in input order → the order property fails.
- **AC8 (vendor and traceability)** `node supabase/scripts/vendor.mjs --check` exits 0; the Traceability row exists and every new example id is named in a test title.

Checklist (D-0197 §7): `excludeIds` empty and non-empty both tested (AC4); first launch (zero history) and returning (AC5) both covered. No migration.

## Paths you may change
- `packages/engine/**`
- `docs/engine-rules.md` (contract; D-0199 §3 names the change)
- `supabase/functions/_shared/vendor/engine/**` (generated by the vendor script)

## Contract impact
`docs/engine-rules.md`: rule 0.1 (excludedOutAreas part), R0-E3…E5, R7-E17…E20, Required tests, one Traceability row. Named by D-0199 §3 and D-0200 §3.

## Definition of done
Every AC has a passing test · the simulated 14-day history tests pass · `pnpm -w typecheck lint test` green · `vendor.mjs --check` green · contract change linked to D-0199 · commits start with `T-0534:` and cite UF-08.2 / UF-11.5.

## Build / accept log

### 2026-10-07 engine-dev build
Start: clean tree, HEAD 1de8e7e (local main with T-0533). Changed: `excludedOutAreas` in `packages/engine/src/session.ts`, exported from the index; `docs/engine-rules.md` rule 0 list, rule 0.1 (suggest consequences, excludedOutAreas, R0-E3…E5), R7-E17…E20 in 7.2, Required tests, Traceability row (D-0199 §3); vendor regenerated. `suggest` unchanged. Tests: `packages/engine/test/t0534-excluded-out-areas.test.ts` (23).
- AC1 → `R7-E17 … excluding [bench-press]`, `R7-E18 … mainLiftId bench-press`
- AC2 → `R7-E20 … excluding [back-squat, leg-extension]`
- AC3 → `R7-E19 … pinnedIds [plank] and excludeIds [plank]`
- AC4 → `R0-E3`, `R0-E4`, `R0-E5` (×3: equipment-empty, [] / [no-such-id], level-empty + fixed order)
- AC5 → three `(AC5) <history> excluding …` tests (suggest + balance deficits + evaluateCheckin) and `allChestNoLegs excluding [db-bench-press] still counts its past sets`
- AC6 → five seeded properties (D-0036 §5, mulberry32): full grid 15..120 × energy × warm-up × shuffle 0..6 over zero + 4 histories; 400 random seeds (histories, profiles, main/pins); invariance (300); fixed order + monotone + definition oracle (500); rankSwaps [] vs 8-arg (150)
- AC7/AC8 → faults below; `vendor.mjs --check` exit 0; three `(AC8)` traceability tests
- Faults (backup + `cp` restore, all red): F1 drop the excludeIds filter → 6 red incl. R0-E3; F2 report equipment-empty areas → 4 red incl. R0-E5; F3 input order → order property + R0-E5 order + invariance red; F4 suggest pool ignores excludeIds → 9 red (R7-E17…E20, AC5, AC6); F5 exclusion as a history filter → AC5 "still counts" + invariance red; F6 rankSwaps default `['db-row']` → rankSwaps property red; F7 Traceability row removed → AC8 red; F8 only the first id honoured → 5 red.
- Note: a warm-up move id in `excludeIds` has no effect (the warm-up follows rule 7.3); found by the property run, written into rule 0.1's excludedOutAreas text, and the "no excluded id" property counts kind-`exercise` ids only.
- Gate: `scripts/locked.sh heavy npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1` 19/19 green; `-w test:repo-checks` 311 pass; `-w format:check` clean; `check-all.mjs` exit 0; `vendor.mjs --check` exit 0. No e2e (engine-only).
