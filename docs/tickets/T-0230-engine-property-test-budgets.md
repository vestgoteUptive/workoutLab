---
id: T-0230
title: "Engine tests: give the R7-E8 AC14 and simulated-histories seeded property tests the explicit 30 s runtime budget, plus a guard that every sweep or seeded test has one"
lane: engine
screens: [UF-08.1, UF-10]
decisions: [D-0096, D-0053]
deps: []
status: done
---
<!-- Written by product-owner 2026-10-02 (groom). Build flow: wl-build-engine. About ⅛ day. Follow-up from the T-0228 QA. The timeouts happen on pre-T-0228 code too. Engine tickets run one at a time (D-0096 §3): run this before or after T-0231, never alongside it. Test-only, so no vendor regen is needed (only `src/**` is vendored). -->

## Why
Four engine property tests have no explicit timeout. Under the parallel turbo gate they hit vitest's 5 s default, though each takes about 0.6 s alone. That gives load-only reds on the gate (T-0228 QA). T-0225 (folded into T-0224) fixed the same problem for the other sweeps by giving each one a `30_000` runtime budget. These four were missed, and nothing stops the next new sweep from being missed too. The budget only bounds runtime: no assertion, seed count or range changes. Principle 3 (deterministic engine) is untouched.

## Scope
- In:
  - `packages/engine/test/rule-7-histories.test.ts`: add `30_000` as the third argument of both tests in `describe("R7-E8 never over budget (property)")`:
    - "R7-E8 rule-7 (AC14) budget sweep 15..120 …"
    - "R7-E8 rule-7 (AC14) 200 seeded histories …"
  - `packages/engine/test/simulated-histories.test.ts`: add `30_000` to:
    - "rule-5 never negative deficit, … (300 seeds)"
    - "rule-0 history order never changes balance() … (200 seeds)"
  - Use the trailing comment the existing ones use: `}, 30_000); // runtime budget only (sweep)`.
  - A new `packages/engine/test/test-budgets.test.ts`: the guard in AC2.
- Out:
  - Any change to a test body, seed count, range or assertion.
  - The vitest config. A global `testTimeout` would hide slow unit tests, so it stays at the default.
  - `packages/engine/src/**`.
  - `docs/engine-rules.md`.

## Acceptance criteria
Each new test title starts with `T-0230 ACn`.
- AC1 (the four budgets)
  - **Given** the four tests named in Scope, **When** the engine suite runs, **Then** each has an explicit timeout of `30_000`.
  - Their bodies are byte-identical to main: the diff in those two files only adds `, 30_000` and the trailing comment, at the four closing `})` lines. Record the diff in the build log. Don't assert it in a test (state.md trap).
