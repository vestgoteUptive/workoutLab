---
id: D-0006
title: Infrastructure as code — Terraform for accounts-level resources, Supabase CLI for the database
status: decided
date: 2026-09-27
by: orchestrator
area: infra
---
## Decision
- `infra/terraform/`: providers `supabase/supabase` (project, auth settings, redirect URLs) and `cloudflare/cloudflare` (Pages projects, custom domains, DNS records under `workout.vestgote.com` and `app.workout.vestgote.com` only (D-0010)). State is local, gitignored, until a backend is chosen.
- `supabase/`: `config.toml`, SQL migrations, seed, Edge Functions, pgTAP tests for RLS. Local dev uses `supabase start` (Docker).
- **Environments:** `local` (Docker), `staging` (Cloudflare Pages branch previews against a second free Supabase project, `workoutlab-staging`), `prod`.
- **CI (GitHub Actions):** typecheck, lint, unit, pgTAP, e2e against local Supabase; deploy on `main` after H-06.
- Secrets live only in `.env.local` (gitignored) and GitHub Actions secrets. `.env.example` lists names only.

## Consequences
Needs H-02 and H-03 before any cloud resource exists. Until then, everything runs against local Supabase.
