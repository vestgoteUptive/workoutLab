# State

- **Phase:** 1–3 overlap (contracts done; engine through T-0204 (rules 12–13); shell through T-0300c; backend suggest/balance/finish done)
- **Updated:** 2026-09-29 by orchestrator (cloud session)
- **Progress: 31 done · 30 left** (T-0204 accepted, in PR #8 awaiting merge; 4 follow-ups filed). Remaining bulk: ~8 UI flow tickets (T-0301–T-0308), 6 infra/deploy (T-0400–T-0406), smaller follow-ups.
- **Done:** T-0001–T-0005, T-0007, T-0100a/b, T-0101, T-0102, T-0103a/b, T-0200, T-0201, T-0202, T-0203a/b/c, T-0204 (PR #8), T-0300a/b/c, T-0309a/b, T-0311, T-0901, T-0902.
- **Concurrency cap: 5** (human decision). **But lane ownership binds tighter than the cap** — see the no-parallel pairs below.
- **In flight:** nothing running. **PR #8 (T-0204, branch `main-hzlbfc`) needs merging** — this cloud container can push only `main-hzlbfc`, so it cannot merge to `main` itself.
- **Ready:** T-0205 (engine; build on T-0204's seam, after PR #8 merges), T-0208 (backend, D-0058), T-0300d (C-01 body map), T-0312 (web build-script), T-0903 (format:check on 5 supabase files).
- **Waiting on humans:** H-05, H-06, H-07 (revisit decisions), H-10 (landing copy + privacy mailbox — gates the landing *prod deploy* only), **H-11 (model pins 404 — blocks AgentLab as executor)**.

## Executor
- **Sub-agents.** AgentLab's 13 flows are registered (the old "needs a restart" note was a misdiagnosis: `scripts/sync-agents.mjs` had never been run — a restart alone never registers a new flow). But **H-11 blocks flows in practice**: 8 of 13 roles pin `model: claude-opus-5-5`, which 404s on this subscription (ci-investigator, code-reviewer, data-modeler, designer, engine-dev, product-owner, security-reviewer, triage). Sub-agents work around it by passing an explicit `model: "opus"`; flows cannot.
- This session's MCP connection is bound to the AgentLab process live at session start, so newly registered flows need a Claude session restart to be callable.
- **Tooling:** `npx -y pnpm@10.28.2 …`.

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
- Next free: D-0060, TR-0030 (D-0058 = T-0208's rule, D-0059 = T-0204's defaults). Unused: D-0028, D-0038, D-0054.
- Spec-only and content roles have no shell. QA commits their output.
- After each merge: `pnpm -w typecheck lint test --force --concurrency=1` on main.
