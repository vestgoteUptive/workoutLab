# workoutLab

A progressive web app that tracks training load **per body area** over a rolling 14-day window and suggests the next workout from the gaps, fitted to the time the user has available.

- Product & flows: `docs/PRD.md`, `docs/user-flows-v1.md`
- Engine rules: `docs/engine-rules.md`
- Data model: `docs/data-model.md`
- API contract: `api/openapi.yaml`
- Agent setup: `CLAUDE.md` and `.claude/agents/`

## Layout

```
apps/web          PWA frontend
apps/landing      Welcome page (workout.vestgote.com)
supabase          Migrations, Edge Functions, seed, RLS tests
infra/terraform   Supabase projects + Cloudflare Pages/DNS
agents/roles      Agent definitions (single source)
.squad            Decisions, board, triage, journal
packages/engine   Recommendation engine (pure, deterministic, heavily tested)
packages/shared   Shared types generated from the OpenAPI spec
data/exercises    Exercise library + muscle-area mapping
tests/e2e         End-to-end tests
docs/decisions    Architecture decision records (ADRs)
```

## Getting started with Claude Code

The project is built by an agent squad. Start with `.squad/README.md`.

```bash
node scripts/sync-agents.mjs   # generate agents + AgentLab flows from agents/roles
```

Then, in Claude Code in this repo: `/tick` for one iteration, or `/loop /tick` to keep it running. `/idea <text>` feeds in new ideas.
