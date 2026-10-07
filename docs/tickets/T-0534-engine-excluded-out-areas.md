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
