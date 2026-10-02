---
id: T-0237
title: "Engine tests: retire the four remaining frozen baselines (pre-t0204-suggest, pre-t0205-suggest, pre-t0219-baseline, pre-t0226-suggest); keep the invariants that don't need the old code"
lane: engine
screens: [UF-08.2, UF-08.3, UF-05.1, UF-10.1, UF-11.1]
decisions: [D-0096, D-0053, D-0092, D-0105]
deps: [T-0236]
status: todo
---
<!-- Written by product-owner 2026-10-02 (groom). Build flow: wl-build-engine. About ½ day. Test-only: `src/**` is unchanged, so there is no vendor regen. Same pattern as T-0236. Engine tickets run one at a time (D-0096 §3): T-0236 → T-0237 → T-0235. T-0235 changes rule 14's reentry prefill, which the pre-t0204 and pre-t0219 baselines freeze (returningAfter10Days), so T-0235 gains T-0237 as a dep. Ready when T-0236 is done. -->

## Why
Four more fixtures freeze `suggest`, `rankSwaps`, `balance` or `evaluateCheckin` output from before an old ticket, and tests deep-equal today's output against them:

| Fixture | Lines | Read by | It proved |
|---|---|---|---|
| `pre-t0204-suggest.json` | ~1.3k | `rule-13-shuffle.test.ts` (AC13) | shuffle 0 changed nothing (T-0204) |
| `pre-t0205-suggest.json` | ~12k | `rule-14-suggest.test.ts` (AC16, AC16/AC23) | rule 14 changed only the prefill (T-0205) |
| `pre-t0219-baseline.json` | ~44k | `rule-7-goal-reps.test.ts` (R7-E14, AC10), `t0219-timed-cost.test.ts` (AC1 line, AC7 × 3, AC9 balance and check-in) | the goal default and the timed cost changed nothing else (T-0219) |
| `pre-t0226-suggest.json` | ~2.5k | `t0226-fits-budget.test.ts` (AC5) | D-0105 didn't touch `suggest` (T-0226) |

Each was a one-time proof, recorded in its ticket's build and accept log. As standing tests they are the trap T-0236 removed for T-0220: the next engine ticket that legitimately changes a plan (T-0235 first) fails them and has to regenerate tens of thousands of lines nobody can review. Where a test also states a real invariant, the invariant stays, computed inline.

## Scope
- In (all under `packages/engine/test/`):
  - `rule-13-shuffle.test.ts`, "rule-13 (AC13) shuffle 0 deep-equals …": drop the `BASELINE` read, `T0205_PREFILL`, `withRule14` and the `toEqual(before)`. Keep the loop over `HISTORIES` × `ENERGIES` and `expect(swapped(w)).toEqual([])`, and add `w.plan.items.length > 0` per case (non-vacuity). The title may drop "deep-equals the pre-T-0204 suggest output" and must keep `rule-13 (AC13)`. "the R7-E4 plan is unchanged at shuffle 0" stays unedited.
  - `rule-14-suggest.test.ts`:
    - "rule-14 (AC16) zero history …": drop the `BASELINE` lookup and `toEqual(before)`. Keep the prefill loop (`first_time`, the weight/reps/duration shape) and `n === 36`.
    - "rule-14 (AC16) (AC23) non-empty histories …": retired (deleted). It is only a deep-equal against the snapshot.
  - `rule-7-goal-reps.test.ts`:
    - "R7-E14 rule-7 (AC1) …": the snapshot line goes. `JSON.stringify(run([], BM))` equals `JSON.stringify(run([], NO_GOAL))`. The existing inline `reps(...)` and other R7-E4 assertions in the test stay.
    - "rule-7 (AC10) …": the same grid, built inline instead of from the snapshot's keys: histories `zero` (`[]`) and the 4 `SIMULATED_HISTORIES`, × energy normal/low/high × budget 15/20/30/90 × warm-up on/off × pins `[]`/`["plank"]`. Each case asserts `JSON.stringify(run(h, NO_GOAL, si))` equals `JSON.stringify(run(h, BM, si))`. `n` is asserted as the literal 240 (5 × 48). The 60 s budget stays.
  - `t0219-timed-cost.test.ts`:
    - the AC1 test with `BASELINE["suggest/zero/normal/20/nowu/plank"]`: that one `toStrictEqual` line goes. The inline values above it stay.
    - the `describe("zero history (and any history without timed sets) is byte-identical (D-0092 §1)")` block (its 3 tests: suggest at `[]`, the simulated histories, the rankSwaps fixtures): retired.
    - "rule-11 (AC9) balance is unchanged …" and "rule-9 (AC9) evaluateCheckin … matches the baseline's last ended period …": retired.
    - Every other T-0219 test (AC8/AC9 identity and caps, the timedCoreHistory test, the sweeps) stays unedited.
  - `t0226-fits-budget.test.ts`: the `PRE` read and the `describe("suggest is byte-identical to the pre-T-0226 snapshot (AC5)")` block are retired.
  - A comment where each retired test was: the frozen comparison was a one-time proof, recorded in that ticket's build and accept log (`docs/tickets/T-0204-…`, `T-0205-…`, `T-0219-…`, `T-0226-…`, by ticket id), retired by T-0237. **The comment never names the fixture file** (so AC3 stays exact).
  - Remove imports, constants and helpers that become unused (`readFileSync`, `TEST_DIR`, `REPO_DIR`, `withoutPrefill`, …) only where lint flags them.
  - Delete the four fixtures.
  - A new `t0237-no-frozen-baselines.test.ts` for AC3.
