---
id: T-0235
title: "Engine: rule 14 reentry and deload never drop to more than W; the one-increment floor is capped at W (D-0137)"
lane: engine
screens: [UF-09.3, UF-08.2]
decisions: [D-0137, D-0057, D-0062, D-0131, D-0132, D-0096, D-0053]
deps: [T-0221, T-0236]
status: todo
---
<!-- Written by product-owner 2026-10-02 (groom). Build flow: wl-build-engine. About ⅓ day. Engine behaviour change: it needs the simulated 14-day history tests, and the orchestrator regenerates the vendored engine at merge (D-0053 §1). Engine tickets run one at a time (D-0096 §3): T-0221 → T-0212 → T-0211 → T-0236 → T-0235. It builds on T-0221's rule 14 text (the Drop floor bullet) and runs after T-0236 retires the T-0220 frozen snapshot. -->

## Why
A beginner logs bench-press at 2 kg (inc 2.5), then takes 3 weeks off. Rule 14 step 2 gives `max(2.5, floorInc(1.8)) = 2.5` kg, labelled `reentry`. UF-09.3 asks them to lift more than last time, under a reason that promises less. Step 5 (`deload`) has the same defect. D-0137 caps the drop at `W`, the same way D-0131 caps the back-off. Principle 3 holds: the rule stays a pure function, and only results with `0 < W < inc` change.

## Scope
- In:
  - `packages/engine/src/prefill.ts`, the `dropped` value only. Per D-0137 §1, with `inc = incrementKg ?? 2.5`: a loaded lift with `W > 0` → `round3(min(W, max(inc, floorInc(0.9 × W, inc))))`; otherwise 0 (unchanged).
  - `docs/engine-rules.md` rule 14, exactly the D-0137 §4 edits (steps 2 and 5, one sentence and one worked case in the Drop floor bullet, one Traceability row).
  - Tests: every AC below, including the simulated 14-day histories.
  - Edge cases:
    - zero history (step 1, unchanged);
    - bodyweight (0 stays 0);
    - a loaded lift logged at 0 kg (0 stays 0, D-0062 §4);
    - an off-grid weight below one increment (2 kg on inc 2.5 → 2);
    - returning after 10 days off (step 3 `hold_after_break`, unchanged; the cap is only steps 2 and 5);
    - offline-merged history;
    - timed sets (the timed `reentry`, unchanged, D-0137 §3).
- Out:
  - The kind and reps of steps 2 and 5 (D-0137 §2), and every other step.
  - The rule 7.4 back-off (D-0131, unchanged; it reads the capped pre-fill as its `w`).
  - `api/openapi.yaml` and any web code.
  - The vendored engine copy (regenerated at merge).

## Acceptance criteria
**Fixtures unless an AC says otherwise:** F-tz (`NOW = "2026-09-27T12:00:00+02:00"`, `TZ`), F-targets, F-profile (`build_muscle`), `LIBRARY` (bench-press inc 2.5, db-bench-press inc 2). `benchSlot` = the bench-press main slot, reps 6–8. Call `prefill` as the R14-E4 and R14-E5 tests do. Each new test title starts with `T-0235 ACn`.

- **AC1 (reentry, the board repro)**
  - **Given** bench-press 2 × 6, 6, 6 on 2026-09-01 (gap 26), **When** `prefill` runs for `benchSlot`, **Then** it returns `{weightKg: 2, reps: 6, durationS: null, kind: "reentry"}`.
  - **Red on unfixed code:** on `main` `weightKg` is 2.5. Record the red run in the build log.
- **AC2 (deload)** **Given** bench-press 2 × 5, 5, 4 on 09-20 and 2 × 5, 4, 4 on 09-24, **Then** `prefill` returns `{weightKg: 2, reps: 6, durationS: null, kind: "deload"}`. On `main` it is 2.5.
- **AC3 (end to end through suggest)**
  - **Given** AC1's history and `input({mainLiftId: "bench-press", budgetMin: 15, warmupInBudget: false, energy: "high"})`, **When** `suggest` runs, **Then** the bench-press item's `prefill` is 2 × 6 `reentry`, and its back-off is `{weightKg: 2, reps: 6}` (D-0131: `min(2, max(2.5, 0))`).
  - Derive `itemsTotalS` and `unusedS` by hand in a comment next to the assertion, from rules 7.1 and 7.4.
