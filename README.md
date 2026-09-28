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

## Running the web app

The browser bundle needs two environment variables. Vite only auto-loads `.env*` from
`apps/web/`, **not** from the repo root, so they go in `apps/web/.env.local` (gitignored) —
the root `.env.local` holds the Terraform/Supabase CLI secrets and is not read by the web app.

```bash
cp apps/web/.env.example apps/web/.env.local   # then fill in both values
pnpm --filter @workoutlab/web dev
```

| Variable | Where it comes from |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase dashboard > Project Settings > API > Project URL. For the local stack, `API_URL` from `npx supabase status -o env`. |
| `VITE_SUPABASE_ANON_KEY` | Same page, Project API keys > `anon` / public. Locally, `ANON_KEY` from the same command. |

Both are public, RLS-scoped values and safe in the bundle. Never put the service-role key in a
`VITE_*` variable: anything `VITE_`-prefixed is inlined into the shipped JavaScript.

If either is missing, `dev` still starts and the shell paints — auth is disabled, the app stays
signed out, and the console carries one warning naming both variables (T-0902). A production
`build` still fails loudly, because the CSP `connect-src` is derived from the URL.

## Getting started with Claude Code

The project is built by an agent squad. Start with `.squad/README.md`.

```bash
node scripts/sync-agents.mjs   # generate agents + AgentLab flows from agents/roles
```

Then, in Claude Code in this repo: `/tick` for one iteration, or `/loop /tick` to keep it running. `/idea <text>` feeds in new ideas.
