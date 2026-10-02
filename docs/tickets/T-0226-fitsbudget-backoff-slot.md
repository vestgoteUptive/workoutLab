---
id: T-0226
title: "Engine: rankSwaps fitsBudget counts the back-off set applySwap re-adds, so fitsBudget agrees with applySwap on every plan (D-0105, supersedes D-0056 §3 in part)"
lane: engine
screens: [UF-05.1, UF-08.3, UF-09.9, UF-09.6]
decisions: [D-0056, D-0092, D-0093, D-0096, D-0105]
deps: [T-0224, T-0214]
status: ready
---
<!-- Written by product-owner 2026-10-02 (groom mode). Build flow: wl-build-engine. About ¼ day. Engine tickets run one at a time (D-0096 §3). T-0214 is merged, so this ticket starts once T-0214 is done and merged: T-0224 → T-0214 → T-0226. -->

## Why
Principle 2: the time budget is a first-class input, so a candidate marked "fits" must not push the plan over budget.

`rankSwaps` computes `fitsBudget` on a back-off slot as `itemsTotalS − slot.costS + timeCostS` (`packages/engine/src/swaps.ts`, the `fits` callback in `rankSwaps`). That leaves out the back-off set `applySwap` re-adds (D-0093 §2), so it can report `true` while `applySwap`'s result is over budget. A fresh `suggest` plan never hits this. A plan that is already over budget after a `fitsBudget: false` accessory swap does (D-0093 §5).

QA repro:
- Setup: `balancedHistory`, `budgetMin 31`, warm-up off, energy high.
- Applying leg-extension → back-squat gives `itemsTotalS` 1995 against `available` 1860.
- On the main slot, `rankSwaps` then says bench-press and push-up fit, but `applySwap` gives 1995. A sweep found 26 such mismatches.

D-0105 fixes the formula. SwapSheet (UF-05.1 from UF-09.9 and UF-09.6, and UF-08.3) keeps rendering what the engine returns.

## Scope
- In:
  - `packages/engine/src/swaps.ts`, per D-0105 §1–§2:
    - `fitsBudget` adds `setCostS(candidate)` at the candidate's planned duration when `slot.backoff` is non-null and the candidate is not timed.
    - The "gets a back-off" predicate is one function, shared with `applySwap`'s item build (`src/apply-swap.ts` / `src/session.ts` `buildItem`).
    - `rankAgainst`'s `fits` callback may take the candidate exercise as a second argument. Rule 13's always-true caller is unchanged.
  - `docs/engine-rules.md`, per D-0105 §5:
    - one `**fitsBudget**` bullet in §12.1;
    - worked example R12-E12;
    - one Traceability row.
  - Tests: every AC below, including the simulated 14-day histories and already-over-budget plans.
  - Edge cases:
    - an over-budget plan, which is reachable after an accessory swap;
    - zero history;
    - returning after 10 days off;
    - offline-merged history;
    - a timed candidate on a back-off slot (extra 0), if the library has one;
    - a slot without a back-off (unchanged).
- Out:
  - `timeCostS` and its meaning (unchanged, D-0105 §3).
  - `api/openapi.yaml`.
  - Ranking order.
  - Rule 13's shuffle fit check.
  - SwapSheet UI (T-0306b).
  - The vendored engine copy (regenerated at merge, D-0053 §1).

## Acceptance criteria
**Fixtures unless an AC says otherwise:**
- F-tz (`now = "2026-09-27T12:00:00+02:00"`), F-targets, F-profile, `LIBRARY`.
- The histories in `test/fixtures/histories.ts` and T-0219's `timedCoreHistory`.
- `W_h` and `H_b` exactly as in T-0224 (R14-E9: bench-press × 4 main, `backoff {70, 6}`, `costS` 885, `budgetMin 15`, warm-up off, energy high, `available` 900, `unusedS` 15).
- `avail(w)` = `availableS(w.budgetMin, w.warmupInBudget)`.
- Each AC is at least one Vitest test. The R12-E12 test's title starts with `R12-E12`.

