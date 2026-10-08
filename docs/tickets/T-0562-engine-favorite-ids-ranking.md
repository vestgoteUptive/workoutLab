---
id: T-0562
title: "Engine favorites part 1: optional sessionInput.favoriteIds, rule 0.2, rule 7.2 ranking key (0) favorites first; R7-E21…E27 checked against the code, then encoded; vendor regen"
lane: engine
screens: [UF-08.2, UF-02.1, UF-11.6]
decisions: [D-0202, D-0024, D-0025, D-0199, D-0191]
deps: []
status: ready
---
<!-- Written by product-owner 2026-10-08 (groom, D-0202 §3, GitHub #46). Flow: wl-build-engine (agent engine-dev). About ⅓ day. T-0563 (part 2: simulated histories and properties) runs after this one in the same files. -->

## Why
D-0202 §1 §3: a favorite is a soft preference inside an area the gaps already chose. It is an engine input (principle 3), never a UI-side reordering of the engine's output. Spec: `docs/specs/favorite-exercises.md` §Engine.

## Scope
- In:
  - `packages/engine/src/types.ts`: `SessionInput` gains `favoriteIds?: readonly string[]` after `avoidAreas` (absent means `[]`).
  - Rule 7.2 candidate ranking (in `packages/engine/src/session.ts` or wherever the area ranking lives): a new first key "(0) in `favoriteIds` first", then the existing keys unchanged. Implement it as a stable partition (favorites first, each part in its old order). Duplicates, order and unknown ids in `favoriteIds` have no effect. Eligibility, recovery, avoided areas, exclusion and the fit check run exactly as before, so an excluded favorite is never a candidate.
  - `rankSwaps` (rule 12), shuffle (rule 13), `excludedOutAreas`, `applySwap`, `removeItem`, `timeCheck`, `balance`, `evaluateCheckin`, `prefill` and the reason codes (rule 10) are **not** changed. A test proves `rankSwaps` output is unchanged for an input carrying `favoriteIds` (it has no such parameter; the session's other inputs are equal).
  - `docs/engine-rules.md` (contract, named by D-0202 §3): rule 0 lists `favoriteIds`; new **rule 0.2 Favorite exercises** (meaning, precedence `excludeIds` > `mainLiftId` > `pinnedIds` > `favoriteIds` > existing ranking); rule 7.2's ranking gains key (0) and the stable-partition sentence; examples **R7-E21…E27**; one Traceability row.
  - **Check the hand-computed examples first.** Before encoding any of R7-E21…E27, run `suggest` on each example's inputs and compare with the spec (items, sets, main lift, item total, `unusedS`). Record each comparison in the build log. **A number that disagrees goes to triage** (`.squad/triage/TR-NNNN-…`, with the derivation and the code's output) and the ticket returns `needs-triage`; the number is never silently edited in the spec, the decision or the rules.
  - Regenerate `supabase/functions/_shared/vendor/engine/**` (`node supabase/scripts/vendor.mjs`).
- Out:
  - R7-E28…E30 (simulated 14-day histories) and the fast-check properties: T-0563.
  - `api/openapi.yaml` and `api.gen.ts` (T-0565); the backend validator (T-0566); every web caller.

### Edge cases that are in scope
- **Time running out:** a favorite that doesn't fit is passed over like any other candidate (R7-E21).
- **Recovering area:** a favorite in a recovering area is not picked (R7-E25).
- **Explicit main lift and exclusion win** (R7-E26).
- **Zero history:** every example runs on an empty history (R7-E22, R7-E23).
- **Returning after 10 days off:** covered by R7-E30 in T-0563.
- Offline: not applicable (pure function).

## Acceptance criteria
All on F-tz, F-profile, L1, F-history empty and the R7-E4 inputs (30 min, warm-up on) unless stated. Each is a `deep-equal` or field-exact assertion in `packages/engine/test/`.
- **AC1 (R7-E21, time wins)** Given `favoriteIds` [back-squat], When `suggest` runs, Then the result deep-equals R7-E4's (bench-press × 4 main, inverted-row × 3, leg-extension × 2).
- **AC2 (R7-E22, favorite main lift)** Given [db-bench-press], Then the items are db-bench-press × 4 (main), inverted-row × 3, leg-extension × 2; item total 1545 s, `unusedS` 75.
- **AC3 (R7-E23, later areas change)** Given [barbell-row], Then the items are bench-press × 4 (main), barbell-row × 3, dead-bug × 2; item total 1545 s, `unusedS` 75.
- **AC4 (R7-E24, favorite beats "not in the last session")** Given R7-E7's history and [inverted-row], Then the back ranking is inverted-row, barbell-row, db-row, lat-pulldown, seated-cable-row, straight-arm-pulldown.
- **AC5 (R7-E25, recovery wins)** Given R7-E3's inputs and [back-squat], Then the result deep-equals R7-E3's.
- **AC6 (R7-E26, explicit and exclusion win)** Given [db-bench-press] and `mainLiftId` bench-press, Then the result deep-equals R7-E4's. Given [db-bench-press] and `excludeIds` [db-bench-press], Then the result deep-equals R7-E4's.
- **AC7 (R7-E27, favorite picks the main lift inside the chosen area)** Given `avoidAreas` [chest, back, shoulders, arms, core] and [hip-thrust], Then the items are hip-thrust × 4 (main), back-squat × 3, calf-raise × 2; item total 1545 s, `unusedS` 75. Given the same inputs with `favoriteIds` [], Then the main lift is back-squat.
- **AC8 (absent = empty)** Given the R7-E4 inputs, Then the call without `favoriteIds` deep-equals the call with `favoriteIds` [].
- **AC9 (no effect on the rest)** Given any example above, Then `rankSwaps` for the same current item returns the same list with and without the favorites in the session input; and `reasons` codes are drawn from the unchanged rule 10 set.
- **AC10 (hand-check recorded)** The build log lists, for R7-E21…E27, the spec's numbers next to the code's output before the tests were written; any disagreement is a TR, not an edit.
- **AC11 (vendor and traceability)** `node supabase/scripts/vendor.mjs --check` exits 0 after the regen; the Traceability row exists and every new example id is named in a test title.

Planted faults (backup copy, restored with `cp`): remove key (0) → AC2, AC3, AC4, AC7 fail; put key (0) after "not in the last session" → AC4 fails.

Checklist (D-0197 §7): `favoriteIds` empty and non-empty both tested (AC8 and AC1–AC7); favorite eligible and not (AC6, AC5).

## Paths you may change
- `packages/engine/**` (lane)
- `docs/engine-rules.md` (contract; D-0202 §3 names the change)
- `supabase/functions/_shared/vendor/engine/**` (generated by the vendor script)

## Contract impact
`docs/engine-rules.md`: rule 0 input, rule 0.2, rule 7.2 key (0), R7-E21…E27, Traceability row. Named by D-0202 §3.

## Definition of done
Every AC has a passing test · `pnpm -w typecheck lint test` green (`--force`, contract change) · vendor check green · contract change linked to D-0202 · commits start with `T-0562:` and cite UF-08.2.

## Build / accept log

### 2026-10-08 engine-dev build
- Start: clean, HEAD eb47e90 on `t/T-0562-engine-favorite-ids-ranking`.
- Changed: `SessionInput.favoriteIds?` (types.ts); `Start.favorites` set and rule 7.2 key (0) in `candidates()` (session.ts; `rankCandidates` accepts `favoriteIds` too); engine-rules rule 0 input, new rule 0.2, rule 7.2 key (0) + stable-partition sentence, R7-E21…E27, one Traceability row; vendor regen. Tests: `packages/engine/test/rule-0-2-favorites.test.ts`.
- AC10 hand-check (spec → code, `suggest` run before any test was written; all agree, no TR):
  - R7-E21 [back-squat]: spec = R7-E4 → code bench-press×4 (main), inverted-row×3, leg-extension×2, 1545/75, deep-equal R7-E4 true.
  - R7-E22 [db-bench-press]: spec db-bench-press×4 (main), inverted-row×3, leg-extension×2, 1545/75 → code identical.
  - R7-E23 [barbell-row]: spec bench-press×4 (main), barbell-row×3, dead-bug×2, 1545/75 → code identical.
  - R7-E24 R7-E7+[inverted-row]: spec inverted-row, barbell-row, db-row, lat-pulldown, seated-cable-row, straight-arm-pulldown → code identical.
  - R7-E25 R7-E3+[back-squat]: spec = R7-E3 → code deep-equal true (bench-press×4, inverted-row×3, calf-raise×2).
  - R7-E26 +mainLiftId bench-press / +excludeIds [db-bench-press]: spec = R7-E4 → code deep-equal true / true.
  - R7-E27 legs-only + [hip-thrust]: spec hip-thrust×4 (main), back-squat×3, calf-raise×2, 1545/75 → code identical; with [] main back-squat → code back-squat.
- Default byte-identical: scratch run of 6048 `suggest` calls (zero + 3 simulated histories × budgets 15..120/5 × warm-up on/off × 3 energies × shuffle 0..6) plus `rankCandidates` per area, on HEAD src vs new src without `favoriteIds`: JSON outputs `cmp`-identical (13.4 MB).
- AC→test (all in rule-0-2-favorites.test.ts): AC1 "R7-E21 …"; AC2 "R7-E22 …"; AC3 "R7-E23 …"; AC4 "R7-E24 …"; AC5 "R7-E25 …" + "rule-0.2 (AC5) a favorite with one recovering primary area …"; AC6 "R7-E26 …"; AC7 "R7-E27 …"; AC8 "rule-0.2 (AC8) absent favoriteIds deep-equals [] …"; AC9 "rule-0.2 (AC9) rankSwaps is unchanged …"; AC10 this log; AC11 the two "T-0562 traceability" tests + `vendor.mjs --check`.
- Planted faults (session.ts backup, restored with `cp`, `cmp` clean): F1 key (0) removed → AC2, AC3, AC4, AC7 red; F2 key (0) after "recent" → AC4 red; F3 favorite bypasses candidate admissibility → survived R7-E25 (back-squat's only primaries are the recovering areas), so the extra AC5 case was added → red; F4 favorite ignores the fit → AC1, AC6 red; F5 favorites suppress `mainLiftId` → AC6 red; F6 favorite bypasses exclusion → AC6 red; F7 absent defaults to [db-bench-press] → AC1, AC5, AC6, AC8 red; F8 extra `favorite` reason code → AC9 (and AC1, AC5, AC6) red; F9 Traceability row deleted (engine-rules backup) → AC11 red; vendor `--check` before regen → exit 1.
- Gate: `scripts/locked.sh heavy npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1` → 19/19 tasks (14 cached), exit 0; `-w test:repo-checks` 369/369; `-w format:check` clean; `check-all.mjs` exit 0; `vendor.mjs --check` exit 0. Rule-0.2 file 13/13. Run without `--force` per the orchestrator's brief (the ticket DoD asks for `--force`; the orchestrator's merge gate does that).
