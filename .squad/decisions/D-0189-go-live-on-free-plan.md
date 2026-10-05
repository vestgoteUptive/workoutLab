---
id: D-0189
title: "Go live on the Supabase Free plan (human decision); Pro deferred. The keep-alive ping covers the 7-day pause; no automatic backups on Free"
status: revisit
date: 2026-10-05
by: human (Henrik) via orchestrator
area: infra
amends: D-0012, D-0186
---
## Context
D-0012 and T-0402d planned Free → Pro (~25 USD/month) at go-live (gate 2), mainly because Free
projects pause after 7 days without activity. The expected audience at launch is 1–10 users. The
human runs a keep-alive container that pings the prod project every 2 days.

## Decision
1. Go live on **Free**. T-0402d step 2 (Pro upgrade) is skipped; its AC-2 expects plan `free`.
2. The pause risk is covered by the human's keep-alive ping (outside the repo). If the project
   pauses anyway, that is the signal to upgrade.
3. Known Free-plan gaps, accepted: **no automatic backups** (data loss can't be restored), log
   retention ~1 day, 500 MB database, 50k MAU. The privacy notice's "backups up to 7 days" stays
   true as an upper bound (there are none).
4. `docs/infra-costs.md` actuals stay at 0 USD; T-0405's cost check keeps expecting `free`.

## Revisit when
- Real users rely on their data (backups matter), the project pauses, or any Free limit is near
  (T-0405 alerts at 80 %). Then upgrade to Pro with the spend cap on (gate 2).
