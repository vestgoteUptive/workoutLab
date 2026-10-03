---
id: D-0158
title: "Tiered test gate: builder runs affected tests plus one cached full gate, QA proves faults on the ticket's own tests, only main runs the forced full gate"
status: decided
date: 2026-10-02
by: orchestrator (approved by the human, 2026-10-02)
area: process
amends: D-0157
---
## Context
Each ticket ran the full suite three or four times: the builder (`-w typecheck lint test --force` plus the whole e2e,
often twice), QA (the same again), the orchestrator in the worktree before the merge, and again on `main` after it.
`--force` disables the Turbo cache, so a web-only ticket also re-tested engine, shared, exercises, landing and
design-tokens (about 1,300 tests). All runs share one machine lock (`flock`), so five agents mostly waited.
On 2026-10-02 every QA full-gate failure was environmental (port 4173, `/tmp`), never code. What found real defects
was code review and planted faults on the ticket's own tests.

## Decision
1. **Builder.** While working: the tests for what it touched (`npx vitest run <files>` / `vitest related`, or the
   package filter) and the e2e specs for its flow. Once, before handing back: the full gate **with the Turbo cache**
   (`npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, no `--force`), `-w test:repo-checks`,
   `-w format:check`, `node .github/scripts/check-all.mjs`, and the whole web e2e only if the ticket touches
   `apps/web/src/**` outside one feature folder, `tests/e2e/fixtures/**`, the playwright config, the service worker
   or `routes.ts`. Otherwise the flow's specs are enough.
2. **Review** runs first and is static (D-0157 §8).
3. **QA** reproduces the builder's red runs and planted faults and adds its own, on the ticket's own test files
   (one vitest file per fault), and runs the flow's e2e specs. It runs a full gate **only** if the branch changed
   after the builder's gate (a merge of `main`, a rework) — then the cached form from §1.
4. **Accept** runs nothing.
5. **Orchestrator.** No gate in the worktree before the merge. After `git merge --no-ff` on `main`: the forced full
   gate (`-w typecheck lint test --force --concurrency=1`), `-w test:repo-checks`, check-all and the whole e2e
   (`TMPDIR=$HOME/.cache/wl-pw-tmp`). `--force` stays here only, because a cached result was once replayed across
   worktrees (T-0006). Red on `main` → revert the merge and send the failure back as rework. Push only when green.
6. **Contract changes** (openapi, data-model, engine-rules, design tokens) still run the forced full gate in the
   builder too: other packages pin contract text (the T-0222 lesson).

## Consequences
- About two-thirds fewer full-suite runs per ticket and far less waiting on the lock.
- A cross-ticket break surfaces on `main` rather than on the branch; the revert rule in §5 keeps `main` green, and
  CI on push is the second net.
- `agents/roles/_common.md`, `qa-tester.md` and `.claude/commands/tick.md` say this.

## Revisit when
- A defect reaches `main` that the branch-level tests would have caught with the old full runs.
