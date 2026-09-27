---
id: D-0009
title: Domains — landing on workout.vestgote.com, app on workout-app.vestgote.com
status: superseded
date: 2026-09-27
by: human (Henrik) via orchestrator
area: infra
supersedes: D-0007
---
## Context
The human asked for "something like workout.vestgote.com". vestgote.com is on Cloudflare. Its free universal certificate covers only one subdomain level, so `app.workout.vestgote.com` would need a paid Advanced Certificate.

## Decision
- `workout.vestgote.com`: the "workout LAB by Uptive" welcome page (Astro, `apps/landing`). Its CTA links to the app.
- `workout-app.vestgote.com`: the PWA (`apps/web`).
- Staging: Cloudflare Pages preview URLs (`*.pages.dev`), no custom domain.
- Supabase Auth redirect URLs: both hosts, the Pages preview pattern, and `http://localhost:5173`.
- The squad may manage DNS records only for `workout.vestgote.com` and `workout-app.vestgote.com` (gate 4).

## Consequences
Changing the app host later means updating the DNS record, the Terraform variables and the auth redirect URLs. If the app should live under the same host (`workout.vestgote.com/app`), that needs a routing Worker in front of both Pages projects; raise triage if wanted.
