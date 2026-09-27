---
id: D-0010
title: Domains — landing on workout.vestgote.com, app on app.workout.vestgote.com
status: decided
date: 2026-09-27
by: human (Henrik) via orchestrator
area: infra
supersedes: D-0009
---
## Context
The human wants the app on `app.workout.vestgote.com`. D-0009 assumed that a second-level subdomain needs a paid certificate. That is true for proxied DNS records under Universal SSL, but a Cloudflare Pages custom domain gets its own Cloudflare for SaaS certificate for that hostname, at no cost and at any subdomain depth (developers.cloudflare.com/ssl/edge-certificates/advanced-certificate-manager, "Limitations").

## Decision
- `workout.vestgote.com`: the "workout LAB by Uptive" welcome page (Astro, `apps/landing`, its own Pages project). Its CTA links to the app.
- `app.workout.vestgote.com`: the PWA (`apps/web`, its own Pages project).
- Both hostnames are attached as **Pages custom domains** (Terraform `cloudflare_pages_domain` + CNAME to `<project>.pages.dev`). Don't serve them as plain proxied records, because Universal SSL doesn't cover the second level. Buying Advanced Certificate Manager or Total TLS is not needed, and doing so would cross gate 2.
- Staging: Pages preview URLs (`*.pages.dev`).
- Supabase Auth redirect URLs: both hosts, the Pages preview pattern, and `http://localhost:5173`.
- The squad manages DNS records only for `workout.vestgote.com` and `app.workout.vestgote.com` (gate 4).

## Consequences
After the first deploy, T-0401 must verify the certificate status of both custom domains (`active`) and that HTTPS works.
