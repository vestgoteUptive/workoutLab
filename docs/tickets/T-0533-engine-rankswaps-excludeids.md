---
id: T-0533
title: "Engine rule 0.1 (part 1): rankSwaps gains a 9th parameter excludeIds = [], filtered at pool level; rule 12 signature line, D-0130 guard fixture, T-0212 AC1/AC2, R12-E17…E19, vendor regen"
lane: engine
screens: [UF-05.1, UF-08.3]
decisions: [D-0199, D-0200, D-0130, D-0056, D-0059, D-0024]
deps: []
status: ready
---
<!-- Written by product-owner 2026-10-07 (groom, D-0199 item b, split per D-0200 §3). Flow: wl-build-engine (agent engine-dev). About ½ day. T-0534 follows on the same files; never run the two in parallel. -->

## Why
D-0199 §3 makes an exclusion an engine input (principle 3). `rankSwaps` has no exclusion input today (D-0056 §2, "the caller filters"), and D-0059's revisit trigger "rankSwaps gains an excludeIds input" has fired. The rule 12 slice is frozen by the D-0130 guards, so D-0199 names the exact line change and the guard allowance.

## Scope
- In:
  - `docs/engine-rules.md`: a new **rule 0.1** heading with its `rankSwaps` paragraph (D-0199 §3 first bullet, plus "no fallback": an excluded exercise is never reintroduced). Rule 0's function list shows the new parameter. Rule 12's first line becomes exactly `` `rankSwaps(current, reason | null, session, profile, library, history, now, tz, excludeIds = [])` `` followed by the rest of that line unchanged. That is the only character change inside the guarded slice (rule 12 up to the R12-E5 line, plus rule 13). R12-E17, R12-E18 and R12-E19 go **after** the R12-E5 line. A Traceability row: "0.1 rankSwaps excludeIds (R12-E17…E19, D-0199 §3) | T-0533".
  - `packages/engine/src/swaps.ts`: `rankSwaps(…, tz, excludeIds: readonly string[] = [])`. Candidates are filtered through `isEligible(e, profile, excludeIds)` **before** ranking and **before** the `equipment_taken` keep-all fallback. An excluded `current` is not an error. `applySwap` is unchanged.
  - D-0059 (b): the shuffle filter in `suggest` may pass `excludeIds` through `rankSwaps` instead of filtering itself. Behaviour is identical and its existing test stays unchanged.
  - Guards (amend D-0130 §2 §3): a new fixture `packages/engine/test/fixtures/rule12-signature-d0199.ts` with the before line (D-0130's after line) and the after line above; `rule12-guards.ts` accepts the slice with this line reverted, alone and combined with the D-0056 §1 and D-0130 reverts; `t0212-rankswaps-signature.test.ts` AC1 `RULE12_SIGNATURE_LINE` moves to the D-0199 line and AC2 `EXPECTED_CODE` to 9 parameters (`…, now, tz, excludeIds`).
  - Regenerate `supabase/functions/_shared/vendor/engine/**` with `node supabase/scripts/vendor.mjs` (CI runs `--check`).
- Out:
  - `excludedOutAreas`, R0-E3…E5, R7-E17…E20, the simulated histories and the fast-check properties (T-0534).
  - Any web change (T-0539 calls the new parameter). The `/workouts/suggest` validator (no change, D-0199 §3).
  - Any other character in the guarded slice.

### Edge cases that are in scope
- **Excluded current:** `rankSwaps` with `current` in `excludeIds` returns the same list as without it (R12-E17).
- **Every candidate excluded:** `[]`, never a fallback to an excluded exercise (R12-E19).
- **Duplicates / unknown ids in `excludeIds`:** no effect on the result.
- Offline, time running out, zero history, returning after 10 days: the engine is pure; zero history is the default fixture (F-history empty), so every example here runs at zero history.

## Acceptance criteria
Fixtures: engine-rules F-tz, F-profile, F-input, L1, F-history empty, unless stated.
- **AC1 (R12-E17)** Given the R12-E1 fixture and `excludeIds` [db-row], When `rankSwaps` runs, Then the candidates are inverted-row (bestMatch), lat-pulldown, seated-cable-row, straight-arm-pulldown, in that order. Given `excludeIds` [], Then the result is deep-equal to the 8-argument call. Given `excludeIds` [barbell-row] (the current exercise), Then it does not throw and equals R12-E1.
- **AC2 (R12-E18, pool-level filter)** Given the R12-E5 inputs and `excludeIds` [push-up], Then the result is [db-bench-press] (the keep-all fallback runs on the filtered pool).
- **AC3 (R12-E19)** Given the R12-E5 inputs and `excludeIds` [push-up, db-bench-press], Then the result is `[]`.
- **AC4 (guards)** Given the new `engine-rules.md`, Then `t0204-traceability.test.ts` and `rule-12-apply-swap.test.ts` pass through `rule12-guards.ts`; the T-0212 AC1/AC2 tests pass with the D-0199 line and 9 parameters. Planted fault (on a backup copy, restored with `cp`): change one more character inside the guarded slice (e.g. in R12-E2) → the T-0204 guard fails. Second fault: put R12-E17 before the R12-E5 line → the guard fails.
- **AC5 (default parameter)** Given any R12-E1…E5 call without the 9th argument, Then every existing rule 12 test passes unchanged.
- **AC6 (D-0059 b unchanged)** Given the existing rule 13 shuffle tests, Then they pass unchanged, whichever way the shuffle filter is implemented.
- **AC7 (vendor)** `node supabase/scripts/vendor.mjs --check` exits 0 after the regen.
- **AC8 (traceability)** The rule-0.1 Traceability row exists and every new example id (R12-E17…E19) is named in a test title.

Checklist (D-0197 §7): `excludeIds` empty and non-empty both tested (AC1). No migration.

## Paths you may change
- `packages/engine/**`
- `docs/engine-rules.md` (contract; D-0199 §3 names the change)
- `supabase/functions/_shared/vendor/engine/**` (generated by the vendor script)

## Contract impact
`docs/engine-rules.md`: rule 0.1 (rankSwaps part), the rule 12 signature line, R12-E17…E19, one Traceability row. Named by D-0199 §3 and D-0200 §3.

## Definition of done
Every AC has a passing test · `pnpm -w typecheck lint test` green · `vendor.mjs --check` green · contract change linked to D-0199 · commits start with `T-0533:` and cite UF-05.1 / UF-08.3.

## Build / accept log

### 2026-10-07 engine-dev (build)
Start: clean, HEAD 13d1f38 on t/T-0533-engine-rankswaps-excludeids.
- Changed: `swaps.ts` `rankSwaps(…, tz, excludeIds = [])`, pool built with `isEligible(e, profile, excludeIds)` (before ranking and the keep-all fallback). `engine-rules.md`: rule 0.1, rule 0 list `rankSwaps(…, excludeIds = [])`, rule 12 signature line (the only slice change), R12-E17…E19 right after R12-E5, Traceability row. Guards: `fixtures/rule12-signature-d0199.ts`; `rule12-guards.ts` accepts the slice with the D-0199 line reverted, alone and then with the D-0130 revert (T-0204 also with the D-0056 §1 revert). T-0212: AC1 pins the D-0199 line, AC2 `EXPECTED_CODE` has 9 params (`docParams` strips a default value); AC3 runs on the D-0130-era doc (D-0199 line put back) so its meaning is unchanged. Shuffle filter (D-0059 b) left as is (allowed, "may"). Vendor regenerated.
- AC1 → t0533 `R12-E17 … [db-row]`, `… [] is deep-equal to the 8-argument call`, `… [barbell-row] (the current exercise)`; AC2 → `R12-E18 …`; AC3 → `R12-E19 …`; AC4 → t0533 `T-0533 AC4 …` (6 tests) + t0204 AC25 / rule-12-apply-swap AC14 against main + t0212 AC1/AC2; AC5 → rule-12-swaps.test.ts unchanged, green; AC6 → rule-13-shuffle.test.ts unchanged, green; AC7 → `vendor.mjs --check` exit 0; AC8 → t0533 `T-0533 AC8 …` (row + titles). Edges: duplicates/unknown ids, frozen `excludeIds`; simulated histories (balanced, all-chest-no-legs, returning after 10 days, offline-merged) × sessions fSwap + suggest at 15/30/90 min × every reason: `[]` equals 8-arg, top candidate excluded is gone, excluding all → `[]`.
- Red: HEAD swaps.ts → T-0212 AC2 (2 tests) red. `vendor.mjs --check` before regen → exit 1 (swaps.d.ts).
- Planted (backup + cp restore): pool without `excludeIds` → 8 t0533 tests red; post-filter of ranked output instead of pool → AC1 (bestMatch) + R12-E18 red; extra space in R12-E2 → t0204 AC25 + T-0224 AC14 red; R12-E17 moved before R12-E5 → same 2 red; guards without the D-0199 revert → same 2 red.
- Gate: `-w typecheck lint test --concurrency=1` 18/19 twice; the one red both times is `@workoutlab/web#test`, run 2 named `UF-08 ready-start.test.tsx` 'retry: the second tap reuses…' (known flake T-0445, web lane, no engine call; this diff touches no web file). It passes 3× alone and the whole web suite passes alone (274 files, 3733 tests). `test:repo-checks` 311/311, `format:check` clean, `check-all.mjs` exit 0, `vendor.mjs --check` exit 0. No e2e (engine-only diff).
