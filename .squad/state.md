# State

- **Phase:** 1–3 overlap (contracts done; engine through T-0202; shell through T-0300b; backend suggest+balance done)
- **Updated:** 2026-09-28 21:10 by orchestrator (new session, resumed from files)
- **Done:** T-0001–T-0005, T-0007, T-0100a/b, T-0101, T-0102, T-0103a/b, T-0200, T-0201, T-0202, T-0203a/b, T-0300a/b, T-0309a, T-0901. Main fully green (unit, lint, typecheck, e2e, real-stack).
- **Concurrency cap: 5 runs in flight** (raised from 2 by human decision, 2026-09-28; flows and sub-agents together). Recorded in `/tick` and `/plan-phase`.
- **In flight (3/5):** T-0300c rework (Opus frontend-dev sub-agent), T-0203c build (backend sub-agent), T-0309b landing build (frontend-dev sub-agent).
- **Next when slots free:** T-0300d (body map) — but it **cannot** run beside T-0300c: both own `apps/web/src/components/**`, so the raised cap does not parallelise them. Then T-0204/T-0205 (engine, need grooming), T-0206/T-0207 (T-0203b review follow-ups).
- **Waiting on humans:** H-05, H-06, H-07 (revisit decisions), H-10 (landing copy and privacy mailbox — gates the landing *prod deploy* only; T-0309b can build and preview).

## Executor
- **The missing `wl-ci-investigate` was NOT a restart problem — it was never registered.** Previous sessions recorded "AgentLab needs a restart"; that was a misdiagnosis. The flow file existed at `.agentlab/flows/wl-ci-investigate.json`, but `scripts/sync-agents.mjs` had not been run since it was added, so AgentLab's `editor-config.json` listed 12 flows without it. **Fixed 2026-09-28 21:15:** ran `node scripts/sync-agents.mjs` → 13 flows registered, 24 agents installed, frontend-dev `maxCostUsd: 6` now live in the local-agents store. The repo stays clean (the script writes only to AgentLab's own stores).
- **Rule: after editing anything in `agents/`, run `node scripts/sync-agents.mjs`.** A restart alone never picks up a new flow. AgentLab must then reread its editor config (restart the app, or press Refresh in Agents).
- **This session's MCP connection is bound to the AgentLab process that was live at session start** (PID 83651 on 127.0.0.1:4780), so newly registered flows are not callable from here even after the app rereads them — a *Claude session* restart is needed for that. Until then, builds run as **sub-agents**, which is working well.
- **Web builds should stay on sub-agents regardless:** 4 AgentLab web runs died on budget/time, and all 4 passed as Opus sub-agents.
- Poll `get_run` with `waitSeconds ≤ 280`.
- **Tooling:** `npx -y pnpm@10.28.2 …`.

## Local Supabase stack — USE IT (verified 2026-09-28 21:50)
**The long-standing "Docker here cannot pull images" note is STALE. Docker pulls fine.** Backend work no longer needs a draft PR to get real-stack feedback; a full run is ~3 s locally instead of a ~3 min CI round trip.

Start it (the `-x` flags matter — plain `supabase start` FAILS here because the analytics and vector containers never go healthy):
```
npx -y supabase@latest start -x vector,logflare
```
Then export the env the test suites expect — they read `API_URL`/`DB_URL`, **not** `SUPABASE_URL`, so exporting the wrong names gives 20 confusing failures:
```
eval "$(npx -y supabase@latest status -o env | sed 's/^/export /')"
```
Verified green locally against it:
- `npx -y supabase@latest test db` → **524 pgTAP tests pass in 3 s**, 13 files.
- `deno test --config supabase/tests/functions/deno.json --allow-net --allow-env --allow-read --allow-write supabase/tests/functions/` → **64/64 in 3 s**. `--allow-write` is required or AC3's seed round-trip fails on a tmp write (that is a missing flag, not a defect).

Local URLs: API `http://127.0.0.1:54321`, Studio `http://127.0.0.1:54323`, **Mailpit `http://127.0.0.1:54324`** (magic-link emails land there — that is how you sign in locally). The anon key and other values come from `supabase status -o env`; they are Supabase's standard local demo values, identical on every install, not secrets.

For the web app, `apps/web/.env.local` needs `VITE_SUPABASE_URL=http://127.0.0.1:54321` and `VITE_SUPABASE_ANON_KEY=<ANON_KEY from status>`. Without it the dev server crashes — see T-0902.

## Traps that have already cost time
- **8 of 13 roles pin `model: claude-opus-5-5`, which THIS subscription cannot access (404 `model_not_found`).** Affected: ci-investigator, code-reviewer, data-modeler, designer, engine-dev, product-owner, security-reviewer, triage. The T-0204/T-0205 groom died on this. Workaround in use: spawn the sub-agent with an explicit available model (`model: "opus"`), which overrides the role frontmatter. Earlier runs in this session only worked because no explicit model was passed and the Agent tool's default applied. **This also means AgentLab flows using these roles will 404 once flows are callable again** — the `model:` lines in `agents/roles/*.md` need updating to an available id (then `node scripts/sync-agents.mjs`). Needs a human decision on which model to standardise on: H-11.
- **Parallel load makes `-w typecheck lint test` report FALSE FAILURES.** With several sub-agents running test suites on this machine, a `--force` run reported 6 tasks failing, then 1, then 0 — while every failing package passed in isolation. **Use `--force --concurrency=1` for any result you intend to act on** (19/19, 0 cached, ~2 min). Don't fail a ticket on a parallel-load flake; re-run the failing package alone first.
- **Two pairs of tickets cannot run in parallel despite the cap of 5** (path overlap beats the cap): T-0300c/T-0300d both own `apps/web/src/components/**`, and T-0204/T-0205 both change `packages/engine/src/session.ts`.
- **turbo cross-worktree cache replay (T-0006): always verify merges with `--force`.** Confirmed twice on 2026-09-28: a post-merge run on main replayed 19/19 cached tasks in 45ms with log paths pointing at another worktree — a false green. `--force` gave a real 18.7s run.
- **A worktree's `node_modules` goes stale.** Run `pnpm install --frozen-lockfile` before testing in one, or you get spurious typecheck failures.
- **Verify cited lane grants.** T-0203b changed `.prettierignore` claiming an "orchestrator grant" that did not exist anywhere. The change was necessary, so the grant is now written into the ticket — but don't merge on an unverifiable citation.
- **Web builds die on budget/time, not correctness.** 4 AgentLab web runs died unfinished ($3 cap, exit 143, interruption); every one passed when re-run as an Opus sub-agent. Split UI tickets small and tell builders to commit WIP early.
- **"Tests pass" ≠ correct.** T-0300c had 122/122 green while carrying two data-corruption bugs (a finish silently cleared server-side; tombstoned sets resurrected). Brief reviewers to hunt for ACs with no test, not just red tests.

## Notes for the next orchestrator
- Next free: D-0058, TR-0030 (D-0056 and D-0057 were claimed by the T-0204/T-0205 groom; D-0055 already existed, so the old "next free: D-0054" note was stale). Unused: D-0028, D-0038, D-0054 (reusable only by the ticket they were given to).
- Spec-only and content roles have no shell. QA commits their output.
- After each merge: `pnpm test`, `-w typecheck lint`, `check:repo`, `format:check` on main — with `--force`.