- **AC4 (unchanged cases)** Unit tests on `prefill`'s drop:

  | last performance (loaded unless noted) | inc | step | weight |
  |---|---|---|---|
  | 102.5 × 8, 8, 8 on 09-01 (R14-E4) | 2.5 | reentry | 90 |
  | 100 × 5, 5, 4 on 09-20 and 100 × 5, 4, 4 on 09-24 (R14-E5) | 2.5 | deload | 90 |
  | 2.5 × 6, 6, 6 on 09-01 | 2.5 | reentry | 2.5 |
  | 2 × 6, 6, 6 on 09-01 | 2.5 | reentry | 2 |
  | 2 × 6, 6, 6 on 09-01 (db-bench-press) | 2 | reentry | 2 |
  | 3 × 6, 6, 6 on 09-01 | 2.5 | reentry | 2.5 |
  | 0 × 6, 6, 6 on 09-01 (D-0062 §4) | 2.5 | reentry | 0 |
  | push-up 0 × 8, 8, 8 on 09-01 (bodyweight) | null | reentry | 0 |

  Also: R14-E1…R14-E9 and R7-E16 pass unedited.
- **AC5 (only `0 < W < inc` changes, property)**
  - **Given** the drop computed by the engine and the old formula `max(inc, floorInc(0.9 × W, inc))` computed inline in the test.
  - **When** `W` runs over `0.25..200` step 0.25 and `inc` over `[1, 1.25, 2, 2.5, 5]`, through `prefill` with a single gap-26 session at `W` (reentry), **Then**:
    - new = old wherever old ≤ W;
    - new = W wherever old > W;
    - always `0 < new ≤ W`.
  - The test asserts both branches are hit (a count > 0 each), and has the `30_000` runtime budget (its title contains `sweep`, T-0230 guard).
