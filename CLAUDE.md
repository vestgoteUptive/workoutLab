# workoutLab — project memory for Claude Code

## What we're building
A PWA with login and online storage. Users log workouts. The app tracks **hard sets per body area** over a **rolling 14-day window** against per-area targets, and suggests the next workout (areas + exercises) fitted to the time available.

Body areas: chest, back, shoulders, arms, core, glutes, quads, hamstrings, calves.

## Start here
1. `.squad/README.md`: how the squad works. Then `.squad/state.md` (where we are) and `.squad/board.md` (what's next).
2. `.squad/decisions/`: why things are the way they are. Newest decision wins, unless it is superseded.
3. `docs/gaps.md`: what the original docs left open, and the default each gap got.

## Non-negotiable principles
1. **One task on screen during a workout.** Focus mode (UF-09) shows only the current step. Everything else lives behind Pause (UF-09.9).
2. **Time budget is a first-class input.** Every workout start asks how long the user has (UF-08.1).
3. **Deterministic engine.** Suggestions come from the rules in `docs/engine-rules.md`, implemented in `packages/engine` as pure functions. An LLM may only write explanations, never pick exercises.
4. **Targets are not static.** They adapt to what the user actually does (UF-11).
5. **Onboarding under 60 seconds** to a first plan (UF-01).

## Contracts (change only with a decision in `.squad/decisions/`)
- `docs/data-model.md`: the schema. Migrations must match it.
- `api/openapi.yaml`: the Edge Functions (D-0001). Plain CRUD goes through supabase-js + RLS.
- `docs/engine-rules.md`: engine behaviour. Tests must encode it.
- `packages/design-tokens/src/tokens.json`: the only place colours and fonts are defined.

If you need a contract change your lane doesn't own, stop that task and propose it (a follow-up, or triage).

## Screen IDs
Use **user flows v2**: `Design-docs/docs/product/user-flows.md` (D-0002). `docs/user-flows-v1.md` is history. v2 adds UF-10 Balance, UF-11 Plan check-in and UF-01.5 Account. Put IDs in tickets, commits and PR titles, e.g. `T-0304 UF-09.5: auto-start rest`.

## Design system ("Chalk & Iron")
Source: `Design-docs/docs/design/design-system.md` → `packages/design-tokens`. Background `#121210`, accent lime `#D4F25A`, Big Shoulders Display + DM Sans. Coverage ramp and attention outline: D-0003.

## Stack (D-0001)
pnpm + Turborepo, TypeScript strict. React + Vite PWA (`apps/web`), Astro landing page (`apps/landing`), Supabase (Postgres, Auth, Edge Functions), Cloudflare Pages. IaC: Terraform + Supabase CLI (D-0006). Domains (D-0010): landing `workout.vestgote.com`, app `app.workout.vestgote.com`.

## How work flows
- The main session is the **orchestrator**. `/tick` runs one iteration; `/loop /tick` keeps it going; `/plan-phase N` grooms a phase; `/idea <text>` feeds in new ideas.
- Execution goes through AgentLab flows over the `agentlab` MCP when the app is running, and through the sub-agents in `.claude/agents/` otherwise (D-0008).
- Agents are defined once in `agents/roles/`. After editing them, run `node scripts/sync-agents.mjs`. Never edit `.claude/agents/` or `.agentlab/` by hand.
- One ticket = one lane = one worktree/branch `t/T-NNNN-slug`. Lanes and their paths: `.squad/ownership.yaml`.
- Human gates: `.squad/gates.md`. Anything waiting on a human goes in `.squad/needs-human.md`, and all other work continues.
- Definition of done: every acceptance criterion has a passing test, `pnpm -w typecheck lint test` is green, contracts are unchanged or have a linked decision, and the ticket and screen IDs are cited. Engine changes also need the simulated 14-day history tests.
