# State

- **Phase:** 2–3 overlap. Engine rules 1–14 done; backend suggest/balance/finish done; shell through T-0300d (C-01 body map). **Phase 3 is groomed**: the 8 screen tickets are split into 22 per-flow children (D-0063–D-0070).
- **Updated:** 2026-09-29 ~11:30 UTC by orchestrator (cloud session, handing off for a subscription switch)
- **Progress: 37 done**, plus ~50 open rows (22 new Phase 3 children, 7 infra/deploy, ~20 small follow-ups).
- **Done this session (all on branch `main-hzlbfc`, PR #8):** T-0204, T-0205, T-0208, T-0300d, T-0312, T-0903, D-0061 (the human's H-07 review), H-11 closed.
- **PR #8** (`main-hzlbfc` → `main`) is green and mergeable. **The human must merge it.** A cloud container can push only `main-hzlbfc`.
- **Concurrency cap: 5.** Lane ownership binds tighter: web-shell tickets (T-0301a, T-0318, T-0319, T-0313) run one at a time.
- **In flight at handoff:** a **triage check of the Phase 3 specs** (reconcile D-0063 vs D-0067 into **D-0071**, check the seams between T-0304 and T-0305a/T-0306b and between T-0302a and T-0308c, check lanes, list which rows are ready). It was still running and its edits were uncommitted: `D-0071-phase3-cross-flow-conventions.md` plus changes to D-0063, D-0065–D-0069 and T-0304. **Next session: `git status` first.** If those files are there and look complete, commit them. Otherwise rerun the triage check (brief in journal 2026-09-29, "Phase 3 grooming").
- **Next to build:** **T-0318** (web-shell plumbing: routes, per-flow i18n, import bans; scope in D-0067 §2; needs a ticket file if triage didn't write one). It unblocks T-0301b, T-0302a, T-0303a and T-0307a, and after that they can run in parallel. Also ready-ish: T-0301a (profile gate, web-shell; not in parallel with T-0318). **Priority engine:** T-0219 (rule 7.1 timed costing overruns the budget; needs a decision first), T-0224 (applySwap), T-0214 (goal reps, D-0061), T-0215 (one-period check-in).
- **Waiting on humans:** merge PR #8; T-0217 (tie-break for two ratings at the same endedAt, default "higher wins"); H-12 (review C-01 on a phone); H-05, H-06, H-10 (non-blocking).

## Executor
- **Model pins:** the subscription switched to one that has **Opus 5 but not Opus 5.5**. The 8 Opus roles are now pinned to `claude-opus-5` (commit c48bb5f, regenerated with `node scripts/sync-agents.mjs`). The Sonnet roles stay on `claude-sonnet-5`. When spawning sub-agents, pass `model: "opus"`, or omit it to use the role pin. If the subscription changes again: edit `agents/roles/*.md`, run `node scripts/sync-agents.mjs`, and commit (a restart alone never registers anything).
- **Desktop:** AgentLab (13 flows). **Cloud:** there is no agentlab MCP, so use sub-agents (build → QA ∥ review → product-owner accept). Give every parallel run its OWN decision-ID block and its own scratch subdir: decision D-0060 collided today, and scratch scripts got overwritten.
- **Tooling:** `npx -y pnpm@10.28.2 …`.
- **Before a PR push, also run the CI-only checks:** `pnpm -w format:check`, `pnpm -w check:repo`, `node supabase/scripts/vendor.mjs --check` (regenerate with `node supabase/scripts/vendor.mjs` after ANY engine or shared change), and `node supabase/scripts/gen-seed.mjs --check`. A green local turbo run does not cover these.

## Local Supabase stack — USE IT (the "Docker can't pull images" note is STALE)
```
npx -y supabase@latest start -x vector,logflare     # plain `start` FAILS: analytics/vector never go healthy
eval "$(npx -y supabase@latest status -o env | sed 's/^/export /')"   # suites read API_URL/DB_URL, NOT SUPABASE_URL
```
- `npx -y supabase@latest test db` → **524 pgTAP in 3 s**. Edge Functions: `deno test --config supabase/tests/functions/deno.json --allow-net --allow-env --allow-read --allow-write supabase/tests/functions/` → **64/64 in 3 s** (`--allow-write` is required or AC3's seed round-trip fails on a tmp write).
- **The stack serves the functions of whichever directory it was started from.** Started from main, every `sessions` test 404s because that function lives only in the T-0203c worktree. Curl the endpoint before believing a mass-404.
- Web app: `apps/web/.env.local` needs `VITE_SUPABASE_URL=http://127.0.0.1:54321` + `VITE_SUPABASE_ANON_KEY=<ANON_KEY>`. Without it the dev server crashes (T-0902). Magic-link mail → Mailpit `http://127.0.0.1:54324`. Studio `http://127.0.0.1:54323`.

## Traps that have already cost time
- **Verification must be `--force --concurrency=1`.** Two independent illusions: turbo replays another worktree's cache (T-0006; a 45 ms "19/19 FULL TURBO" on main was a false green), and under parallel agent load the suite reports failures that vanish in isolation (6, then 1, then 0).
- **After merging a branch that adds deps, run `pnpm install --frozen-lockfile` on main** before testing, or you get spurious failures (T-0300c's dexie/fake-indexeddb).
- **Use `git diff main...HEAD` (three dots) for lane checks.** Two dots lists commits that landed on main after the fork — on T-0309b that looked like a 100+ file lane violation and was not.
- **No-parallel pairs (path overlap beats the cap):** T-0300c/T-0300d and any two `web-shell` tickets (`apps/web/src/{app,components,lib}/**`); T-0204/T-0205 (both change `packages/engine/src/session.ts`).
- **"Tests pass" ≠ correct.** T-0300c had 122/122 green while silently clearing a finished session's `ended_at` server-side and resurrecting deleted sets. Brief reviewers to hunt for ACs with no test.
- **"Tests fail" ≠ broken.** T-0203c's 2 red D-0053 §7 tests were test bugs: strict `assertEquals` on an instant, where `api/openapi.yaml`'s `Instant` allows `Z` **or** an offset. Check the contract before blaming the product.
- **Verify cited lane grants.** T-0203b changed `.prettierignore` claiming an "orchestrator grant" that existed nowhere. The change was needed, so it is now written into the ticket.
- **Web builds die on budget/time, not correctness.** 4 AgentLab web runs died unfinished; all 4 passed as Opus sub-agents. Split UI tickets small; tell builders to commit WIP early.

## Notes for the next orchestrator
- Next free: **D-0072** (D-0071 = the triage reconciliation, if committed), **TR-0030**, tickets **T-0225+** (engine/data) and **T-0320+** (web). D-0062 = T-0205 defaults; D-0063–D-0066 groom A; D-0067–D-0070 groom B. Unused: D-0028, D-0038, D-0054.
- Spec-only and content roles have no shell. QA commits their output.
- After each merge: `pnpm -w typecheck lint test --force --concurrency=1` on main.
