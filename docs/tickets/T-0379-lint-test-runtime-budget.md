---
id: T-0379
title: Lint-in-vitest tests get an explicit 30 s per-test budget (import-bans AC-11, UF-10 AC-A21)
lane: web-shell
screens: [UF-10]
decisions: [D-0115]
deps: []
status: ready
---
## Why
Two Vitest tests run ESLint over a whole source tree. On a loaded machine they hit Vitest's 5 s
default and fail even though nothing is wrong (T-0331 QA). The tests are
`app/__tests__/import-bans.test.ts` AC-11 "apps/web/src/features lints clean" and
`features/UF-10/__tests__/strings.test.ts` AC-A21 "react/jsx-no-literals is green across
features/UF-10". D-0115 §1 gives each of them its own budget and leaves the global timeout alone.

## Scope
- In: a per-test timeout of 30 000 ms on exactly those two `it`s (a named constant, for example
  `LINT_BUDGET_MS = 30_000`, in each file).
- Out:
  - Changing the global `testTimeout` in `vite.config.ts`.
  - Moving the checks to `pnpm lint`.
  - Any assertion change.
  - The other lint-in-vitest tests (UF-01, UF-04, UF-08). D-0115 Consequences covers them: they
    get the same budget in their own lane, but only if they flake.

## Acceptance criteria
- AC1 Given the import-bans file, when `pnpm --filter web exec vitest run src/app/__tests__/import-bans.test.ts -t "features lints clean" --testTimeout=1` runs, then the test passes. Its own 30 000 ms budget overrides the 1 ms global, which shows the budget is explicit.
- AC2 Given the UF-10 strings file, when `pnpm --filter web exec vitest run src/features/UF-10/__tests__/strings.test.ts -t "react/jsx-no-literals is green across features/UF-10" --testTimeout=1` runs, then the test passes for the same reason.
- AC3 Given the diff, when it is reviewed, then in both files only the two `it(...)` calls (their timeout argument) and the new constant change. Every `expect` line is byte-identical to `main`.
- AC4 Given the full suite, when `pnpm -w test` runs, then both files are green and the global `testTimeout` is unchanged. A test elsewhere that doesn't declare a budget still fails at 5 s.

## Paths you may change
- `apps/web/src/app/__tests__/import-bans.test.ts` (the lane: `web-shell`).
- **Listed extras:**
  - `apps/web/src/features/UF-10/__tests__/strings.test.ts`: the timeout argument and its constant, on the one ESLint-driven `it` (AC2) only.
  - `docs/tickets/T-0379-lint-test-runtime-budget.md`: this file, for the accept log.

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0379` and cite screen IDs.