- Out:
  - `packages/engine/src/**`, `docs/engine-rules.md`, the vendored copy.
  - `pre-t0220-suggest.json` and the T-0220 tests (T-0236).
  - Any other test in the five files.

## Acceptance criteria
New test titles start with `T-0237 ACn`. Rescoped tests keep their rule/AC prefix.
- **AC1 (the rescoped tests pass and aren't vacuous)** With the fixtures deleted:
  - rule-13 AC13: every `HISTORIES` × `ENERGIES` case has `swapped(w)` = `[]` and at least one item, and the case count is asserted as a literal (the number of `HISTORIES` entries × 3, written as a number).
  - rule-14 AC16 zero history: 36 cases, each item `first_time` with the D-0057 prefill shape.
  - R7-E14: `run([], BM)` and `run([], NO_GOAL)` are byte-identical, and the existing R7-E4 assertions pass.
  - rule-7 AC10: 240 cases, each byte-identical between `NO_GOAL` and `BM`.
  - t0219 AC1: the inline plank values (`[45, 375, 45]`, `[1095, 105]`) pass.
- **AC2 (the rescoped invariants catch a real break)** Temporarily make `suggest` treat a missing `goal` as `get_stronger` (one line in `src/`). R7-E14 and rule-7 AC10 must go red. Revert, record the red run in the build log, and don't commit the change.
- **AC3 (the baselines are gone, red on unfixed code)** A test asserts:
  - none of `test/fixtures/pre-t0204-suggest.json`, `pre-t0205-suggest.json`, `pre-t0219-baseline.json`, `pre-t0226-suggest.json` exists;
  - no `.ts` file under `packages/engine/test/` (recursively) contains any of the strings `pre-t0204-suggest`, `pre-t0205-suggest`, `pre-t0219-baseline`, `pre-t0226-suggest`, apart from this test file itself.
  - On `main` both fail. Record the red run in the build log.
- **AC4 (no behaviour change)** `git diff --stat main...HEAD -- packages/engine/src` is empty (record it). The T-0236 guard (`t0236-no-t0220-snapshot.test.ts`), the T-0230 budget guard and the traceability tests (`t0204-traceability.test.ts` AC27: R12-E1…R12-E5 still start titles in `rule-12-swaps.test.ts`) pass unedited. The build log lists each retired test by title and the engine test count before and after.
- **AC5** `npx -y pnpm@10.28.2 --filter @workoutlab/engine typecheck lint test` is green.

## Paths you may change
- `packages/engine/**` (the lane: `engine`).
- **Listed extras:**
  - `docs/tickets/T-0237-retire-frozen-engine-baselines.md`: this file, for the build and accept log.

## Contract impact
none (`docs/engine-rules.md` and `api/openapi.yaml` unchanged)

## Coordination
- Files: the five test files above, the four fixtures (deleted), and the new guard test.
- Engine lane, one ticket at a time (D-0096 §3): after T-0236, before T-0235. Add T-0237 to T-0235's deps (orchestrator, board).
- No vendor regen: `src/**` is unchanged (D-0053 §1). The orchestrator still runs `node supabase/scripts/vendor.mjs --check` at merge.
- After this, no frozen whole-output baseline is left in `packages/engine/test/fixtures/`. A future ticket that needs a "nothing else changed" proof records it in its build log rather than committing the snapshot (the T-0236/T-0237 pattern).

## Definition of done
Tests for every AC pass · `npx -y pnpm@10.28.2 -w typecheck lint test --force --concurrency=1` green · contracts unchanged · commit messages start with `T-0237` (e.g. `T-0237: retire the four frozen engine baselines; keep the inline invariants`).

## Build / accept log

### Build (engine-dev, 2026-10-02)
- **AC1:** these tests no longer read a fixture. Each one keeps its rule/AC prefix:
  - `rule-13-shuffle.test.ts`: the test is now "rule-13 (AC13) shuffle 0 swaps nothing for every history and energy". It loops over `HISTORIES` × `ENERGIES` and checks `swapped(w)` = `[]` and `w.plan.items.length > 0`. The case count is pinned as the literal `15` (5 × 3). `BASELINE`, `T0205_PREFILL`, `withRule14` and the fs/path imports are gone. "the R7-E4 plan is unchanged at shuffle 0" was not edited.
  - `rule-14-suggest.test.ts`: the test is now "rule-14 (AC16) zero history: every item is first_time with the D-0057 prefill shape (…)". It keeps the prefill loop and the `first_time` reason, adds `items.length > 0`, and pins `n === 36`. `BASELINE` and `withoutPrefill` are gone.
  - `rule-7-goal-reps.test.ts`: R7-E14 (AC1) now checks `JSON.stringify(run([], BM)) === JSON.stringify(run([], NO_GOAL))`, and the inline `reps` assertion stays. The test is now "rule-7 (AC10) suggest is byte-identical under F-profile and with no goal key (history × energy × budget × warm-up × pins)". It builds its grid inline: zero plus the 4 `SIMULATED_HISTORIES`, × normal/low/high × 15/20/30/90 × wu on/off × `[]`/`["plank"]`. It checks NO_GOAL against BM and pins `n === 240`. The 60 s budget is kept.
  - `t0219-timed-cost.test.ts`: R7-E13 (AC1) contrast lost only the `toStrictEqual(BASELINE[…])` line. The inline `[45, 375, 45]` and `[1095, 105]` checks stay.
- **Retired** (each one has a comment that cites its ticket's build/accept log and T-0237, and none names the fixture file):
  - `rule-14 (AC16) (AC23) non-empty histories: selection, sets, costs and totals equal the pre-T-0205 result`
  - `rule-7 (AC7) suggest at [] over energy × budget × warm-up × pins equals the pre-change snapshot`
  - `rule-7 (AC7) the simulated histories without timed sets are byte-identical too`
  - `R12-E1 R12-E2 R12-E3 R12-E4 R12-E5 rule-12 (AC7) rankSwaps over the R12 fixtures equals the pre-change snapshot`. R12-E1…E5 still start titles in `rule-12-swaps.test.ts`, so T-0204 AC27 passes without edits.
  - `rule-11 (AC9) balance is unchanged by this ticket for every history`
  - `rule-9 (AC9) evaluateCheckin (F-checkin via checkinSessions) matches the baseline's last ended period for every history`
  - `rule-12 (AC5) every AC4 fresh plan equals the snapshot captured on main before D-0105` (t0226)
- Imports that lint flagged as unused were removed (`readFileSync`, `path`, `fileURLToPath`, `TEST_DIR`, `balance`, `checkinSessions`, `evaluateCheckin`, `CheckinEvaluation`, `F_CHECKIN`/`NO_CHECKINS`/`sessionRefsOf`, `fSwap` in t0219).
- The four fixtures were deleted with `git rm`.
- **AC2 red:** for this run only, `goalOf` in `src/session.ts:289` returned `"get_stronger"` for a missing goal. `vitest run test/rule-7-goal-reps.test.ts -t "R7-E14|AC10"` gave 2 failed: R7-E14 (AC1) with `expected '{"plan":…' to be '{"plan":…'`, and rule-7 (AC10) at `zero/normal/15/wu/none`. Reverted from a byte copy: `git status packages/engine/src` is clean and nothing was committed.
- **AC3:** the new `test/t0237-no-frozen-baselines.test.ts` has 2 `T-0237 AC3` cases. One checks that none of the 4 fixtures exists. The other checks that no `.ts` under `test/` (recursive, excluding itself, more than 30 files scanned) contains any of the 4 names, which the file builds from parts. **Red on unfixed code:** with main's 5 test files and 4 fixtures restored, both fail: `expected [ 'pre-t0204-suggest', …(3) ] to deeply equal []` and `expected [ …(5) ] to deeply equal []`. The files were restored afterwards.
- **AC4:** `git diff --stat main...HEAD -- packages/engine/src` is empty. Engine tests went from 636 (37 files) to 631 (38 files): 7 retired and 2 added. The T-0236 guard, the T-0230 budget guard (`test-budgets.test.ts`) and `t0204-traceability.test.ts` pass without edits.
- **AC5:** engine `typecheck`, `lint` and `test` (631 passed) are each green under `flock`. `-w format:check` is clean. `node .github/scripts/check-all.mjs` exits 0, and so does `node supabase/scripts/vendor.mjs --check` (src is unchanged, so no regen).
