# State

- **Phase:** 3 (App). On main: engine rules 1–14 + D-0092..D-0096 changes; UF-01 onboarding complete (.1–.5); UF-02.1 Today; UF-04 Library; **UF-08.1–.4 setup complete (Start → /session/:id)**; **UF-09 machine, hook + seams, UF-09.3/.4 set loop (T-0304a, T-0304e, T-0304b)**; UF-10 Balance.
- **Updated:** 2026-10-02 by orchestrator (no AgentLab on this machine → sub-agents).
- **`main`:** green 2026-10-02 after T-0304f + T-0397: web 2099/2099, whole e2e 90/90 (T-0304f), UF-08 275 + uf-08 e2e 19/19 (T-0397); pushed.
- **In flight:** T-0310c (lib/account). Next: T-0310a after T-0222 (both openapi), T-0221 → T-0212 → T-0211 (engine serial; T-0236 before the next suggest-changing engine ticket), T-0407 + T-0409 after T-0410 (UF-09 serial), T-0233 after T-0409.

## Blocked on H-13
T-0307b (UF-06), T-0308a (UF-07), T-0308b (UF-11, review-approved at `17091a5`) were in flight on **another machine**; their branches are on neither this machine nor `origin`. Also waiting on them: T-0356 (D-0090), T-0362, T-0363. Don't restart from scratch unless the human says the work is lost. When the branches appear: fetch, recreate worktrees, `git merge main`, then QA → review → accept.

## Next
- UF-09 lane (D-0118..D-0120): T-0304b → T-0304f → T-0304c → T-0304d; T-0304g after c; T-0304h after d, g; T-0394 after T-0304d. T-0304b/c/d tickets carry T-0304e review notes.
- UF-08: T-0385 (flush on online enqueue, D-0116), T-0386 (UF-08.1 hardening), then T-0397 (Back while pending; same lane as T-0386), T-0391 (formatKg in rows.ts, needs groom).
- Ready small: T-0396 (return-to normalise; web-shell lib/** overlaps T-0385/T-0304b), T-0393 (e2e fixture external_load; tests/e2e/** overlaps), T-0231 (after T-0230, engine serial). Todo: T-0389, T-0398 (scan widen 2), T-0399 (UF-01.5 test nits).
- Ungroomed bigger: T-0305a/b (UF-03 list/summary), T-0306b (UF-05 swap — carries parseSessionPlan AC from D-0093 §7), T-0216, T-0308c (blocked via T-0308b/H-13), T-0309 landing, T-0310+ shell.

## Waiting on humans
H-13 (push branches); H-14 (service-role key for the account function, prod only); T-0217 tie-break default; H-12 (C-01 on phone); H-05, H-06, H-10 (non-blocking).

## Executor
- Sub-agents: build → QA ∥ review → product-owner accept; spec: product-owner → triage check. Spec/content/triage roles have **no shell**: the orchestrator commits their files.
- Model pins (D-0076): execution roles `claude-sonnet-5-5`, judgement roles `claude-opus-5-5`.
- Tooling: `npx -y pnpm@10.28.2 …`. Each new worktree needs `install --frozen-lockfile`.
- Give every parallel run its own decision-ID block. Next free: **D-0149** (D-0150 used by T-0304c), **TR-0043**, tickets **T-0432+** (web — T-0400..T-0406 are phase-4 infra, check before numbering), **T-0241+** (engine/data), **T-0906+** (CI).

## Traps (condensed — full history in journals 2026-09-28..10-01)
- **Never commit a test that asserts `git diff main...HEAD`** (T-0303b review): it fails on other lanes' branches after merge and silently skips in CI (no local `main`). Record diff checks in the ticket build log instead; check-lane-paths enforces lanes.
- **Run `npx -y deno@2 check` locally for anything touching supabase/** (T-0229): deno isn't installed but npx works; CI's Deno type-check caught a vendored .d.ts error only in CI.
- **jsdom has no CSP** (TR-0036): anything that evals/compiles at runtime (Ajv, new Function) passes Vitest but breaks in the built app. Precompile; the bundle scan in build.test.ts guards it.
- **Grants are read at `merge-base origin/main HEAD`.** Commit ticket files to main AND push before a build, and write grants as `- **Listed extras:**` sub-bullets of backticked paths (prose isn't parsed; a line with "no"/"not"/"except" denies).
- **One turbo/vitest/playwright process per machine** for verification — enforced by `flock /tmp/workoutlab-tests.lock <cmd>` (agents/roles/_common.md, 2026-10-02); the orchestrator uses it too. Never nest it. Concurrent runs give load-only reds (timeouts in design-tokens eslint-wiring, engine rule-13/14). Never two vitest in the same worktree (stagger QA and review).
- Verification is `pnpm -w typecheck lint test --force --concurrency=1` plus `format:check`, `check:repo`, `vendor.mjs --check`, `gen-seed.mjs --check`, and **e2e** for anything touching `apps/web/src/**` or `tests/e2e/**` (T-0306a merged without e2e and broke main).
- `git diff main...HEAD` (three dots) for lane checks. After merging a branch that adds deps, `install --frozen-lockfile` on main.
- Check for a stale `vite preview` on :4173 after any killed run.
- Offline e2e rows for built screens must seed data and assert built content (D-0091 §1); a URL check alone narrows but doesn't close a redirect race.
- Binary-condition ACs: the other value needs a test too. Timing tests: prove they fail on unfixed code; use a 50 ms macrotask, not microtask flushes.
- Require a clean `git status` + stated HEAD before review/QA. Confirm a planted fault actually landed.
- A contract change (openapi, data-model, engine-rules) must run the whole `-w` gate: other packages pin contract text (T-0222: engine AC21 regex).
- Never push main while a merge on it is still being verified (T-0310c slip, 2026-10-02).
- "Tests pass" ≠ correct; "tests fail" ≠ broken (check the contract first).
- Local Supabase: `npx -y supabase@latest start -x vector,logflare`; `eval "$(npx -y supabase@latest status -o env | sed 's/^/export /')"`. The stack serves functions of the directory it was started from.
