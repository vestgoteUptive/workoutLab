# State

- **Phase:** 3 (App). Engine rules 1–14 done; backend suggest/balance/finish done; shell done. Phase 3 feature screens on main: **UF-10 Balance, UF-04 Library**.
- **Updated:** 2026-10-01 (late) by orchestrator (this machine has **no AgentLab** → sub-agents).
- **`main` is GREEN** (2026-10-01 evening): 19/19 `--force --concurrency=1`, e2e 49/49, format + check:repo + vendor --check clean. Pushed.
- **Merged 2026-10-01:** T-0905 (CI fix), T-0355, T-0358, T-0359, T-0364, T-0365, T-0370, T-0357 (+T-0368), **T-0219** (engine, D-0092, PR #13), **T-0301b** (UF-01.1–.3 onboarding). Grooms merged: engine (T-0219/15/24/14, D-0092–D-0096), web (T-0301b/d, T-0357, T-0366, T-0370, D-0097/D-0098).
- **In flight:** T-0215 (engine build), T-0301d (UF-01.4 + onboarding e2e), T-0366 (profile-gate seeded UF-04 rows).

## Blocked on H-13
T-0307b (UF-06), T-0308a (UF-07), T-0308b (UF-11, review-approved at `17091a5`) were in flight on **another machine**; their branches are on neither this machine nor `origin`. Also waiting on them: T-0356 (D-0090), T-0362, T-0363. Don't restart from scratch unless the human says the work is lost. When the branches appear: fetch, recreate worktrees, `git merge main`, then QA → review → accept.

## Next
- **Engine lane is serial (D-0096 §3):** T-0215 (doing) → T-0224 → T-0214. After each engine merge, regenerate the vendor copy via the `orch/T-NNNN-merge` draft-PR pattern (lane check no-ops off `t/*`). Then backend follow-up: pass `goal` in `supabase/functions/workouts/core.ts` after T-0214; T-0223 (data) after T-0215.
- **Web:** after T-0301d → groom T-0301c (UF-01.5 + /welcome/save; must not call markOnboardingStarted; D-0097 /welcome/save rows; planShown:true fixtures). After T-0366 → T-0331. Small todo follow-ups: T-0371–T-0376.
- Never run two of T-0301b-family / T-0366 / T-0331 / T-0301c at once (profile-gate.test.tsx).

## Waiting on humans
H-13 (push branches); T-0217 tie-break default; H-12 (C-01 on phone); H-05, H-06, H-10 (non-blocking).

## Executor
- Sub-agents: build → QA ∥ review → product-owner accept; spec: product-owner → triage check. Spec/content/triage roles have **no shell**: the orchestrator commits their files.
- Model pins (D-0076): execution roles `claude-sonnet-5-5`, judgement roles `claude-opus-5-5`.
- Tooling: `npx -y pnpm@10.28.2 …`. Each new worktree needs `install --frozen-lockfile`.
- Give every parallel run its own decision-ID block. Next free: **D-0100**, **TR-0034**, tickets **T-0377+** (web), **T-0225+** (engine/data), **T-0906+** (CI).

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
