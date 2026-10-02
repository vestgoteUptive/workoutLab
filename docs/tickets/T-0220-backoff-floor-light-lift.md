---
id: T-0220
title: "Engine: the High-energy back-off is never 0 kg on a light loaded main lift; it gets one increment, capped at the main weight (D-0131)"
lane: engine
screens: [UF-08.1, UF-08.2, UF-08.3, UF-05.1, UF-09.3]
decisions: [D-0131, D-0057, D-0040, D-0093, D-0096, D-0053]
deps: [T-0205]
status: ready
---
<!-- Written by product-owner 2026-10-02 (groom). Build flow: wl-build-engine. About ½ day. Engine behaviour change: it needs the simulated 14-day history tests, and the orchestrator regenerates the vendored engine at merge (D-0053 §1). Engine tickets run one at a time (D-0096 §3). Order: T-0220 → T-0221 → T-0212 → T-0211. This one goes first because it is the only user-visible defect of the four. -->

## Why
A beginner benching 2.5 kg with High energy gets a back-off of `floorInc(0.9 × 2.5) = floorInc(2.25) = 0` kg. UF-08.2 shows "back-off 0 kg × 6", and UF-09.3 pre-fills an empty bar. `applySwap` has the same defect: bench-press at 2 kg swapped to db-bench-press (inc 2) carries 2 kg, and its back-off is `floorInc(1.8, 2) = 0`.

D-0131 applies the D-0057 §4 floor of one increment, capped at the main weight so the back-off is never heavier than the main sets. Principle 3 holds: the rule stays a pure function, and only the 0 kg case changes.

## Scope
- In:
  - The one back-off helper (`backoffOf` in `packages/engine/src/session.ts`, or wherever it lives on `main`). Per D-0131 §1, with `inc = incrementKg ?? 2.5`:
    - `w` null → null;
    - `w = 0` → 0;
    - `w > 0` → `min(w, max(inc, floorInc(0.9 × w, inc)))`, rounded to 3 decimals.
  - Both callers keep using that helper: `suggest`'s rule 7.4 and `applySwap`'s rule 12.1 recompute (D-0131 §2).
  - `docs/engine-rules.md` per D-0131 §3:
    - the rule 7.4 High sentence;
    - the rule 12.1 back-off phrase;
    - the new R7-E16 line directly after R7-E12: "**R7-E16 (light-lift back-off, D-0131)** Given bench-press as the main lift, logged 2.5 × 6, 6, 6 on 09-24, with `budgetMin 15`, warm-up off and High energy, Then bench-press × 4 at 2.5 × 7 (`add_rep`) + back-off 2.5 × 6 (`floorInc(2.25)` is 0, raised to one increment), 885 s. Logged at 2 kg: 2 × 7, back-off 2 × 6 (never above the main weight).";
    - one Traceability row.
  - Tests: every AC below, including the simulated 14-day histories.
  - Edge cases:
    - zero history (null weight stays null);
    - a bodyweight main lift (0 stays 0);
    - a loaded lift logged at 0 kg (0 stays 0, D-0062 §4);
    - an off-grid weight below one increment (2 kg on inc 2.5 → 2);
    - returning after 10 days off (`hold_after_break` weight feeds the back-off);
    - offline-merged history;
    - a time budget too short for a back-off (none is added, unchanged).
- Out:
  - When a back-off is added (the `unusedS ≥` one-set-cost check), its reps, its cost and the `energy_high_backoff` reason.
  - Rule 14's `reentry`/`deload` floor (D-0057 §4, uncapped). That is a separate product follow-up (D-0131 Consequences).
  - `api/openapi.yaml` (`Backoff` is unchanged).
  - Any web code.
  - The vendored engine copy (regenerated at merge).

## Acceptance criteria
**Fixtures unless an AC says otherwise:** F-tz (`NOW = "2026-09-27T12:00:00+02:00"`, `TZ`), F-targets, F-profile (`build_muscle`), `LIBRARY`. `light(w)` = `setsOn(3, "bench-press", "2026-09-24", {weightKg: w, reps: 6})` (all three sets at `w` × 6). `hi15` = `input({mainLiftId: "bench-press", budgetMin: 15, warmupInBudget: false, energy: "high"})`. Each new test title starts with `T-0220 ACn`. The AC1 test title also contains `R7-E16`.

- **AC1 (R7-E16, the board repro)**
  - **Given** `light(2.5)` and `hi15`, **When** `suggest` runs, **Then**:
    - the items are `[bench-press × 4]` with `prefill` 2.5 × 7 `add_rep`;
    - `backoff` is `{weightKg: 2.5, reps: 6}`;
    - `itemsTotalS` is 885 and `unusedS` is 15.
  - **Red on unfixed code:** on `main` the back-off is `{weightKg: 0, reps: 6}`. Record the red run in the build log.
- **AC2 (cap at the main weight)** **Given** `light(2)` and `hi15`, **Then** the prefill is 2 × 7 and the back-off is `{weightKg: 2, reps: 6}`. It is never 2.5, which would be heavier than the main sets. On `main` it is 0.
- **AC3 (applySwap recompute, rule 12.1)**
  - **Given** `w = suggest(light(2), …, hi15)`, **When** `applySwap(w, "bench-press", "db-bench-press", null, light(2), F_PROFILE, LIBRARY, NOW, TZ)` runs, **Then**:
    - the item is db-bench-press × 4 at 2 × 6 `carry`;
    - the back-off is `{weightKg: 2, reps: 6}` (on `main`: `floorInc(1.8, 2) = 0`);
    - `costS` is 885.
  - Contrast: R12-E10 (80 kg → 72 × 6 back-off) passes unedited.
