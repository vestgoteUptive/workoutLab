# State

- **Phase:** 3 (App). On main: engine rules 1–14 incl. D-0131 back-off floor + D-0137 drop cap; UF-01 onboarding; UF-02.1 Today; UF-03.3 summary content (T-0419); UF-04 Library; UF-05.1 SwapSheet component (T-0421, not yet mounted); UF-08.1–.4 setup; UF-09 machine + hook + seams + .1–.9 (T-0304a/e/b/f/c/d, T-0414); lib/offline cacheCurrent (T-0431, D-0151); UF-10 Balance; lib/account export + wipe (T-0310c) and DELETE /account Edge Function (T-0310b); e2e consoleGuard (T-0425).
- **Updated:** 2026-10-02 by orchestrator (no AgentLab on this machine → sub-agents).
- **`main`:** green 2026-10-02 after T-0304d (-w gate 19/19, whole e2e 137/137) and T-0431 (web gate 4/4, e2e offline+uf-03+uf-09 13/13).
- **In flight (resumed 2026-10-03):** T-0440 accept, T-0422 accept, T-0307b re-review, T-0308a review, T-0441 groom; T-0304g cached gate (orchestrator) then accept.

## H-13 resolved (2026-10-02)
T-0307b (UF-06), T-0308a (UF-07), T-0308b (UF-11, review-approved at `17091a5`) were in flight on **another machine**; their branches are on neither this machine nor `origin`. Also waiting on them: T-0356 (D-0090), T-0362, T-0363. Don't restart from scratch unless the human says the work is lost. When the branches appear: fetch, recreate worktrees, `git merge main`, then QA → review → accept.

## Next
- UF-09: T-0415 after T-0422 (and not with T-0304g: host.tsx); T-0394 after T-0304g; T-0438 comments after T-0304g; T-0304h e2e, T-0304g (device features), then T-0304h (e2e from Ready), T-0394 (Back → Pause), T-0415 (List-view host support).
- UF-03/UF-05 (D-0142): T-0416 → T-0417 → T-0418 after T-0304d/T-0415; T-0422 swap seam after T-0304d.
- tests/e2e: T-0430 → T-0427 ∥ T-0429 (SW register catch) → T-0432.
- Engine lane: queue empty (all follow-ups done). Ungroomed: T-0216, T-0309 landing, T-0310d (UF-11.4, blocked via H-13), phase 4 infra.

## Waiting on humans
H-13 (push branches); H-14 (service-role key for the account function, prod only); T-0217 tie-break default; H-12 (C-01 on phone); H-05, H-06, H-10 (non-blocking).

## Executor
- Sub-agents: build → QA ∥ review → product-owner accept; spec: product-owner → triage check. Spec/content/triage roles have **no shell**: the orchestrator commits their files.
- Model pins (D-0076): execution roles `claude-sonnet-5-5`, judgement roles `claude-opus-5-5`.
- Tooling: `npx -y pnpm@10.28.2 …`. Each new worktree needs `install --frozen-lockfile`.
- Give every parallel run its own decision-ID block. Next free: **D-0165** (D-0163 reserved by T-0394), D-0152 reserved for T-0420) (D-0150 used by T-0304c), **TR-0044**, tickets **T-0461+** (web — T-0400..T-0406 are phase-4 infra, check before numbering), **T-0241+** (engine/data), **T-0906+** (CI).

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
- **`/tmp` is a RAM tmpfs here.** e2e now stops at config load if it is ≥80% full and names the fix (`TMPDIR=$HOME/.cache/wl-pw-tmp`), and a busy :4173 stops the run at once (T-0440). Vitest's temp-dir leak: T-0441.
- **`pnpm -w typecheck lint test` skips `test:repo-checks`** (args go to the root `typecheck` script). Run `pnpm -w test:repo-checks` too until T-0444 lands.
- **A merge-and-verify script must stop when `git merge` fails** (`… && echo MERGED || exit 1`). On 2026-10-03 a T-0436 merge conflicted and the gate ran on the half-merged tree.
- Never push main while a merge on it is still being verified (T-0310c slip, 2026-10-02).
- "Tests pass" ≠ correct; "tests fail" ≠ broken (check the contract first).
- Local Supabase: `npx -y supabase@latest start -x vector,logflare`; `eval "$(npx -y supabase@latest status -o env | sed 's/^/export /')"`. The stack serves functions of the directory it was started from.
