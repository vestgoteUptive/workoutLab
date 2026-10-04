# State

- **Phase:** 3 (App). On main: engine rules 1–14 incl. D-0131 back-off floor + D-0137 drop cap; UF-01 onboarding; UF-02.1 Today; UF-03.1 List view incl. + Add set (T-0457); UF-03.3 summary content (T-0419); UF-04 Library; UF-05.1 SwapSheet component (T-0421, not yet mounted); UF-06 Progress (T-0307b); UF-07.1 Routine editor (T-0308a); UF-08.1–.4 setup; UF-09 machine + hook + seams + .1–.9 incl. the e2e-from-Ready spec and seam retry for how-to/list-view (T-0304a/e/b/f/c/d, T-0414, T-0304h, T-0463); UF-09's focus prefs now read through a UF-08 leaf entry, `index.prefs.ts` (T-0474, D-0170); UF-10 Balance; UF-11.2/.3/.4 Plan + Edit plan + Account settings (T-0308b, T-0310d); lib/offline cacheCurrent (T-0431, D-0151); lib/account export + wipe (T-0310c) and DELETE /account Edge Function (T-0310b); e2e consoleGuard (T-0425).
- **Updated:** 2026-10-04 06:40 by orchestrator, after a 2nd hard usage-limit reset killed 4 agents mid-tick (all recovered cleanly; T-0478/T-0469 worktrees were clean, T-0484 had already finished its main-merge before dying).
- **`main`:** green 2026-10-04 after T-0487's merge (`97265d3`, pushed): -w gate 19/19, repo-checks clean, e2e 220/220. Since the last full refresh: T-0486, T-0477, T-0487 all merged.
- **In flight (2026-10-04 06:40):** T-0478 (UF-03 swap in list) in review+QA, found+fixed 2 real bugs (row-keying, barrel eager-loading) along the way. T-0469 (account e2e) in its 2nd QA pass after fixing review's AC-2/AC-3 fault-proof gap; found a real new flake (D-0176: AutoSync flush races seeded IndexedDB rows, qa-lane follow-up filed, not fixed inline). T-0484 (qa: shared goOffline e2e fixture) resuming post-merge re-verification — one of its earlier follow-ups was stale (T-0477/T-0487 had already fixed it) and was dropped. T-0483/T-0485 (D-0175) and T-0471 (UF-11/index.tsx, shares lane with T-0469) still held for lane/dependency safety. Phase 3 nearly done; phase 4 not started.
- **Resolved recently:** TR-0044/TR-0045 (UF-08 barrel hang). T-0906 CI flake (test-harness race). T-0486's notice race (3 rework rounds, idempotent restore-on-pagehide). T-0477's REST_START-from-list change (+T-0487's matching e2e fix).

## H-13 fully resolved (2026-10-02–03)
T-0307b, T-0308a and T-0308b all merged and are `done` on the board. T-0356, T-0362, T-0363 (which were waiting on them) are unblocked.

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
- Give every parallel run its own decision-ID block. Next free: **D-0176** (D-0175 used: groom T-0477/T-0478/T-0483/T-0484/T-0485), D-0152 reserved for T-0420, D-0150 used by T-0304c), **TR-0046**, tickets **T-0487+** (web — T-0400..T-0406 are phase-4 infra, check before numbering), **T-0241+** (engine/data), **T-0907+** (CI). Check actual files before trusting this line; it has drifted before.

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
- **`/tmp` is a RAM tmpfs here.** Vitest no longer leaks into it (T-0441, D-0159); e2e stops at config load if it is ≥80% full and names the fix (T-0440).
- **`pnpm -w typecheck lint test` skips `test:repo-checks`** (args go to the root `typecheck` script). Run `pnpm -w test:repo-checks` too until T-0444 lands.
- **A merge-and-verify script must stop when `git merge` fails** (`… && echo MERGED || exit 1`). On 2026-10-03 a T-0436 merge conflicted and the gate ran on the half-merged tree.
- Never push main while a merge on it is still being verified (T-0310c slip, 2026-10-02).
- "Tests pass" ≠ correct; "tests fail" ≠ broken (check the contract first).
- Local Supabase: `npx -y supabase@latest start -x vector,logflare`; `eval "$(npx -y supabase@latest status -o env | sed 's/^/export /')"`. The stack serves functions of the directory it was started from.
- **A merge-and-gate script piping each stage through `tail -N` needs `set -o pipefail`, not just `set -e`.** Without it, `set -e` only checks `tail`'s exit code (always 0), so a real test failure never stops the script — it prints a false `CHECK_OK` and keeps going (2026-10-03). Always use `set -euo pipefail` in these scripts.
- **Never launch a second merge-and-gate script on the shared `main` checkout before confirming the first one's gate has actually finished** (not just merged). Two concurrent `turbo` invocations against the same working tree can corrupt each other's build/test-cache state and produce a false failure that looks real (2026-10-03: a `shell.test.tsx` failure vanished on the later solo rerun). Launch gates serially, or in separate worktrees.
- **`run_in_background: true` on a Bash command that itself backgrounds with `nohup … &` reports "completed" as soon as the outer shell forks**, not when the inner long-running command finishes. Poll a sentinel file (e.g. `echo RUN_COMPLETE >> log` appended after the real command) instead of trusting that notification's exit code.
- **`beforeunload` does not fire on iOS Safari at all** (by WebKit design, for bfcache); `pagehide` fires reliably cross-browser incl. iOS but only as part of unload itself, too late to gate a same-tick `setTimeout(0)` the way `beforeunload` can elsewhere (T-0486, 2026-10-03). Any fix that infers "an unload is about to happen" from a browser event must name which event and confirm it fires on iOS Safari (this PWA's real target) before trusting it — don't assume event parity across engines for navigation-lifecycle events.
- **Never leave a QA/review agent running on a worktree after sending that same ticket back for rework** (check `ListAgents` first). **A build resumed after an outage from its branch's original base may report a "finding" that another ticket already fixed on `main` in the meantime** (T-0484, 2026-10-04: found the exact T-0458 AC-3 flake T-0477/T-0487 had just resolved upstream, stale by the time it reported). Before trusting any long-running build's follow-up findings or a heavily-rewritten shared file, merge current `main` into its branch and re-verify — don't take `git merge-tree`'s clean-merge check against a stale snapshot as proof nothing changed underneath it.
