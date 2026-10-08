---
id: T-0563
title: "Engine favorites part 2: simulated 14-day histories R7-E28…E30 with favoriteIds [back-squat], fast-check properties (empty = absent, permutation/duplication/unknown ids, caps, exclusion wins, stable partition), Required tests list"
lane: engine
screens: [UF-08.2]
decisions: [D-0202, D-0036, D-0199]
deps: [T-0562]
status: todo
---
<!-- Written by product-owner 2026-10-08 (groom, D-0202 §3, GitHub #46). Flow: wl-build-engine (agent engine-dev). About ⅓ day. Same files as T-0562, so it runs after it. -->

## Why
CLAUDE.md's definition of done: engine changes need the simulated 14-day history tests. D-0202 §3 also names the fast-check properties that keep the new ranking key honest across every budget.

## Scope
- In:
  - **R7-E28…E30:** reuse `packages/engine/test/fixtures/histories.ts` (balanced, all-chest-no-legs, returning-after-10-days). For each, call `suggest` with the R7-E4 session inputs plus `favoriteIds` [back-squat], derive the expected items (ids, sets, main lift, item total, `unusedS`) from the code, check them by hand against rules 6, 7.2 and 0.2, and record them in `docs/engine-rules.md` as R7-E28…E30 with one sentence each saying why back-squat is or isn't in the plan. Flag them for the engine reviewer in the handback.
  - **Properties (fast-check, the existing `fast-check` devDependency)** over budgets 15..120, every energy, warm-up on/off and shuffle 0..6:
    - P1 `favoriteIds` [] deep-equals absent.
    - P2 invariance under permutation, duplication and added unknown ids (e.g. `"no-such-id"`).
    - P3 R7-E8's caps (Σ item cost ≤ `available`, ≤ 8 items, ≤ 2 items per primary area) hold for any subset of L1 ids as `favoriteIds`.
    - P4 an id in both `favoriteIds` and `excludeIds` is never an item, and the result equals the call with that id removed from `favoriteIds`.
    - P5 the ranked candidate list of an area with favorites is the stable partition of the list without them (favorites first, each part in its old order). Test it through the exported ranking helper if one exists; otherwise export a pure `rankAreaCandidates` (or the existing name) from the engine for the test.
  - `docs/engine-rules.md` Required tests: list the three histories and P1–P5.
  - Vendor regen if any `src` file changed.
- Out: any behaviour change (if a property fails, the fix is a T-0562 regression: raise triage, don't change the rule).

### Edge cases that are in scope
- **Returning after 10 days off:** R7-E30 (nothing recovers; back-squat is picked if legs have the lowest `r` and it fits).
- **All-chest, no legs:** R7-E29 (legs are the gap; the favorite should lead).
- **Time running out:** P3 at budget 15.
- Zero history is T-0562's R7-E21…E27; offline is not applicable.

## Acceptance criteria
- **AC1 (histories)** Given each of the three fixture histories and `favoriteIds` [back-squat], When `suggest` runs at the R7-E4 inputs and `now`, Then the result deep-equals R7-E28, R7-E29 and R7-E30 as recorded in `docs/engine-rules.md`. In R7-E29 back-squat is an item.
- **AC2 (P1–P5)** Each property runs ≥ 200 cases with a fixed seed and passes.
- **AC3 (faults)** Planted on a backup copy of the ranking code and restored with `cp`: removing key (0) fails P5 and AC1 (R7-E29); ranking favorites last fails P5; letting an excluded favorite through fails P4. Each red run is one line in the log.
- **AC4 (docs)** Required tests list the histories and P1–P5; every new example id appears in a test title; `vendor.mjs --check` exits 0.

Checklist (D-0197 §7): empty and non-empty `favoriteIds` (P1 vs AC1); first launch (zero history, T-0562) and returning (R7-E30).

## Paths you may change
- `packages/engine/**` (lane)
- `docs/engine-rules.md` (contract; D-0202 §3 names R7-E28…E30 and the properties)
- `supabase/functions/_shared/vendor/engine/**` (generated)

## Contract impact
`docs/engine-rules.md`: R7-E28…E30 and Required tests. Named by D-0202 §3.

## Definition of done
Every AC has a passing test · the simulated 14-day history tests pass · `pnpm -w typecheck lint test` green (`--force`) · vendor check green · commits start with `T-0563:` and cite UF-08.2.

## Build / accept log

### 2026-10-08 engine-dev (build)
- Start: clean, HEAD 7069542. No `src` change (`rankCandidates` was already exported), so no vendor regen. fast-check isn't in the lockfile, so P1–P5 run on the seeded mulberry32 generators (D-0036 §5), 250 cases each from seed base 563000.
- Changed: new `packages/engine/test/rule-0-2-favorites-histories.test.ts`; `docs/engine-rules.md` R7-E28…E30 (rule 7.2), the rule 0.2 examples line, a Required tests bullet (histories, P1–P5, Shuffle) and a T-0563 traceability row.
- Derived from `suggest`: R7-E28 balanced → db-bench-press × 4, db-row × 3, leg-extension × 2; R7-E29 all-chest → inverted-row × 4, back-squat × 3, calf-raise × 2; R7-E30 returning → bench-press × 4, inverted-row × 3, calf-raise × 2; each 720 + 555 + 270 = 1545 s, total 1725, `unusedS` 75. **All three deep-equal `favoriteIds` [].** The favorite changes the balanced quads ranking (back-squat first instead of last), but × 2 = 390 s doesn't fit the 345 s left.
- AC1 → R7-E28/E29/E30 tests. AC2 → P1…P5 tests. AC3 → faults below. AC4 → the two T-0563 traceability tests. Shuffle → `rule-13 rule-0.2` example (R7-E23 at shuffle 1 → db-row) and property (main lift never shuffled; ≥ 50 % of favorite accessory slots move).
- Faults (backup `cp` of `src/session.ts`, restored with `cp`, `cmp` clean):
  - F1 key (0) removed: red R7-E28, P5, both Shuffle tests. **R7-E29 stays green** (AC3 expected red there): back-squat leads glutes on gap fit anyway.
  - F2 favorites ranked last: red R7-E28, R7-E29, P5, Shuffle ×2.
  - F3 excluded favorite let into the pool: red P2, P4, P5.
  - F4 Shuffle skips favorites: red Shuffle example + property.
  - F5 absent `favoriteIds` ≠ []: red P1, R7-E30.
  - F6 only the first favorite counts: red P2, P4, P5, Shuffle property.
  - F7 favorite bypasses the area cap in `admissible` only: green. This is an equivalent mutant in L1, because `areasByRatio` guards the cap and back-squat is the only multi-primary exercise. F7b, which lifts the area cap when favorites exist: red P3, P2, P4, Shuffle property.
  - F9 favorite bypasses time: red P3, R7-E28, R7-E30, Shuffle property.
  - F10 favorite bypasses the 8-item cap in `admissible`: green, equivalent mutant (the greedy loop guards it). F10b, which lifts the 8-item cap when favorites exist: red P3, P2, P4, Shuffle property.
  - F8 favorite forced as main lift: red R7-E28/E29/E30, P2, P4, Shuffle example.
  - Doc/title faults (backup `cp`): red on both traceability tests.
- Gate: the first `-w typecheck lint test --force --concurrency=1` was red on engine `test-budgets` (T-0230: tests under a "seeded" describe need a ≥ 30 s budget), so the P1–P5 and Shuffle property tests got `BUDGET_MS`. The second run was red on `@workoutlab/web#test` only. No `src` changed, `apps/web` vitest alone passed 3996/3996, and a third full run was green (exit 0). That points to a flaky web test under load; its name wasn't captured. `test:repo-checks` green, `format:check` green, `check-all` exit 0, `vendor.mjs --check` exit 0.