- **AC6 (simulated 14-day histories)**
  - **Given** each of `balancedHistory`, `allChestNoLegsHistory`, `returningAfter10DaysHistory`, `offlineMergedHistory`, `[]`, plus two new light histories:
    - `lightReentry`: bench-press 2 × 6, 6, 6 on 2026-09-01 at 10:00;
    - `lightDeload`: bench-press 2 × 5, 5, 4 on 2026-09-20 and 2 × 5, 4, 4 on 2026-09-24, each at 10:00, with distinct sessionIds and clientIds.
  - **When** `suggest` runs with `mainLiftId: "bench-press"` for `budgetMin` 15..120 step 5, warm-up on and off, and energy `normal` and `high`, **Then** for every item whose prefill kind is `reentry` or `deload` and whose exercise is loaded, the prefill weight `p` satisfies `p ≤ W` (the exercise's last-session top weight, computed in the test), and `p > 0` when `W > 0`.
  - For those items, `p` equals the old formula `max(inc, floorInc(0.9 × W, inc))` computed inline whenever that is ≤ `W`, and equals `W` otherwise. Compare against the inline formula, never against a stored snapshot (T-0236).
  - **Non-vacuity:** at least one `lightReentry` case has a 2 kg `reentry` pre-fill, at least one `lightDeload` case has a 2 kg `deload` pre-fill, and at least one standard-history case has a `reentry` or `deload` weight equal to the old formula. If no standard history reaches step 2 or 5 (likely: none has a gap ≥ 21), that third count is replaced by AC4's R14-E4 and R14-E5 rows, and the build log says so.
  - The test has the `30_000` runtime budget.
- **AC7 (the contract text, D-0137 §4)** A Vitest test reads `docs/engine-rules.md` and asserts:
  - in rule 14 (from `\n## 14.` to `\n## Required tests`), the step 2 and step 5 lines each contain `min(W, max(inc, floorInc(0.9 W)))`;
  - the line starting `- **Drop floor (` contains `capped at`, `D-0137`, `2 × 6` and `reentry`, and still contains `incrementKg ?? 2.5`, `one increment` and `0 + inc`;
  - rule 14 has exactly nine lines starting `- **R14-E`;
  - the Traceability table has exactly one T-0235 row.
  - **Red on unfixed docs:** the step lines lack `min(W,` on `main`.

  The T-0205 guard (narrowed by T-0221) and every T-0221 test pass unedited. Per D-0096 §2, add no "every other section unchanged" test. Run `git diff main...HEAD -- docs/engine-rules.md` and list the changed sections in the result and the commit message. Expected: rule 14 steps 2 and 5, the Drop floor bullet, and Traceability.
- **AC8 (existing tests)** Every existing engine test passes. If an existing literal expects a drop heavier than `W`, update only that literal to the D-0137 value, cite D-0137 in a comment, and list it in the build log. Any other changed expectation, including a frozen `pre-*.json` baseline that no longer matches, means stop and raise triage.
- **AC9 (purity)** The AC1–AC3 calls give deep-equal reruns and don't throw or mutate deep-frozen inputs. `pnpm --filter @workoutlab/engine lint` passes.

## Paths you may change
- `packages/engine/**` (the lane: `engine`).
- **Listed extras:**
  - `docs/engine-rules.md`: rule 14 steps 2 and 5, the Drop floor edge-case bullet, and one Traceability row (D-0137 §4).
  - `docs/tickets/T-0235-rule-14-drop-floor-cap.md`: this file, for the build and accept log.

## Contract impact
- `docs/engine-rules.md` rule 14 (steps 2 and 5, the Drop floor bullet) and Traceability change under D-0137. The engine lane owns this contract.
- `api/openapi.yaml` is unchanged.

## Coordination
- Files: `src/prefill.ts` (the `dropped` line), a new `test/t0235-drop-floor-cap.test.ts`, a new light-history fixture in `test/fixtures/`, and `docs/engine-rules.md`.
- Engine lane, one ticket at a time (D-0096 §3). It runs last in T-0221 → T-0212 → T-0211 → T-0236 → T-0235. It needs T-0221's Drop floor bullet to exist, and T-0236 to have retired the T-0220 frozen snapshot.
- Vendor regen: `src/**` changes, so the orchestrator runs `node supabase/scripts/vendor.mjs` at merge and then `--check` (D-0053 §1).

## Definition of done
Tests for every AC pass, including the AC6 simulated 14-day histories · `npx -y pnpm@10.28.2 -w typecheck lint test --force --concurrency=1` is green · the contract change is linked to D-0137 · commit messages start with `T-0235` and cite UF-09.3 (e.g. `T-0235 UF-09.3: cap the rule 14 drop at W (D-0137)`).

## Build / accept log

### Build 2026-10-02 (engine-dev)
- **Red on unfixed code:** `test/t0235-drop-floor-cap.test.ts` run before any `src/**` or doc change: 10 failed, 9 passed. AC1, AC2 and AC3 got `{ weightKg: 2.5, reps: 6, … }` instead of 2; the AC4 2 kg/inc 2.5 row and the offline-merged edge case got 2.5; AC5 `W 0.25 inc 1: expected 1 to be 0.25`; AC6 `lightReentry|b15|wutrue|normal|bench-press: expected 2.5 to be less than or equal to 2`; AC7: step 2 lacks `min(W, max(inc, floorInc(0.9 W)))`, the Drop floor bullet lacks `capped at`, no T-0235 Traceability row. AC4's unchanged rows and AC9 (purity) passed before and after.
- **Fix:** `src/prefill.ts`, the `dropped` value only: `round3(min(W, max(inc, floorInc(0.9 × W, inc))))` for a loaded lift with `W > 0`, else 0 (D-0137 §1). Timed `reentry`, kinds and reps are untouched.
- **AC6:** 7 histories (4 simulated, `[]`, `lightReentry`, `lightDeload`) × budgets 15..120 step 5 × warm-up on/off × energy normal/high = 616 plans. Every loaded `reentry`/`deload` pre-fill is ≤ W, > 0 when W > 0, and equals the inline old formula when that is ≤ W, else W. Non-vacuity: `lightReentry` has 2 kg `reentry` pre-fills, `lightDeload` has 2 kg `deload` pre-fills, and the standard histories do reach step 5 (isolations at 8 reps in a 10–15 slot, two sessions at one W) at the unchanged old formula, so the third count is direct (> 0) and the R14-E4/E5 fallback is not needed.
- **AC7:** `git diff main...HEAD -- docs/engine-rules.md` changes rule 14 step 2, step 5, the Drop floor bullet (one sentence plus the worked case), and one Traceability row. Nothing else. The heading, Last performance, steps 1/3/4/6/7, timed paragraph and R14-E1…E9 are byte-identical; the T-0205 guard and every T-0221 test pass unedited.
- **AC8 (changed expectations, D-0143):** no test file literal changed. Two encodings of the superseded formula were moved to D-0137, as D-0137 §4 names these lines:
  - `test/fixtures/rule14-pinned-d0132.ts` `RULE14_D0132.step2`, `.step5` and `.bullets[2]` (Drop floor) now hold the D-0137 §4 text; T-0221's byte-identical test reads them. `RULE14_PINNED` is unchanged.
  - `test/rule-14-properties.test.ts`: the independent oracle's `drop` gains `Math.min(cur.w, …)` (seed 32, leg-curl W 2 inc 5, expected 5 vs the engine's 2). No other oracle line, seed or count changed.
  No frozen `pre-*.json` baseline exists any more (T-0237).