- AC2 (the guard)
  - **Given** every `packages/engine/test/*.test.ts` file, parsed with the TypeScript compiler API (`ts.createSourceFile`), **When** `test-budgets.test.ts` collects every `it(…)` or `test(…)` call whose first argument is a string or template literal matching `/\b(sweep|seeds?|seeded)\b/i`, **Then** each one has a third argument that is ≥ `30000` and is either a numeric literal or an identifier bound by a file-level `const NAME = <numeric literal>` (e.g. `t0219-timed-cost.test.ts` `SWEEP_TIMEOUT_MS = 30_000`). *(Amended at accept, 2026-10-02: the identifier form was added so existing named budgets aren't false offenders.)*
  - On failure it lists each offender as `file:line title`.
  - **Red on unfixed code:** run the guard against main's two test files. It must fail and name exactly the four tests in Scope. Record this in the build log. If it names more, give those the same budget too, and list them in the build log.
  - **Non-vacuity:** the guard asserts that it matched at least 6 calls (the 4 in Scope plus the 2 AC28 template titles), including `rule-7 (AC28) energy … budget sweep` in `rule-7-histories.test.ts`, which already has a budget.
  - **Unit pair:** run the same collector on two in-memory sources:
    - `it("a sweep", () => {})` is reported;
    - `it("a sweep", () => {}, 30_000)` is not.
  - The template-literal titles in `rule-7-histories.test.ts` (`` `rule-7 (AC28) energy ${energy}: …` ``) are matched on their literal text.
- AC3 (no behaviour change) Every existing engine test passes, with no assertion edited. The engine test count rises only by the new `test-budgets.test.ts` cases.
- AC4 `npx -y pnpm@10.28.2 --filter @workoutlab/engine typecheck lint test` is green.

## Paths you may change
- `packages/engine/**` (the lane: `engine`).
- **Listed extras:**
  - `docs/tickets/T-0230-engine-property-test-budgets.md`: this file, for the accept log.

## Contract impact
none (`docs/engine-rules.md` and `api/openapi.yaml` unchanged)

## Coordination
- Files: `packages/engine/test/{rule-7-histories,simulated-histories}.test.ts` and the new `packages/engine/test/test-budgets.test.ts`.
- Engine lane, one ticket at a time (D-0096 §3). T-0231 is also engine (`test/import-graph.test.ts`). The files don't overlap, but run them one after the other.
- No vendor regen: `src/**` is unchanged (D-0053 §1). The orchestrator still runs `node supabase/scripts/vendor.mjs --check` at merge.

## Definition of done
Tests for every AC pass · `npx -y pnpm@10.28.2 -w typecheck lint test --force --concurrency=1` green · contracts unchanged · commit messages start with `T-0230` (e.g. `T-0230: 30 s runtime budget on the R7-E8 AC14 and seeded-history sweeps`).

## Build / accept log
- 2026-10-02 build (engine-dev): the new `packages/engine/test/test-budgets.test.ts` has 5 `T-0230 AC2` tests: the guard, non-vacuity (≥ 6 matches, all four Scope titles and both AC28 template titles, AC28 sweep budget = 30000), the unit pair, and a template-literal case. The collector uses `ts.createSourceFile`. It takes `it`/`test` callees (also `.skip`/`.only` and `.each(…)(…)`) whose first argument is a string or template literal (spans are read as `${…}`) and that match `/\b(sweep|seeds?|seeded)\b/i`. A third argument counts when it is a numeric literal, or an identifier bound by a file-level `const NAME = <numeric literal>`. That covers `t0219-timed-cost.test.ts` `SWEEP_TIMEOUT_MS = 30_000`, which would otherwise be a false offender. Offenders are listed as `file:line title`.
  - Red on unfixed code: on main's test files the guard fails and names 5 tests. Four are the Scope tests (`rule-7-histories.test.ts:113` AC14 budget sweep, `:130` AC14 200 seeded histories, `simulated-histories.test.ts:253` rule-5 … (300 seeds), `:275` rule-0 history order … (200 seeds)). The extra one is `t0219-timed-cost.test.ts:261` "rule-7 rule-14 (AC4) plannedDurationS deep-equals prefill(…) … (seeded)", a 200-case seeded loop. Per AC2 it gets the same budget.
  - AC1 diff (5 lines in total, each `-  });` → `+  }, 30_000); // runtime budget only (sweep)`): rule-7-histories.test.ts L128 and L144, simulated-histories.test.ts L273 and L288, t0219-timed-cost.test.ts L294. No body, seed, range or assertion changed.
  - AC3: engine tests go from 547 on main (32 files) to 552 (33 files), so +5, all from `test-budgets.test.ts`. AC4: engine `typecheck`, `lint` and `test` are green. `-w format:check`, `check-all.mjs` and `vendor.mjs --check` exit 0. `src/**` is untouched, so there is no vendor regen.
- 2026-10-02 accept (product-owner): **done**. Branch `t/T-0230-engine-test-budgets` @ f747823. Review: approve. QA: the orchestrator relied on the builder's red proof plus the reviewer's static check that the test bodies are byte-identical.
  - AC1: met. The four Scope tests have `30_000`. The diff is limited to the closing `})` lines (see build entry).
  - AC2: met, with the amended wording. The guard was red on unfixed code and named 5 offenders: the 4 in Scope plus `t0219-timed-cost.test.ts:261` "(seeded)". AC2's "if it names more" clause covers the fifth, which got the same budget. Non-vacuity, the unit pair and template-literal matching are all tested. The deviation is that the guard also accepts an identifier bound by a file-level `const NAME = <numeric literal>`. Without it, 5 t0219 tests outside Scope that use `SWEEP_TIMEOUT_MS` would be false offenders. I amended the AC2 wording above rather than writing a decision, because this applies the AC's intent and changes no contract.
  - AC3: met. 547 → 552, +5, all from `test-budgets.test.ts`. No assertion was edited.
  - AC4: met. Engine typecheck, lint and test are green. format:check, check-all and vendor `--check` are green.
  - Principles: test-only, and `src/**` is untouched, so the engine stays deterministic (principle 3). No contract changed.
  - Follow-ups (engine): (1) describe-level titles aren't checked. The `describe` "(seeded)" block at `rule-14-properties.test.ts:234` runs 4000 seeds with no budget: budget it and extend the guard to describe titles. (2) The guard skips concatenated and identifier titles without saying so: fold literal concatenations, and fail on any title it can't resolve.
