---
id: T-0982
title: "The per-feature ESLint-in-vitest tests (jsx-no-literals) time out under full-gate load; root-cause and make them load-proof"
lane: web-shell
screens: []
decisions: [D-0197]
deps: []
status: ready
---
## Why
Seen twice on 2026-11-23: `UF-01/__tests__/source.test.ts` (T-0683a build) and `UF-09/__tests__/exports-and-lint.test.ts` (T-0692 build) each failed one run of the full web suite with a timeout, and passed alone (14/14). Every feature has such a test (UF-01..UF-09 `exports-and-lint`, `source`, `lane` tests and harnesses) and each builds its own ESLint instance with type information inside a vitest worker. Under load that cold ESLint start can exceed the test timeout. A flake is not a root cause.

## Scope
- In: measure the cold ESLint cost per test file under the full suite; name the cause; fix it so the tests do not depend on load (e.g. one shared ESLint instance or a single lint pass per feature folder, or move the lint assertion to the real `pnpm lint` run where it already lives, keeping a guard that the rule is configured). No bare timeout raise unless the measurement shows a bounded cost and the log says why.
- Out: changing which rules apply.

## Acceptance criteria
- AC1 Given the cause, Then the log names it with numbers (cold-start time per file alone vs under the full suite).
- AC2 Given the fix, When the full web suite runs 5 times in a row under `scripts/locked.sh heavy`, Then none of these tests fails.
- AC3 Given a planted string literal in a UF-09 JSX file, Then the guard still fails (the rule still bites).
- AC4 Given every feature's lint test, Then each uses the shared approach or is listed with why it is safe.

## Paths you may change
`apps/web/src/features/*/__tests__/**`, `apps/web/src/app/__tests__/import-bans.test.ts` (orchestrator grant: its "features lints clean" case timed out at 30.9 s in the T-0683a gate and passes alone), `apps/web/src/test/**`, `apps/web/vite.config.ts` (test section only), `apps/web/eslint.config.*` (read-only unless needed for a shared instance; note it in the log)

## Contract impact
none.

## Definition of done
Every AC has evidence · `pnpm -w typecheck lint test` green · commit messages start with `T-0982`.

## Build / accept log