- Gates: engine typecheck, lint and test (39 files, 650 tests) green; `-w format:check` clean; `check-all.mjs` exit 0. The vendored engine copy was not regenerated (orchestrator, D-0053 §1).

### Accept 2026-10-02 (product-owner): done
Branch `t/T-0235-rule-14-drop-floor-cap` at 2eeedb3. QA: done. Review: approved. The `-w` gate passed 19/19.
- **AC1 to AC3:** titled tests in `test/t0235-drop-floor-cap.test.ts`. They return 2 × 6 `reentry`, 2 × 6 `deload`, and through `suggest` a back-off of 2 × 6 with 885 s/15 s derived by hand from rules 7.1 and 7.4. All three were red on main (2.5).
- **AC4:** every table row is tested, plus the edge cases: zero history, 10 days off (`hold_after_break`), timed reentry, offline-merged. R14-E1…E9 and R7-E16 pass unedited.
- **AC5:** the property sweep over W 0.25..200 and inc [1, 1.25, 2, 2.5, 5] hits both branches. It has the `sweep` title and the 30 s budget.
- **AC6:** 616 plans across 7 histories. 176 hit the capped branch and 72 the unchanged one. The standard histories reach step 5 directly, so the R14-E4/E5 fallback is not used. The test compares against the inline formula, not a snapshot.
- **AC7:** the doc test asserts the step 2 and 5 text, the Drop floor bullet tokens, nine R14-E lines and one T-0235 Traceability row. `git diff main...HEAD -- docs/engine-rules.md` touches only rule 14 steps 2 and 5, the Drop floor bullet and Traceability, exactly D-0137 §4.
- **AC8:** the engine suite is green (650 tests). No test literal changed. The pinned D-0132 strings (`step2`, `step5`, `bullets[2]`) and the property oracle's `drop` follow D-0137 under D-0143, because D-0137 §4 names exactly those lines. The T-0221 test file is unedited, and the oracle still catches planted engine faults it doesn't share (QA). This is not the "other changed expectation" that AC8 sends to triage.
- **AC9:** reruns are deep-equal, frozen inputs are not mutated, and engine lint is green.
- **Principles:** principle 3 holds. `prefill` stays pure, the one `src` line matches D-0137 §1, and only `0 < W < inc` results change. No UI, flow or onboarding impact. UF-09.3 now never shows a "drop" heavier than last time.
- **At merge (orchestrator):** regenerate the vendored engine (`node supabase/scripts/vendor.mjs`, then `--check`, D-0053 §1). D-0143 stays `revisit` until a human reviews it.
