---
id: D-0011
title: The hand-made Supabase project "workoutLab" is prod; Google OAuth client set up by hand
status: decided
date: 2026-09-27
by: human (Henrik) via orchestrator
area: infra
---
## Context
The human created the Supabase project `workoutLab` (ref `csgjsdwuxqtuqpuazzpz`, org "vestgoteUptive's Org", free plan) and a Google Cloud project `workoutlab`. The Google Cloud project has an OAuth "Web application" client ("workoutLab Supabase web") with an external consent screen in testing mode.

## Decision
- Supabase ref `csgjsdwuxqtuqpuazzpz` is **prod**. T-0400 imports it into Terraform (`terraform import`) instead of creating it. A second free project `workoutlab-staging` is still created by Terraform.
- Google OAuth client, configured on 2026-09-27:
  - JS origins: `http://localhost:3000`, `http://localhost:5173`, `https://app.workout.vestgote.com`
  - Redirect URI: `https://csgjsdwuxqtuqpuazzpz.supabase.co/auth/v1/callback`
- Supabase redirect allow-list: `http://localhost:3000/**`, `http://localhost:5173/**`, `https://app.workout.vestgote.com/**`. Site URL stays `http://localhost:3000` until the first prod deploy (H-06), then becomes `https://app.workout.vestgote.com`.
- The client ID and secret live only in `.env.local` (`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`). Local Supabase (`config.toml`) reads them through `env(...)`.
- Google OAuth stays in testing mode, so only listed test users can sign in, until someone publishes the app (gate 6).

## Consequences
T-0400 must codify these auth settings in Terraform so that manual edits don't drift. The Vite dev server uses port 5173.
