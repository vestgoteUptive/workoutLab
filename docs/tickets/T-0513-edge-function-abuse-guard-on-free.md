---
id: T-0513
title: "Edge Function rate limit: accept the risk on Free (D-0190 §3), add Edge Function invocations to the cost guard's quotas, a one-line abuse runbook, and pin that the prod release deploys functions with config.toml's verify_jwt (folds in T-0238; go-live review F-3)"
lane: infra
screens: []
decisions: [D-0190, D-0189, D-0186, D-0053, D-0012]
deps: [T-0403, T-0405, T-0402b]
status: ready
groomed: 2026-10-06
---
<!-- Groomed 2026-10-06 by product-owner against main fa4171e (D-0190 §3, §5). Build flow:
wl-build-infra. About ⅛ day. Lane moved backend → infra: nothing under supabase/ changes.
Folds in T-0238 (the same F-3 item, raised earlier by the T-0310b review). -->

## Why
No Edge Function has a per-user rate limit (`docs/security/go-live-review.md` F-3,
`grep -i rate.?limit supabase/functions` is empty). D-0190 §3 accepts that risk on Free instead of
building a limiter:
- A limiter inside a function can't protect the invocation quota, because the invocation is
  counted before the function's code runs.
- A real per-user store would mean either a new processor or a schema contract change, for
  1–10 users.

What's left is what makes the accepted risk visible and recoverable:
- the cost guard tracks Edge Function invocations;
- the runbook says what to do about an abusive account.

T-0238 adds a second point: when functions are deployed, `verify_jwt = false` from
`supabase/config.toml` (D-0053 §4) must be applied on purpose. `infra/scripts/supabase-prod-release.sh`
runs `sb functions deploy "$f" --project-ref "$PROD_REF"` from the repo root with no
`--no-verify-jwt`/`--verify-jwt` flag, so the CLI reads `[functions.<name>] verify_jwt` from
`config.toml`. Nothing pins that.

## Scope
- **In:**
  - `infra/costs/quotas.json`:
    - add `supabase_function_invocations` with the Free quota from supabase.com/pricing (500,000
      a month at the time of writing; confirm it and set `checked` to the day you read it);
    - set `manual: true` and a `where` naming the dashboard page, unless a read-only Management
      API GET exposes the count. If one does, use it in `infra/scripts/cost-check.mjs` the same
      way `supabase_api_requests` is read.
  - `docs/infra-costs.md`: one sentence in the cost-guard section. It says D-0190 §3 accepts
    the missing function rate limit, and that an alert on this metric is the trigger to revisit.
  - `infra/deploy/README.md` is **not** touched (T-0508, T-0514b and T-0515 hold it in
    sequence). Put the abuse runbook line in `docs/infra-costs.md` instead: "Abuse by one account:
    ban the user in Supabase dashboard → Authentication → Users; their JWT stops working at
    expiry (≤ 1 h)".
  - `.github/scripts/supabase-prod-release.test.mjs`: one new test that pins the deploy shape for
    verify_jwt (AC-3).
  - A one-off read-only check of the live per-function `verify_jwt` (AC-4).
- **Out:**
  - Any limiter code.
  - Any migration or `docs/data-model.md` change.
  - Any change to `supabase/functions/**`.
  - Any prod write.

## Acceptance criteria
Every test title starts with `T-0513 AC-n`. These are `node --test` tests in `.github/scripts/`.

- **AC-1 (quota row)**
  - **Given** the committed `infra/costs/quotas.json`.
  - **Then** `metrics.supabase_function_invocations` exists, with a positive integer `quota`, an
    `https://` `source` and a `YYYY-MM-DD` `checked`.
  - The existing T-0405 AC-5 test ("every quota has a source URL and a checked date") stays
    green unchanged.

  **Red:** on main, the key is absent.
- **AC-2 (the guard alerts on it)**
  - **If the metric is API-read:** a `cost-check.test.mjs`-style test with a fake fetch returns
    an invocation count at 81 % of quota, and `run()` exits 2 and names
    `supabase_function_invocations`.
  - **If it is manual:** `evaluate({}, quotas)` lists the metric as manual (reported, never an
    error), and the doc sentence from Scope is present (assert the substring `D-0190`).
- **AC-3 (verify_jwt comes from config.toml)** A test reads
  `infra/scripts/supabase-prod-release.sh` and asserts:
  - every `functions deploy` command has no `--no-verify-jwt` and no `--verify-jwt` flag;
  - the script `cd`s to the repo root (the dir that holds `supabase/config.toml`) before
    deploying;
  - every function in its `FUNCTIONS=(…)` array has a `[functions.<name>]` table with
    `verify_jwt = false` in `supabase/config.toml`.

  Planted faults, each on a backup copy and restored with `cp`:
  - append `--no-verify-jwt` to the deploy line;
  - add a fifth function name with no config table.

  Each must fail AC-3.
- **AC-4 (live, read-only, by an agent)**
  - Run `GET https://api.supabase.com/v1/projects/csgjsdwuxqtuqpuazzpz/functions` with
    `SUPABASE_ACCESS_TOKEN` from `.env.local`. Never print the token. Use the
    `curl -sS -K -` header form that `supabase-prod-release.sh` already uses.
  - Record each slug with its `verify_jwt` and `status`. Expected:
    `workouts`/`balance`/`sessions`/`account` → `verify_jwt: false`, `ACTIVE`.
  - A mismatch is not fixed here. Raise triage, because a redeploy is a human step (H-19
    script).

## Paths you may change
- `infra/costs/quotas.json`, `docs/infra-costs.md`, `infra/scripts/cost-check.mjs` (only if the
  metric is API-read), `.github/scripts/supabase-prod-release.test.mjs`,
  `.github/scripts/cost-check.test.mjs` and `.github/scripts/fixtures/cost-check/**` (the lane:
  `infra`).
- **Listed extras:**
  - `docs/tickets/T-0513-edge-function-abuse-guard-on-free.md`, for the build and accept logs.

## Contract impact
None. D-0190 §3 records the accepted risk.

## Definition of done
- Tests for every AC pass. The red run, the planted faults and the AC-4 read-back are recorded.
- `npx -y pnpm@10.28.2 -w test:repo-checks`, `-w format:check` and
  `node .github/scripts/check-all.mjs` are green through `scripts/locked.sh small`. No
  `apps/`/`packages/` file changes, so the turbo gate isn't needed beyond one cached
  `-w typecheck lint test --concurrency=1`.
- Commits start `T-0513`.

## Notes
- **Parallel:** no file shared with T-0507, T-0508, T-0509, T-0514b or T-0515. Runs alongside
  any of them.
- T-0238 closes as folded into this ticket (D-0190 §5).

## Build / accept log
