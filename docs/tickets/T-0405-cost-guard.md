---
id: T-0405
title: "Cost guard: a read-only usage check that flags any quota at or above 80 % (exit 2), a monthly actuals table in docs/infra-costs.md, and the stale staging row removed; the spend-cap check moves to T-0402d (D-0012, D-0186 §6)"
lane: infra
screens: []
decisions: [D-0012, D-0184, D-0186]
deps: [T-0400]
status: ready
groomed: 2026-10-05
---
<!-- Groomed 2026-10-05 by product-owner against main c378ddf (D-0186 §6). Build flow:
wl-build-infra. About ½ day. Read-only against every account. The board row's "spend cap verified
on" moved to T-0402d: prod is on Free until H-06, and the spend cap only exists on Pro. -->

## Why
D-0012 caps infra at 50 USD/month, and gate 2 makes any increase a human call. Today nothing
watches the numbers. Prod is on the Supabase Free plan, so it can't overspend, but it can **hit
a quota**. Free projects pause, and the database or egress can run out. Resend's free tier
(about 100 mails a day) is the other ceiling, and a busy day of magic links could hit it. The
Free plan has no configurable usage alerts, so the guard is a script the orchestrator runs
monthly, and before and after each phase-4 change. It never needs a paid product.

## Scope
- **In:**
  - `infra/scripts/cost-check.mjs`, plain Node 22 with no dependencies, read-only:
    - **Supabase**, with `SUPABASE_ACCESS_TOKEN` and `SUPABASE_ORG_ID`, GET only. Report the
      org plan (`free`/`pro`) and the project status (`ACTIVE_HEALTHY`, or paused). Report
      every usage metric the Management API exposes read-only for the prod project, for
      example database size and the API request counts. The builder finds the exact endpoints
      during discovery and lists them in the log.
    - **Cloudflare**, with the H-03 token, GET only: the number of Pages projects in the account
      (2 expected), and this month's deployment count for each, against the 500 builds a month
      in `docs/infra-costs.md`.
    - **Quota table:** a committed `infra/costs/quotas.json` holding each metric's free-plan
      quota, the quota's source (the URL and the date checked), and a `"manual": true` flag
      for metrics no read-only API exposes (Resend daily sends, GitHub Actions minutes, Supabase
      egress if it isn't exposed).
    - **Output:** one row per metric, `<metric> <used>/<quota> <pct>%` or `<metric> check by
      hand: <where>`. Exit codes: 0 when all are below 80 %; **2** when any is at or above
      80 %, naming it on a final `ALERT:` line; 3 on an API error (HTTP status only, never a
      body).
    - **Plan watch:** if the Supabase org plan isn't `free` while `docs/infra-costs.md` says
      "Build phase", print `ALERT: plan is <plan>, the doc says Free` and exit 2. That catches
      an accidental upgrade (gate 2).
    - Pure exports for tests: `evaluate(usage, quotas)` and `run({fetchImpl, env, stdout})`.
  - `.github/scripts/cost-check.test.mjs` (node:test) and fixtures under
    `.github/scripts/fixtures/cost-check/`.
  - `docs/infra-costs.md`:
    - remove the "Supabase staging" row and the "Staging created inside the Pro org" risk row
      (D-0184 §5: no staging);
    - add a **"Monthly actuals"** table (`Month | Supabase plan | Usage peaks (% of quota) |
      Cloudflare | Resend | Total USD | Checked by`), with its first row filled from this
      ticket's live run;
    - add one line saying the orchestrator runs `cost-check.mjs` monthly and before/after each
      phase-4 change, and that exit 2 raises an H-item.
- **Out:**
  - Verifying the spend cap, and the Pro upgrade: both in T-0402d at H-06 (gate 2).
  - Any write call, paid alert product, or billing setting.
  - Running in CI (D-0186 §4).
  - Turning on Supabase's or Resend's own email notifications, which is the human's account
    setting. If the builder finds such a setting, list it as a follow-up for the human.

### Edge cases that are in scope
- **The project is paused** (Free projects pause after 7 days idle). Report `status PAUSED` as an
  `ALERT:` line (exit 2). Don't restore it: that's a write.
- **A metric endpoint returns 404 or 403** (not on this plan, or the token lacks the scope). Mark
  that metric `check by hand`, with the status, and don't fail the run. Only a failure on the
  plan/status call is exit 3.
- **Usage exactly at 80 %** counts as an alert (`>=`).
- **The month boundary.** The Cloudflare deployment count covers the current UTC calendar month.

## Acceptance criteria
Each node:test title starts with `T-0405 AC-n`.

- **AC-1 [static] Threshold.**
  - **Given** quotas `{db_size_mb: 500}` and usage `399`, **then** there's no alert and exit 0.
  - **Given** `400` (exactly 80 %), **then** `ALERT: db_size_mb 400/500 80%` and exit 2.
  - **Given** `450`, **then** exit 2.
- **AC-2 [static] Manual metrics.** **Given** a quota with `manual: true`, **then** the output
  has `<metric> check by hand: <where>`, and the exit code isn't affected.
- **AC-3 [static] Plan and status alerts.**
  - **Given** an org plan of `pro` and the doc in its build phase, **then** exit 2 with the plan
    alert.
  - **Given** a project status of `PAUSED`, **then** exit 2.
- **AC-4 [static] Read-only and quiet.**
  - **Given** a fetch spy, **then** every call is a GET.
  - **And** with sentinel tokens in the environment, the sentinels appear in neither stdout nor
    stderr, including on the exit-3 path.
  - **And** a 403 on one metric gives `check by hand` with exit 0.
- **AC-5 [static] The doc has no staging.**
  - **Given** `docs/infra-costs.md`, **then** no table line (a line starting with `|`) contains
    `staging` (case-insensitive), and the file has a `## Monthly actuals` heading with at least
    one data row.
  - **And** every metric in `quotas.json` has a `source` URL and a `checked` date.
- **AC-6 [live, read-only]** The builder runs the script with `.env.local` loaded.
  - Its full output goes in the log.
  - The first actuals row is filled from it.
  - Expected: plan `free`, status `ACTIVE_HEALTHY`, 2 Pages projects, and no alert. If an alert
    fires, record it and raise it in the handback.
- Planted fault, recorded: change `>=` to `>` in a copy of `evaluate`, and AC-1's 80 % case goes
  red.

## Paths you may change
- `infra/scripts/cost-check.mjs`, `infra/costs/quotas.json` (new), `docs/infra-costs.md`.
- `.github/scripts/cost-check.test.mjs`, `.github/scripts/fixtures/cost-check/**` (new).
- **Listed extras:**
  - `docs/tickets/T-0405-cost-guard.md`, for the build and accept logs.

## Contract impact
None. No recurring cost: the guard itself is free. `docs/infra-costs.md` changes as described,
and the totals don't change.

## Definition of done
- Every `[static]` AC has a passing node:test, and the planted fault is recorded. AC-6's output is
  in the log.
- `node --test .github/scripts/cost-check.test.mjs` passes while you work. Before handing back,
  `npx -y pnpm@10.28.2 -w test:repo-checks`, `-w format:check` and
  `node .github/scripts/check-all.mjs` pass.
- Nothing under `apps/` or `packages/` changes, so the `-w typecheck lint test` gate and e2e
  aren't needed (D-0178).
- Commits start `T-0405`.

## Notes
- **Environment:** `set -a; . <repo>/.env.local; set +a; node infra/scripts/cost-check.mjs` in one
  command line.
- **Parallel:** `docs/infra-costs.md` is touched only by this ticket in the current batch.
  T-0404b and T-0402d may add rows later.
- **Follow-up for the orchestrator:** add "run `cost-check.mjs` monthly" to its tick routine. That
  lives in `.squad/` and the tick skill, outside this lane.

## Build / accept log