- **AC1 (the QA repro)**
  - **Given**
    - `w = suggest(balancedHistory, F_TARGETS, F_PROFILE, LIBRARY, input({budgetMin: 31, warmupInBudget: false, energy: "high"}), now, tz)`;
    - `o = applySwap(w, "leg-extension", "back-squat", null, balancedHistory, F_PROFILE, LIBRARY, now, tz)`.
  - The test first asserts these preconditions:
    - `o.itemsTotalS` is 1995 and `avail(o)` is 1860;
    - `o`'s main item has a non-null `backoff`;
    - `rankSwaps(main, null, o, …, balancedHistory, …)` contains bench-press and push-up.
  - If any precondition differs, stop and record the observed literals in the result instead of editing them to fit.
  - **When** `rankSwaps(o.plan.mainLiftId, null, o, F_PROFILE, LIBRARY, balancedHistory, now, tz)` runs, **Then**:
    - bench-press and push-up have `fitsBudget: false`;
    - `applySwap(o, main, "bench-press", null, …).itemsTotalS` is 1995, and the same holds for push-up.
  - The test comment records that both were `true` before the fix.
- **AC2 (R12-E12, a hand-derived over-budget back-off slot)**
  - **Given** `W_o = {...W_h, budgetMin: 14, unusedS: 0}`: `available` 840, `itemsTotalS` 885.
  - **When** `rankSwaps("bench-press", null, W_o, F_PROFILE, LIBRARY, H_b, now, tz)` runs, **Then**:
    - the list contains db-bench-press and push-up;
    - every non-timed candidate has `timeCostS` 720 (4 × 165 + 60, unchanged) and `fitsBudget: false`, because 885 − 885 + 720 + 165 = 885 > 840 (before the fix, 720 ≤ 840 gave `true`);
    - `applySwap(W_o, "bench-press", "db-bench-press", null, H_b, …).itemsTotalS` is 885.
  - **Contrast:** on `W_h` (`available` 900), the same call marks every non-timed candidate `fitsBudget: true` (885 ≤ 900).
