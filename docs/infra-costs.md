# Infrastructure cost estimate

**Budget: 50 USD / month** (D-0012). Prices checked 2026-09-27 on supabase.com/pricing and developers.cloudflare.com. Re-check before any plan change.
Claude / AgentLab usage for building the app is **not** infra and is not counted here.

## Monthly estimate by stage

| Item | Build phase (now → launch) | Launch (v1 live) | Growth (~10k MAU) | Notes |
|---|---|---|---|---|
| Supabase prod `csgjsdwuxqtuqpuazzpz` | 0 (Free) | **25** (Pro) | 25–35 | Pro includes 10 USD compute, which covers the Micro instance. Spend cap stays **on**. |
| Cloudflare Pages × 2 (landing, app) | 0 | 0 | 0 | Free: 500 builds/mo, unlimited bandwidth, free per-domain certs (D-0010). |
| Cloudflare DNS / zone vestgote.com | 0 | 0 | 0 | Already owned; the domain renewal isn't attributed to this app. |
| Transactional email (magic links) | 0 | 0 | 0–20 | Resend free, live (T-0404b): auth mail over SMTP from `no-reply@workout.vestgote.com`. Free tier limits 3,000 mails/month and 100/day, one domain. Supabase `rate_limit_email_sent` = 10/hour project-wide keeps a busy day under the daily cap. Paid tier (20) only if exceeded. |
| GitHub (repo + Actions) | 0 | 0 | 0–4 | Free private-repo minutes. Keep e2e lean; cache pnpm and the Supabase images. |
| Google OAuth | 0 | 0 | 0 | Free. Moving from testing mode to production needs verification, which is free but has to be filed (gate 6). |
| Error monitoring (Sentry) | 0 | 0 | 0 | Free developer tier; optional. |
| Terraform state | 0 (local) | 0 | 0 | Move to Cloudflare R2 (free 10 GB) when CI applies. |
| **Total** | **0** | **≈ 25** | **≈ 25–50** | Headroom: ≥ 25 USD/mo at launch. |

## What would break the budget, and the guardrail for each

| Risk | Cost | Guardrail |
|---|---|---|
| Supabase PITR, larger compute, IPv4 add-on | 100+ / 10–60 / 4 | Not needed for v1. Any add-on needs a decision + gate 2. |
| Supabase overages | variable | Spend cap on (default on Pro). Alert at 80 % of included quotas. |
| Cloudflare Workers Paid (routing Worker, heavy Functions) | 5 | Not needed: two Pages projects, no Functions (D-0010). |
| Cloudflare Advanced Certificate Manager | 10 | Not needed: Pages custom domains get their own certs (D-0010). |
| Email volume beyond the free tier | 20 | Magic-link rate limit per user; OAuth first. |

## When to move off the Free plan
Upgrade prod to Pro **at the first production deploy (H-06)**, not before. Free projects pause after 7 days without traffic and have no backups; Pro adds daily backups. That's the step from 0 to about 25 USD.

## Monthly actuals
The orchestrator runs `node infra/scripts/cost-check.mjs` (read-only) monthly and before and after each phase-4 change. Exit 2 (any quota at or above 80 %, a paused project, or a plan change) raises an H-item.

| Month | Supabase plan | Usage peaks (% of quota) | Cloudflare | Resend | Total USD | Checked by |
|---|---|---|---|---|---|---|
| 2026-10 | Free, project ACTIVE_HEALTHY | Pages builds 0/500 (0%); db size, egress and Resend by hand | 2 Pages projects, 0 deployments | not checked (by hand) | 0 | T-0405 live run 2026-10-05 |

## Edge Function abuse (D-0190 §3)
D-0190 §3 accepts the missing per-user rate limit on the Edge Functions while we are on Free: a limiter inside a function can't protect the invocation quota, because the invocation is counted before the code runs. The cost guard lists `supabase_function_invocations` (500,000 a month on Free) as a by-hand check; an alert on this metric, or a surge seen in the dashboard, is the trigger to revisit.

Abuse by one account: ban the user in Supabase dashboard → Authentication → Users; their JWT stops working at expiry (≤ 1 h).
