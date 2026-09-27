---
id: D-0007
title: Domains — landing on workoutlab.vestgote.com, app on workoutlab-app.vestgote.com
status: superseded
date: 2026-09-27
by: orchestrator
area: infra
---
## Context
vestgote.com is on Cloudflare. Its free universal certificate covers only one subdomain level, so `app.workoutlab.vestgote.com` would need a paid certificate.

## Decision
- `workoutlab.vestgote.com`: "workout LAB by Uptive" welcome page (Astro, `apps/landing`). Its CTA links to the app.
- `workoutlab-app.vestgote.com`: the PWA.
- Supabase Auth redirect URLs: both hosts plus `localhost:5173`.

## Revisit when
There's a product domain, or a human prefers another name. The change is only DNS records plus the Terraform variables and redirect URLs.
