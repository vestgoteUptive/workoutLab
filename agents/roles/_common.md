## How you work in workoutLab (applies to every role)

**Where the repo is.** In Claude Code, the repo is your working directory. In AgentLab, it is the absolute path in the `repoPath` input (a granted folder). Your own working folder is scratch. Use absolute paths under `repoPath` for every read, write and `cd`.

**Read first:** `CLAUDE.md`, `.squad/README.md`, `.squad/state.md`, your ticket in `docs/tickets/`, and the decisions it cites. Then read the contracts your lane touches (`docs/data-model.md`, `api/openapi.yaml`, `docs/engine-rules.md`, `packages/design-tokens`). Screen IDs follow user flows v2 (`Design-docs/docs/product/user-flows.md`, decision D-0002). Find decisions through `.squad/decisions/INDEX.md`; read a cited decision **and** every decision the index lists as amending or superseding it (the newest wins). Don't read `docs/tickets/log/**`, `.squad/board-done.md` or `.squad/journal/**` unless your task needs that history (D-0157).

**Stay in your lane.** Change only the paths your lane owns in `.squad/ownership.yaml`, plus the paths your ticket lists. If you need a change elsewhere, add it as a follow-up in your result. Don't make the change yourself.

**Never stall.** If something is unclear, pick the most reasonable default that fits the principles in `CLAUDE.md`. Record it in `.squad/decisions/D-NNNN-slug.md` (template in `.squad/README.md`, `status: revisit`) and carry on. Only stop when the task contradicts a contract or a `decided` decision. In that case write `.squad/triage/TR-NNNN-slug.md` and return `needs-triage`.

**Contracts** (`api/openapi.yaml`, `docs/data-model.md`, `docs/engine-rules.md`, `packages/design-tokens/src/tokens.json`) change only when a decision names the change. If your lane owns the contract, write the decision and make the change in the same ticket. Otherwise, propose it as a follow-up.

**Tests.** Every acceptance criterion gets an automated test. Run the tests your change touches before you return. Never delete or weaken a test to make it pass; raise triage instead.

**Test lock (one test run per machine).** Several agents work in parallel worktrees on one machine. Every e2e run starts `vite preview` on port 4173, and parallel vitest runs cause timeouts that only happen under load. So wrap **every** vitest, playwright or turbo test/typecheck/lint command in the machine-wide lock: `flock /tmp/workoutlab-tests.lock <command>` (for example `flock /tmp/workoutlab-tests.lock npx -y pnpm@10.28.2 --filter @workoutlab/web test`). It waits until no other run holds the lock. Wrap only the outermost command: a `flock` inside another `flock` on the same file deadlocks. Don't hold the lock while you edit files or think; take it per test command. A busy port 4173 or a nearly full `/tmp` now stops the e2e run at startup with a message that says what to do (T-0440); follow it (usually: set `TMPDIR=$HOME/.cache/wl-pw-tmp` on the playwright command, inside the flock).

**Proof hygiene.** Start by stating `git status` (clean) and HEAD. Record every red run on unfixed code and every planted fault in the ticket's log. Make a planted fault on a backup copy and restore it from that copy (`cp`), never with `git checkout` of uncommitted work, which silently loses it. Never reset the DOM with `document.body.innerHTML =` in a test; use `cleanup()`. **Test tiers (D-0158).** While you work, run only the tests for what you touched (`npx vitest run <files>` or `vitest related`) and the e2e specs for your flow. Run the full gate **once**, before handing back, with the Turbo cache on: `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1` (no `--force`) **plus** `npx -y pnpm@10.28.2 -w test:repo-checks` (the first form skips the repo checks, T-0444), `-w format:check` and `node .github/scripts/check-all.mjs`. Run the whole web e2e only if you touched `apps/web/src/**` outside one feature folder, `tests/e2e/fixtures/**`, the playwright config, the service worker or `routes.ts`. A contract change (openapi, data-model, engine-rules, design tokens) still uses `--force`. Only the orchestrator runs the forced full gate on `main` after a merge.

**Logs.** Append to your ticket's `## Build / accept log` (or QA/accept) section. Keep each entry short: what changed, the AC→test map in one line per AC, red runs and faults in one line each, the gate result. Detail belongs in commit messages, not the log.

**Commits.** Commit on your ticket branch only, with messages starting `T-NNNN:` and citing screen IDs when relevant. Never push, never touch `main`, never run destructive commands against anything but local Docker services.

**Secrets.** Read credentials only from environment variables. Never print, commit or write them to files other than `.env.local`.

**Return** exactly this JSON as your final answer:
`{"status":"done|blocked|needs-triage|failed","ticket":"T-NNNN","summary":"…","filesChanged":["…"],"testsRun":"command + result","decisions":["D-NNNN"],"followUps":[{"title":"…","lane":"…"}],"triage":"TR-NNNN or null","notes":"…"}`
Keep `summary` to two or three sentences and `notes` to about 150 words: the verdict, anything the orchestrator must act on, and where the detail is in the log. Don't repeat the log in the handback (D-0157).
