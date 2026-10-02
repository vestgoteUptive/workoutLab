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

### Build 2026-10-02 (engine-dev)
- **Red on unfixed code:** `test/t0220-backoff-floor.test.ts` run before the fix: 14 failed. AC1 `expected { weightKg: +0, reps: 6 } to deeply equal { weightKg: 2.5, reps: 6 }`; AC2 and AC3 got `{ weightKg: 0, reps: 6 }` (AC3: `floorInc(1.8, 2) = 0`); AC4 rows 2.5/2.5, 2/2.5, 2/2, 2.75/2.5, 5/5 got 0; AC5 `w 0.5 inc 1: expected +0 to be 0.5`; AC6 `light|b15|wuoff: expected 0 to be greater than 0`; AC7 four text checks. AC9 (purity) passed before and after.
- **Fix:** `backoffWeightKg(w, inc)` in `src/energy.ts` (D-0131 §1); `backoffOf` in `src/session.ts` calls it, so `suggest` (rule 7.4) and `applySwap` (rule 12.1, via `buildItem`) share it (D-0131 §2). No public export added.
- **AC6 snapshot:** `test/fixtures/pre-t0220-suggest.json` was captured on the unfixed code (6 histories × budgets 15..120 step 5 × warm-up on/off = 264 plans, 147 back-offs). After the fix every plan deep-equals the snapshot with back-off weights blanked; only `light|…` back-offs differ (0 → 2.5).
- **AC7:** `git diff main...HEAD -- docs/engine-rules.md` changes §7.4 (High sentence, new R7-E16 line), the §12.1 Item bullet and one Traceability row. The T-0204, T-0205 and T-0224 guards pass unedited.
- **AC8:** no existing literal changed; all 34 engine test files (595 tests) pass unedited.
- Gates: engine typecheck, lint and test green; `-w format:check` clean; `check-all.mjs` exit 0. The vendored engine copy was not regenerated (orchestrator, D-0053 §1).

### Accept (2026-10-02, product-owner): done
Checked at HEAD 3365846 against each AC.
- AC1: `T-0220 AC1 R7-E16` asserts bench-press × 4 at 2.5 × 7 `add_rep`, back-off `{2.5, 6}`, 885 s, `unusedS` 15. Red on main (`weightKg: 0`).
- AC2: the 2 kg case gives a 2 × 6 back-off, capped at the main weight. Red on main.
- AC3: the `applySwap` bench-press → db-bench-press case carries 2 × 6, the back-off is 2 × 6, and the cost is 885 s. R12-E10 passes unedited. Red on main (`floorInc(1.8, 2) = 0`).
- AC4: an `it.each` covers all 12 helper rows. R7-E12, R14-E9 and R12-E10 pass unedited.
- AC5: the property sweep over `w` 0.5..200 and inc [1, 1.25, 2, 2.5, 5] checks both branches with non-vacuity counts.
- AC6: 6 histories × budgets 15..120 × warm-up on/off = 264 plans, compared against `test/fixtures/pre-t0220-suggest.json`, which was captured on unfixed code. QA confirmed it deep-equals main's own output. Outside the back-off weight, every plan is strict-equal. The only weight changes are on the light history (0 → 2.5). Both non-vacuity counts are > 0, and the test has the 30 000 ms budget. This covers the simulated 14-day history DoD item.
- AC7: four text checks cover the §7.4 High sentence, R7-E16 after R7-E12 and before §8, the §12.1 Item bullet, and one Traceability row. The diff touches §7.4, the §12.1 Item bullet and Traceability only. The T-0204, T-0205 and T-0224 guards pass unedited.
- AC8: no existing literal changed. Engine tests are 595/595.
- AC9: reruns of the AC1–AC3 calls are deep-equal on deep-frozen inputs, and engine lint is green.
- QA planted three faults and each went red: cap dropped (3 failed), floor dropped (10 failed), applySwap bypassing the helper (1 failed). The `-w` gate is 19/19. The vendored engine regenerates and passes `--check` and `deno check`. The orchestrator regenerates it at merge (D-0053 §1).
- Principles hold. The engine stays pure and deterministic (principle 3): one helper, shared by rule 7.4 and rule 12.1, and only the old-0 case changes. No UI or API change. The contract change is linked to D-0131.
- Follow-ups: T-0236 (retire or rescope the AC6 frozen snapshot before the next suggest-changing engine ticket; non-blocking review item). The uncapped rule 14 `reentry`/`deload` floor stays a separate product follow-up (D-0131 Consequences).
