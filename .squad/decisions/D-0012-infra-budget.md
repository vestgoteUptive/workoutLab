---
id: D-0012
title: Infra budget 50 USD/month; custom SMTP for auth email
status: decided
date: 2026-09-27
by: human (Henrik) via orchestrator
area: infra
---
## Context
The human set a budget of 50 USD per month for infrastructure. Estimate: `docs/infra-costs.md` (0 during the build phase, about 25 at launch). Supabase's built-in mailer is limited to 2 emails/hour and is documented as not for production, so magic-link login needs its own SMTP provider.

## Decision
- **Budget:** at most 50 USD/month for all infra combined. Target at launch: 30 or less, which leaves headroom.
- Supabase prod moves Free → **Pro (25)** at the first production deploy (gate 3 / H-06). The spend cap stays on. Staging stays on a free project in a **separate free org**.
- Cloudflare stays on the Free plan: two Pages projects, no Workers Paid, no Advanced Certificate Manager.
- **Auth email:** Resend (free tier) as Supabase custom SMTP, sending from `workout.vestgote.com`. Its DKIM/SPF/return-path records under `workout.vestgote.com` are allowed DNS changes (gate 4 extended to `*.workout.vestgote.com`).
- **Cost guard:** every ticket that adds a recurring cost states it in its Contract impact section and adds a row to `docs/infra-costs.md`. Anything that raises the monthly estimate needs a decision, and crossing gate 2 needs a human.

## Consequences
New tickets: T-0404 (custom SMTP) and T-0405 (cost and quota alerts). New human item: H-09 (Resend account + API key).
