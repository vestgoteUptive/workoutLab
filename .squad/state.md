# State

- **Phase:** 3 (App). Engine rules 1–14 done; backend suggest/balance/finish done; shell done. Phase 3 feature screens on main: **UF-10 Balance, UF-04 Library**.
- **Updated:** 2026-10-01 by orchestrator (this machine has **no AgentLab** → sub-agents).
- **`main` is GREEN** at the tick commit: 19/19 (`--force --concurrency=1`), e2e 49/49, `format:check` + `check:repo` clean. Pushed to origin.
- **Merged 2026-10-01:** T-0905 (CI fix, PR #12), T-0355, T-0358, T-0359 (docs).

## Blocked on H-13 (the big one)
T-0307b (UF-06), T-0308a (UF-07), T-0308b (UF-11, review-approved at `17091a5`) were in flight on **another machine**. Their worktrees and branches are on neither this machine nor `origin`. Board: `blocked:H-13`. Also waiting on them: T-0356 (D-0090), T-0362, T-0363. **Don't restart them from scratch** unless the human says the work is lost. When the branches appear: `git fetch`, recreate worktrees, `git merge main` into each, then QA → review → accept.

## Next
- **Ready now:** T-0364 (UF-04 inline credit, D-0089), T-0367 (D-0091 §2 wording, docs).
- **Triage:** TR-0032 (T-0365 AC-1 wording: seed a session that carries `user.id`) → then T-0365 → T-0366.
- **Engine priority** (needs grooming): T-0219 (rule 7.1 timed costing overruns the budget; needs a decision), T-0224 (applySwap, D-0071 §7, needs ticket file), T-0214, T-0215.
- Fewer than 3 truly runnable tickets → groom next tick (the engine items above, T-0301b UF-01.1–.4).

## Waiting on humans
H-13 (push branches); T-0217 tie-break default; H-12 (C-01 on phone); H-05, H-06, H-10 (non-blocking).

## Executor
- Sub-agents: build → QA ∥ review → product-owner accept; spec: product-owner → triage check. Spec/content/triage roles have **no shell**: the orchestrator commits their files.
- Model pins (D-0076): execution roles `claude-sonnet-5-5`, judgement roles `claude-opus-5-5`.
- Tooling: `npx -y pnpm@10.28.2 …`. Each new worktree needs `install --frozen-lockfile`.
- Give every parallel run its own decision-ID block. Next free: **D-0092**, **TR-0033**, tickets **T-0368+** (web), **T-0225+** (engine/data), **T-0906+** (CI).

## Traps (condensed — full history in journals 2026-09-28..10-01)
- **Grants are read at `merge-base origin/main HEAD`.** Commit ticket files to main AND push before a build, and write grants as `- **Listed extras:**` sub-bullets of backticked paths (prose isn't parsed; a line with "no"/"not"/"except" denies).
- **One turbo/vitest/playwright process per machine** for verification. Concurrent runs give load-only reds (timeouts in design-tokens eslint-wiring, engine rule-13/14). Never two vitest in the same worktree (stagger QA and review).
- Verification is `pnpm -w typecheck lint test --force --concurrency=1` plus `format:check`, `check:repo`, `vendor.mjs --check`, `gen-seed.mjs --check`, and **e2e** for anything touching `apps/web/src/**` or `tests/e2e/**` (T-0306a merged without e2e and broke main).
- `git diff main...HEAD` (three dots) for lane checks. After merging a branch that adds deps, `install --frozen-lockfile` on main.
- Check for a stale `vite preview` on :4173 after any killed run.
- Offline e2e rows for built screens must seed data and assert built content (D-0091 §1); a URL check alone narrows but doesn't close a redirect race.
- Binary-condition ACs: the other value needs a test too. Timing tests: prove they fail on unfixed code; use a 50 ms macrotask, not microtask flushes.
- Require a clean `git status` + stated HEAD before review/QA. Confirm a planted fault actually landed.
- "Tests pass" ≠ correct; "tests fail" ≠ broken (check the contract first).
- Local Supabase: `npx -y supabase@latest start -x vector,logflare`; `eval "$(npx -y supabase@latest status -o env | sed 's/^/export /')"`. The stack serves functions of the directory it was started from.
