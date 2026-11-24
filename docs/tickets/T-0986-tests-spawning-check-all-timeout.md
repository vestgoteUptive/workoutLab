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
- Build (infra, 2026-11-24): both tests now call the checkers' exported functions in-process; no child process, no timeout change. Design-tokens: `checkScreenIdExistence` + `checkV1Labels` run on UF-06.2.md alone. Landing: `check-placeholder-tests.runCheck` filtered to `apps/landing/`. No `.github/scripts` change needed (functions were already exported).
  - AC1 cost, child process (check-all alone, `node`): 0.5-1.0 s; inside vitest: 480 ms (design-tokens) and 535 ms (landing) on an idle machine, over 5 s under gate load (T-0978b: 7.7 s). Now: 27 ms and 114 ms.
  - Finding: no checker scans `Design-docs/docs/design/screens/`, so the old design-tokens test could never see a label planted in UF-06.2.md (planted `UF-08 Balance`, check-all printed 0 lines naming it). The new test makes AC3 real.
  - AC2: forced turbo `typecheck lint test --force --concurrency=1 --continue` x3, all exit 0 (19/19 tasks, about 8.5 min each).
  - AC3 faults (backup, cp, cmp): `UF-08 Balance` appended to UF-06.2.md -> design-tokens AC1 fails ("v1 flow label"); an unknown screen id (number 99.9) -> fails ("unknown screen id"); marker in a new landing test file -> 2 landing tests fail; marker in a landing page -> marker test fails (the new check only reads test files, so the existing scan carries that case). All restored, none committed.
  - Red on unfixed code: both old check-all tests fail in this worktree (exit 1, `ticket-not-on-base`): `origin/main` is stale (01e1f824, lacks the T-0986 ticket) and the lane-path check takes it as base. Environmental; also fails `check-all.mjs` and 4 `test:repo-checks` cases (AC21 x2, AC-10, T-0496 AC-5) identically on HEAD. Fix is `git fetch`/update origin/main, not in this ticket.
  - format:check green after prettier on the design-tokens test.
