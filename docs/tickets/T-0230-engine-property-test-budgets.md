---
id: T-0230
title: "Engine tests: give the R7-E8 AC14 and simulated-histories seeded property tests the explicit 30 s runtime budget, plus a guard that every sweep or seeded test has one"
lane: engine
screens: [UF-08.1, UF-10]
decisions: [D-0096, D-0053]
deps: []
status: ready
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
  - **Given** every `packages/engine/test/*.test.ts` file, parsed with the TypeScript compiler API (`ts.createSourceFile`), **When** `test-budgets.test.ts` collects every `it(…)` or `test(…)` call whose first argument is a string or template literal matching `/\b(sweep|seeds?|seeded)\b/i`, **Then** each one has a third argument that is a numeric literal ≥ `30000`.
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