- **AC3 (no back-off, no change)**
  - **Given** a slot with `backoff: null`. **Then** `fitsBudget` equals the D-0056 §3 value.
  - R12-E2 (all `true`) and R12-E11's contrast (back-squat `false`) pass unedited.
  - On `{...W, budgetMin: b}` for `b` in 25, 27 and 30 (T-0224's W has no back-off), every candidate of every slot keeps its pre-change `fitsBudget`. Compute the D-0056 §3 formula inline in the test as the oracle.
- **AC4 (property sweep: fitsBudget is exactly applySwap's budget check)**
  - **Plans:** for each of `balancedHistory`, `allChestNoLegsHistory`, `returningAfter10DaysHistory`, `offlineMergedHistory`, `timedCoreHistory` and `[]`, at F-input, at `{budgetMin: 15, warmupInBudget: false, energy: "high"}` and at `{budgetMin: 31, warmupInBudget: false, energy: "high"}`:
    - the fresh `w = suggest(…)`;
    - every over-budget plan `o = applySwap(w, k, c, null, …)` for each accessory item `k` and each `rankSwaps` candidate `c` of `k` with `fitsBudget: false`. Cap it at the first two such `c` per `k` to bound runtime.
  - **Check:** for every plan `p`, every item `j` of `p`, and every candidate `c` of `rankSwaps(p.plan.items[j].exerciseId, r, p, …)` with `r` in `[null, "short_on_time"]`, `c.fitsBudget === (applySwap(p, p.plan.items[j].exerciseId, c.exerciseId, r, …).itemsTotalS ≤ avail(p))`. The sweep also includes AC1's over-budget plan explicitly, and asserts at least one candidate whose `fitsBudget` differs from the pre-D-0105 formula (non-vacuity).
  - **Non-vacuity:**
    - at least one checked `(p, j, c)` has a back-off slot, `p.itemsTotalS > avail(p)`, and `fitsBudget: false`, where the D-0056 §3 formula would give `true`;
    - the test counts these cases and asserts the count is > 0.
  - The test uses the 30 s runtime budget of the other engine sweeps (T-0225).
- **AC5 (`suggest` byte-identical)**
  - Every existing engine test passes with no expectation edited, including:
    - T-0224's `rule-12-apply-swap.test.ts` and `apply-swap-histories.test.ts` (AC12's `fitsBudget` agreement on fresh plans);
    - T-0219's pre-change `suggest` snapshot;
    - T-0214's goal tests.
  - For every plan in AC4's fresh set, `suggest`'s output deep-equals a snapshot captured on `main` before this change. Rule 13's shuffle path is unaffected.
  - If any `suggest` field changes, stop and raise triage.
- **AC6 (one predicate)**
  - The back-off condition is one exported engine function (unit-tested: `true` for a non-timed candidate on a slot with `backoff`, `false` for a timed candidate or a slot with `backoff: null`).
  - Both `applySwap`'s build and `rankSwaps`' `fitsBudget` call it. A test asserts this through behaviour: on `W_h`, for every candidate, `applySwap`'s item has a non-null `backoff` exactly when `costS − timeCostS` equals that candidate's `setCostS`; contrast on `W` (main slot with `backoff: null`): no candidate's item gets a back-off and `costS === timeCostS`.
- **AC7 (the contract text, D-0105 §5)** A Vitest test reads `docs/engine-rules.md` and asserts:
  - a line starting `- **fitsBudget` sits between the `### 12.1 applySwap` heading and `## 13.`, and cites D-0105;
  - a line starting `- **R12-E12` exists in §12.1 and cites D-0105;
  - the Traceability table has exactly one T-0226 row;
  - T-0204's and T-0224's guards (rule 12 up to R12-E5, and rule 13, against `main`) still pass unedited.

  Per D-0096 §2 there is no committed "every other section unchanged" test. Before returning, run `git diff main...HEAD -- docs/engine-rules.md` and list the changed sections in the result and the commit message. The expected sections are §12.1 (one bullet and R12-E12) and Traceability.
- **AC8 (purity, determinism)** For AC1, AC2 and AC4's calls:
  - deep-frozen inputs neither throw nor change;
  - reruns are deep-equal;
  - reversing `history` or `library` gives deep-equal `rankSwaps` lists;
  - `pnpm --filter @workoutlab/engine lint` passes.

## Paths you may change
- `packages/engine/**` (the lane: `engine`).
- **Listed extras:**
  - `docs/engine-rules.md`: one `**fitsBudget**` bullet and the R12-E12 worked example inside §12.1, plus one Traceability row (D-0105 §5). The edit stays inside those two places, and AC7 lists the guarded sections.
  - `docs/tickets/T-0226-fitsbudget-backoff-slot.md`: this file, for the accept log.

## Contract impact
- `docs/engine-rules.md` §12.1 and Traceability change under D-0105 (the engine lane owns this contract).
- `api/openapi.yaml` is unchanged: the `SwapCandidate` shape and `timeCostS` keep their meaning (D-0105 §3).

## Coordination
- **Files this ticket changes:**
  - `packages/engine/src/swaps.ts`;
  - the shared back-off predicate in `src/session.ts` or `src/apply-swap.ts`;
  - possibly `src/index.ts`;
  - a new `test/t0226-fits-budget.test.ts`;
  - `docs/engine-rules.md` §12.1 and Traceability.
- **Engine tickets run one at a time** (D-0096 §3). Rebase on `main` after T-0214 merges, because T-0214 also edits `src/apply-swap.ts`.
- The vendored engine is regenerated by the orchestrator at merge (D-0053 §1).

## Definition of done
- Tests for every AC pass, including R12-E12 and the AC4 sweep.
- `npx -y pnpm@10.28.2 -w typecheck lint test --force` is green.
- The contract change is linked to D-0105.
- Commit messages start with `T-0226` and cite UF-05.1 (e.g. `T-0226 UF-05.1: fitsBudget counts the back-off set`).

## Accept log
- 2026-10-02, product-owner (accept), branch at 06ce3f5: **done**.
  - AC1–AC8 each map to tests in `packages/engine/test/t0226-fits-budget.test.ts`; QA PASS on all eight. Engine suite: 543 tests (528 existing, unedited, plus 15 new).
  - AC5: with `main`'s `src` swapped in, the snapshot and all 528 existing tests pass, and only the 5 expected new tests fail. So `suggest` is byte-identical and the snapshot reflects `main`.
  - AC4 non-vacuity counts confirmed (252/8/4/64). Mutation faults C, D and F go red. Fault E (`defaultDurationS` vs planned) is an equivalent mutant, because non-timed sets always cost 45 s of work.
  - AC7: `docs/engine-rules.md` has the `**fitsBudget**` bullet and R12-E12 in §12.1 (both cite D-0105) and one T-0226 Traceability row.
  - Principle 2 holds: a "fits" candidate can no longer push the plan over budget, including on plans that are already over budget. Principle 3 holds: the change is pure and deterministic (AC8). `timeCostS`, `api/openapi.yaml` and ranking order are unchanged.
  - Non-blocking: the `session.ts` ↔ `swaps.ts` import cycle (safe in ESM). Load-only timeouts under parallel turbo are already tracked in T-0379.
