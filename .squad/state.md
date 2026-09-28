# State

- **Phase:** 1–3 overlap (contracts done; engine through T-0202; shell through T-0300b; backend suggest+balance done)
- **Updated:** 2026-09-28 21:10 by orchestrator (new session, resumed from files)
- **Done:** T-0001–T-0005, T-0007, T-0100a/b, T-0101, T-0102, T-0103a/b, T-0200, T-0201, T-0202, T-0203a/b, T-0300a/b, T-0309a, T-0901. Main fully green (unit, lint, typecheck, e2e, real-stack).
- **Concurrency cap: 5 runs in flight** (raised from 2 by human decision, 2026-09-28; flows and sub-agents together). Recorded in `/tick` and `/plan-phase`.
- **In flight (3/5):** T-0300c rework (Opus frontend-dev sub-agent), T-0203c build (backend sub-agent), T-0309b landing build (frontend-dev sub-agent).
- **Next when slots free:** T-0300d (body map) — but it **cannot** run beside T-0300c: both own `apps/web/src/components/**`, so the raised cap does not parallelise them. Then T-0204/T-0205 (engine, need grooming), T-0206/T-0207 (T-0203b review follow-ups).
- **Waiting on humans:** H-05, H-06, H-07 (revisit decisions), H-10 (landing copy and privacy mailbox — gates the landing *prod deploy* only; T-0309b can build and preview).

## Executor
- **AgentLab** is reachable, 12 `wl-*` flows registered — but `wl-ci-investigate` is **still absent**, which proves AgentLab has **not been restarted** since it was added. Consequence: frontend-dev's `maxCostUsd 6` raise is also not live there.
- **Web, landing and rework builds therefore run as sub-agents.** AgentLab stays the executor for backend/engine/data/infra once a human restarts it.
- Poll `get_run` with `waitSeconds ≤ 280`. Docker here cannot pull images, so Supabase stack tests run in GitHub CI on a draft PR.
- **Tooling:** `npx -y pnpm@10.28.2 …`.

## Traps that have already cost time
- **turbo cross-worktree cache replay (T-0006): always verify merges with `--force`.** Confirmed twice on 2026-09-28: a post-merge run on main replayed 19/19 cached tasks in 45ms with log paths pointing at another worktree — a false green. `--force` gave a real 18.7s run.
- **A worktree's `node_modules` goes stale.** Run `pnpm install --frozen-lockfile` before testing in one, or you get spurious typecheck failures.
- **Verify cited lane grants.** T-0203b changed `.prettierignore` claiming an "orchestrator grant" that did not exist anywhere. The change was necessary, so the grant is now written into the ticket — but don't merge on an unverifiable citation.
- **Web builds die on budget/time, not correctness.** 4 AgentLab web runs died unfinished ($3 cap, exit 143, interruption); every one passed when re-run as an Opus sub-agent. Split UI tickets small and tell builders to commit WIP early.
- **"Tests pass" ≠ correct.** T-0300c had 122/122 green while carrying two data-corruption bugs (a finish silently cleared server-side; tombstoned sets resurrected). Brief reviewers to hunt for ACs with no test, not just red tests.

## Notes for the next orchestrator
- Next free: D-0054, TR-0030. Unused: D-0028, D-0038 (reusable only by the ticket they were given to).
- Spec-only and content roles have no shell. QA commits their output.
- After each merge: `pnpm test`, `-w typecheck lint`, `check:repo`, `format:check` on main — with `--force`.
