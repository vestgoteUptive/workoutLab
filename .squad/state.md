# State

- **Phase:** 2–3 overlap. Engine rules 1–14 done; backend suggest/balance/finish done; shell through T-0300d (C-01 body map). **Phase 3 is groomed**: the 8 screen tickets are split into 22 per-flow children (D-0063–D-0070).
- **Updated:** 2026-09-29 by orchestrator (desktop session; PR #8, T-0318, T-0323, T-0319 merged)
- **Progress: 37 done**, plus ~50 open rows (22 new Phase 3 children, 7 infra/deploy, ~20 small follow-ups).
- **Done this session (all on branch `main-hzlbfc`, PR #8):** T-0204, T-0205, T-0208, T-0300d, T-0312, T-0903, D-0061 (the human's H-07 review), H-11 closed.
- **PR #8 is MERGED** into `main` at `25f9660` (all 3 checks green). Post-merge verify on main: `19/19 successful, 0 cached, 43.3s` with `--force --concurrency=1`. Local `main` fast-forwarded.
- **Concurrency cap: 5.** Lane ownership binds tighter: web-shell tickets (T-0301a, T-0318, T-0319, T-0313) run one at a time.
- **In flight:** nothing. The Phase 3 triage check **finished**: D-0071 reconciles D-0063/D-0067 (11 points: one string module per flow plus a shared lib/i18n/workout.ts; one route rule, with no /session/:id/list; hand-offs only through index.tsx; host-owned registries UF-09/seams.tsx and UF-02/slots.tsx; one engine applySwap (T-0224) and one SwapSheet). TR-0030 resolved. Ticket files for T-0318 and T-0319 are written. The earlier "WIP(squad)" commits are superseded by the final commit.
- **T-0318 and T-0319 are DONE and merged**, plus T-0323 (e2e fixture, qa). **Ready now: T-0301a** (profile gate, web-shell). T-0318 unblocked T-0301b, T-0302a, T-0303a and T-0307a, which can run **in parallel** once T-0301a clears the web-shell lane. **Priority engine:** T-0219 (rule 7.1 timed costing overruns the budget; needs a decision), T-0224 (applySwap; spec settled in D-0071 §7, needs a ticket file), T-0214 (goal reps), T-0215 (one-period check-in).
- **T-0320 is a real risk, not polish** (product-owner judgement at T-0318 accept): T-0318's whole value is letting the 10 Phase 3 children run in parallel, and that guarantee currently rests on convention alone — no lint or check:repo rule stops a feature ticket editing `lib/i18n/en.ts` or another flow's `flows/uf-NN.ts`. Land T-0320 before several feature lanes run concurrently.
- **Waiting on humans:** T-0217 (tie-break for two ratings at the same endedAt, default "higher wins"); H-12 (review C-01 on a phone); H-05, H-06, H-10 (non-blocking).

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
- **`--concurrency=1` does not protect you from a *second* turbo process.** One turbo run at a time **per machine**, not just per invocation. T-0319 saw 4 load-sensitive failures (route table, auth guard, two import-ban tests) purely from an overlapping baseline run; all 4 passed in isolation and on a pristine main worktree. Never start a verify while another agent is building.
- **`pnpm --filter @workoutlab/web lint` is not the strictest lint gate.** `packages/design-tokens`' `scanner.test.ts` lints `apps/web` in an isolated copy of the tree with `dist` deleted, so a web-lane change (T-0319's unused type import) can pass the web lane's own lint and still fail a design-tokens test. Always verify with the root `-w` run.
- **Confirm a planted fault actually landed before trusting a fault-injection result.** T-0318 QA's first AC-6 fault (narrowing the workbox `globPatterns` to `assets/index-*.js`) gave a false green — every feature chunk is emitted as `index-<hash>.js`, so the "narrowed" glob still matched them. It only became a real test after checking `dist/sw.js` contents. A mutation that does not land looks exactly like a test that cannot fail.
- **`check:size` exits 0 against a stale or absent `dist/`** and has no root script (`pnpm -w check:size` errors; it lives in `apps/web`). A "check:size green" claim means nothing without a fresh build — T-0322.
- **A v1 fixture must carry every terminal row state before you trust a migration test.** T-0319's upgrade fixture held only `{deletedAt: null, status: "queued"}` sets, so two T-0300c-class faults — an `.upgrade()` resurrecting an offline-deleted set, and one re-queueing a rejected set — passed the build's own 17 fault injections and 85 tests. Also: a `where({userId, status})` assertion does **not** prove the `[userId+status]` index exists — Dexie silently degrades to the plain index plus a filter, so dropping the compound index kept 81/81 green while turning the flush's hot query into a table scan. Assert the schema, not just the query result. T-0327.
- **"Tests pass" ≠ correct.** T-0300c had 122/122 green while silently clearing a finished session's `ended_at` server-side and resurrecting deleted sets. Brief reviewers to hunt for ACs with no test.
- **"Tests fail" ≠ broken.** T-0203c's 2 red D-0053 §7 tests were test bugs: strict `assertEquals` on an instant, where `api/openapi.yaml`'s `Instant` allows `Z` **or** an offset. Check the contract before blaming the product.
- **Verify cited lane grants.** T-0203b changed `.prettierignore` claiming an "orchestrator grant" that existed nowhere. The change was needed, so it is now written into the ticket.
- **Web builds die on budget/time, not correctness.** 4 AgentLab web runs died unfinished; all 4 passed as Opus sub-agents. Split UI tickets small; tell builders to commit WIP early.

## Notes for the next orchestrator
- Next free: **D-0072**, **TR-0031**, tickets **T-0225+** (engine/data) and **T-0320+** (web). D-0062 = T-0205 defaults; D-0063–D-0066 groom A; D-0067–D-0070 groom B. Unused: D-0028, D-0038, D-0054.
- Spec-only and content roles have no shell. QA commits their output.
- After each merge: `pnpm -w typecheck lint test --force --concurrency=1` on main.
