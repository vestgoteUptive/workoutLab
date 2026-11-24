---
id: T-0986
title: "Package tests that spawn .github/scripts/check-all.mjs time out at the default 5 s under full-gate load"
lane: infra
screens: []
decisions: [D-0197]
deps: []
status: ready
---
## Why
In the T-0978b gate (2026-11-24) `packages/design-tokens/test/uf06-2-e1rm-spec.test.ts` "T-0962 AC1 … check-all passes" failed with "Test timed out in 5000ms" after 7.7 s; `check-all.mjs` itself exited 0 in the same gate. `apps/landing/test/ac21-placeholder-removed.test.ts` runs the same child process. Spawning the whole repo check from inside a package unit test costs seconds under load and duplicates the gate's own `check-all` step. A flake is not a root cause.

## Scope
- In: measure the spawn cost alone and under the full gate; decide per test whether it should (a) assert only its own file through the checker's exported function (no child process), or (b) stay a child process with a measured, logged timeout. Prefer (a).
- Out: changing what check-all checks.

## Acceptance criteria
- AC1 The log gives the cost alone and under load for each such test.
- AC2 Given the fix, When the full forced turbo gate runs 3 times, Then neither test fails.
- AC3 Given a planted legacy v1 label in `Design-docs/docs/design/screens/UF-06.2.md` (design-tokens test) and the placeholder back in the landing page (landing test), Then each test still fails.

## Paths you may change
- `packages/design-tokens/test/uf06-2-e1rm-spec.test.ts`
- `apps/landing/test/ac21-placeholder-removed.test.ts`
- `.github/scripts/**` (only to export a callable check; no rule changes)

## Contract impact
none.

## Definition of done
Every AC has evidence · `pnpm -w typecheck lint test` green · commit messages start with `T-0986`.

## Build / accept log
