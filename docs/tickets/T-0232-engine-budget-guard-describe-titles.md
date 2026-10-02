---
id: T-0232
title: "Engine tests: budget the three tests in the describe-level \"(seeded)\" rule 14 block, and extend the T-0230 guard to describe titles, folded literal concatenations and unresolvable titles"
lane: engine
screens: [UF-08.1, UF-10]
decisions: [D-0096, D-0053]
deps: [T-0230]
status: ready
---
<!-- Written by product-owner 2026-10-02 (groom). Build flow: wl-build-engine. About ¼ day. Follow-up from the T-0230 accept (both follow-ups in its accept log). Engine tickets run one at a time (D-0096 §3). This one is test-only, so no vendor regen is needed (only `src/**` is vendored). -->

## Why
The T-0230 guard (`packages/engine/test/test-budgets.test.ts`) only reads `it`/`test` titles. Today
`describe("rule 14 prefill properties (seeded)")` at `rule-14-properties.test.ts:234` holds three
tests with no budget. Two of them loop 4000 seeds and one loops 1000. None of their own titles says
"seed", so the guard passes them, and they are the next load-only red on the turbo gate. The guard
also skips any title it can't read (a `"a " + "sweep"` concatenation, an identifier) without saying
so. A guard that is silent about what it skipped can't be trusted. The budget only bounds runtime:
no assertion, seed count or range changes. Principle 3 (deterministic engine) is untouched.

## Scope
- In:
  - `packages/engine/test/rule-14-properties.test.ts`: add `30_000` as the third argument of the
    three tests in `describe("rule 14 prefill properties (seeded)")`:
    - "rule-14 (AC19) (AC21) prefill equals the independent rule 14 oracle …" (closing `});` at L258)
    - "rule-14 (AC19) same input → same output; …" (L273)
    - "rule-14 (AC21) invariants: shape, bounds, …" (L301)
    - Use the existing trailing comment: `}, 30_000); // runtime budget only (sweep)`.
  - `packages/engine/test/test-budgets.test.ts`, the collector:
    - **Describe titles.** A `describe` call (including `.skip`/`.only`/`.each(…)(…)`) whose
      resolved title matches `TITLE` makes every `it`/`test` call nested inside it, at any depth,
      a matching call. The reported title stays the `it`/`test` call's own title, so the
      `file:line title` offender format doesn't change.
    - **Literal concatenation.** A title that is a `+` chain (parentheses allowed) of string
      literals, no-substitution templates and template literals is folded into one string.
      Template spans still read as `${…}`.
    - **Unresolvable titles.** Any `describe`/`it`/`test` call whose first argument can't be
      resolved to literal text (an identifier, a call, a property access, a `+` with any
      non-literal operand) is an offender, reported as `file:line <unresolvable title>`. This
      applies whether or not the call has a budget.
    - The `.each(table)` call is a table, never a title. In `it.each(rows)("%s …", fn)`, `rows` is
      not checked as a title. Tagged-template `.each\`…\`` tables count the same way.
  - New guard test titles must avoid the words `sweep`, `seed`, `seeds` and `seeded`, or carry a
    `30_000` budget, because the guard reads its own file.
- Out:
  - Any change to a test body, seed count, range or assertion.
  - The vitest config: there is still no global `testTimeout` (T-0230 Scope).
  - `packages/engine/src/**` and `docs/engine-rules.md`.
  - A describe-level timeout option. Budgets stay on each `it`/`test`, as in T-0230.

## Acceptance criteria
Each new test title starts with `T-0232 ACn`.
- AC1 (the three budgets) **Given** the three tests named in Scope, **When** the engine suite runs,
  **Then** each has an explicit `30_000` timeout. The `rule-14-properties.test.ts` diff only changes
  the three closing `});` lines to `}, 30_000); // runtime budget only (sweep)`. Record the diff in
  the build log. Don't assert it in a test (state.md trap).
- AC2 (describe titles, red on unfixed code) **Given** the in-memory source
  `describe("x (seeded)", () => {\n  it("a", () => {});\n});\n`, **When** the collector runs,
  **Then** `offenders` is `["mem.test.ts:2 a"]`.
  - The pair: with `it("a", () => {}, 30_000)` there it reports `[]`, and `collectBudgetCalls` still
    returns exactly 1 call.
  - Nested: `describe("big sweep", () => { describe("inner", () => { it("b", () => {}); }); });`
    on one line reports `["mem.test.ts:1 b"]`.
  - A describe whose title doesn't match (`describe("plain", () => { it("c", () => {}); })`)
    reports `[]` and collects 0 calls.