- **AC4 (unchanged cases)** Unit tests on the helper:

  | main weight | inc | back-off |
  |---|---|---|
  | null | 2.5 | null |
  | 0 | 2.5 | 0 |
  | 0 | null (bodyweight) | 0 |
  | 2.5 | 2.5 | 2.5 |
  | 2 | 2.5 | 2 |
  | 2 | 2 | 2 |
  | 2.75 | 2.5 | 2.5 |
  | 2.8 | 2.5 | 2.5 |
  | 5 | 5 | 5 |
  | 80 | 2.5 | 70 |
  | 80 | 2 | 72 |
  | 100 | 2.5 | 90 |

  Also: R7-E12 (885 s, 1 back-off), R14-E9 (80 × 6 → 70 × 6) and R12-E10 pass unedited.
- **AC5 (only the old-0 case changes, property)**
  - **Given** the helper and the old formula `floorInc(0.9 × w, inc)` computed inline in the test.
  - **When** `w` runs over `0.5..200` step 0.25 and `inc` over `[1, 1.25, 2, 2.5, 5]`, **Then**:
    - new = old wherever old > 0;
    - new = `min(w, inc)` wherever old = 0 and `w > 0`;
    - always `0 < new ≤ w`.
  - The test asserts both branches are hit (non-vacuity: a count > 0 each).
- **AC6 (simulated 14-day histories)**
  - **Given** each of `balancedHistory`, `allChestNoLegsHistory`, `returningAfter10DaysHistory`, `offlineMergedHistory`, `[]`, plus a new light 14-day history: `light(2.5)` on 2026-09-15, 2026-09-19 and 2026-09-24, each at 10:00, with distinct sessionIds and clientIds.
  - **When** `suggest` runs at High energy with `mainLiftId: "bench-press"` for `budgetMin` 15..120 step 5, warm-up on and off, **Then** for every main item with a back-off:
    - the back-off weight is null when the prefill weight is null, 0 when it is 0, and otherwise in `(0, prefill weight]`;
    - it equals the old formula whenever the old formula is > 0.
  - For every input, the whole `suggest` output deep-equals the old output except the back-off weight. Compute the old output on `main` and store it as a test snapshot, or compute the old back-off inline. Changes appear only on the light history.
  - **Non-vacuity:** at least one light-history case has a back-off of 2.5 kg, and at least one standard-history case has a back-off unchanged from the old formula.
  - The test has the `30_000` runtime budget (T-0230 guard).
- **AC7 (the contract text, D-0131 §3)** A Vitest test reads `docs/engine-rules.md` and asserts:
  - the `### 7.4` section's High sentence contains `max(inc, floorInc(0.9 × main weight))` (or the D-0131 §1 formula in equivalent notation that names `min(` and `max(inc`) and cites D-0131;
  - a `- **R7-E16` line sits after the `- **R7-E12` line and before `## 8.`, contains `2.5 × 6` and cites D-0131;
  - the §12.1 Item bullet cites D-0131 for the back-off;
  - the Traceability table has exactly one T-0220 row.

  Per D-0096 §2, add no "every other section unchanged" test. Run `git diff main...HEAD -- docs/engine-rules.md` and list the changed sections in the result and the commit message. Expected: §7.4, §12.1 Item bullet, Traceability. The T-0204, T-0205 and T-0224 guards pass unedited, because none of these sections is in their slices.
- **AC8 (existing tests)** Every existing engine test passes. If an existing literal expects a 0 kg back-off with a positive main weight, update only that literal to the D-0131 value and cite D-0131 in a comment. List each one in the build log. Any other changed expectation means stop and raise triage.
- **AC9 (purity)** The AC1–AC3 calls give deep-equal reruns and don't throw or mutate deep-frozen inputs. `pnpm --filter @workoutlab/engine lint` passes.

## Paths you may change
- `packages/engine/**` (the lane: `engine`).
- **Listed extras:**
  - `docs/engine-rules.md`: the rule 7.4 High sentence, the new R7-E16 line after R7-E12, the back-off phrase in the §12.1 Item bullet, and one Traceability row (D-0131 §3).
  - `docs/tickets/T-0220-backoff-floor-light-lift.md`: this file, for the build and accept log.

## Contract impact
- `docs/engine-rules.md` §7.4, §12.1 (Item bullet) and Traceability change under D-0131. The engine lane owns this contract.
- `api/openapi.yaml` is unchanged.

## Coordination
- Files: the back-off helper in `src/session.ts` (and `src/energy.ts` if the helper moves there), a new `test/t0220-backoff-floor.test.ts`, and `docs/engine-rules.md`.
- Engine lane, one ticket at a time (D-0096 §3). Run it first, then T-0221, T-0212 and T-0211. T-0221 also edits `docs/engine-rules.md` (rule 14 and Traceability), so T-0221 rebases on this.
- Vendor regen: `src/**` changes, so the orchestrator runs `node supabase/scripts/vendor.mjs` at merge and then `--check` (D-0053 §1).

## Definition of done
Tests for every AC pass, including the AC6 simulated 14-day histories · `npx -y pnpm@10.28.2 -w typecheck lint test --force --concurrency=1` is green · the contract change is linked to D-0131 · commit messages start with `T-0220` and cite UF-08.2 (e.g. `T-0220 UF-08.2: back-off floor of one increment on light lifts (D-0131)`).

## Build / accept log
Archived in `docs/tickets/log/T-0220.md` (D-0157).