- AC3 (concatenation) **Given** `it("a " + "sweep", () => {});`, **Then** the offender is
  `mem.test.ts:1 a sweep`. **Given** `it("a " + ("big " + "sweep"), () => {}, 30_000);`, **Then**
  there are no offenders and the collected title is `a big sweep`.
- AC4 (unresolvable) **Given** `const T = "a sweep";\nit(T, () => {}, 30_000);\n`, **Then** the
  offenders are `["mem.test.ts:2 <unresolvable title>"]`, even with the budget. The same holds for
  `it(name + " sweep", () => {})` (with `name` an identifier) and for `describe(T, () => {})`.
- AC5 (each tables) **Given** `it.each([[1]])("%s sweep", () => {}, 30_000);`, **Then** there are no
  offenders (the `[[1]]` table is not reported as unresolvable). Without the budget, the one
  offender is `mem.test.ts:1 %s sweep`.
- AC6 (red on unfixed code, real files) Run the extended guard against main's engine test files,
  before AC1's budgets. It must fail and name exactly the three Scope tests:
  `rule-14-properties.test.ts:235`, `:260` and `:275`, with no `<unresolvable title>` rows. If it
  names more, give those budgets too (or, for an unresolvable title, extend the folding if the form
  is literal-only). List every extra one in the build log. Record the run in the build log. After
  AC1, the guard is green.
- AC7 (non-vacuity) The existing T-0230 non-vacuity test also expects the three
  `rule-14-properties.test.ts` titles above, so it now asserts at least 9 matched calls.
- AC8 (no behaviour change) Every existing engine test passes, and no assertion has been edited. The
  engine test count rises only by the new `test-budgets.test.ts` cases.
- AC9 `npx -y pnpm@10.28.2 --filter @workoutlab/engine typecheck lint test` is green.

## Paths you may change
- `packages/engine/**` (the lane: `engine`).
- **Listed extras:**
  - `docs/tickets/T-0232-engine-budget-guard-describe-titles.md`: this file, for the build and
    accept log.

## Contract impact
none (`docs/engine-rules.md` and `api/openapi.yaml` unchanged)

## Coordination
- Files: `packages/engine/test/rule-14-properties.test.ts` and
  `packages/engine/test/test-budgets.test.ts`.
- Engine lane, one ticket at a time (D-0096 §3). No other engine ticket is doing or ready.
- No vendor regen: `src/**` is unchanged (D-0053 §1). The orchestrator still runs
  `node supabase/scripts/vendor.mjs --check` at merge.

## Definition of done
Tests for every AC pass · `npx -y pnpm@10.28.2 -w typecheck lint test --force --concurrency=1`
green · contracts unchanged · commit messages start with `T-0232` (e.g. `T-0232: budget the rule 14
(seeded) block; the guard reads describe titles`).

## Build / accept log
- 2026-10-02 build (engine-dev): guard collector extended in `packages/engine/test/test-budgets.test.ts` (describe titles at any depth incl. `.skip`/`.only`/`.each(…)(…)`; `+` chains of literals folded, parens allowed, template spans as `${…}`; any non-literal `describe`/`it`/`test` title is `file:line <unresolvable title>` even with a budget; `.each(table)` and `.each\`…\`` tables are never titles). AC6 red run on main's test files before AC1 (`vitest run test/test-budgets.test.ts`): the AC2 guard failed with exactly `rule-14-properties.test.ts:235`, `:260`, `:275`, no `<unresolvable title>` rows, no extras. AC1 diff (`rule-14-properties.test.ts`, the only change): L258, L273, L301 `  });` → `  }, 30_000); // runtime budget only (sweep)`. After AC1 the guard is green. AC7: non-vacuity now ≥ 9 with the three rule 14 titles. AC8: engine 573 tests pass (558 + 15 new guard cases), no assertion edited. Engine typecheck, lint, test green; `-w format:check`, `check-all.mjs`, `vendor.mjs --check` green.
