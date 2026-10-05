---
id: T-0402d
title: "Go-live at H-06: Supabase Free→Pro with the spend cap verified on, site_url switched to https://app.workout.vestgote.com (keys-only PATCH + expected file), PROD_DEPLOY_ENABLED set, first prod deploy of app and landing verified (gate 2 + gate 3; D-0011, D-0012, D-0186 §1)"
lane: infra
screens: [UF-01.5]
decisions: [D-0010, D-0011, D-0012, D-0184, D-0185, D-0186]
deps: [T-0402a, T-0402b, T-0402c, T-0403]
status: todo (needs H-06)
groomed: 2026-10-05
---
<!-- Groomed 2026-10-05 by product-owner against main c378ddf (D-0186 §1). Build flow:
wl-build-infra. About 2–3 hours of agent work. Almost every step is a human action (money, the
first prod deploy), and agents only prepare and verify. It doesn't start until H-06 is ticked.
The landing prod deploy also needs H-10 (copy + privacy mailbox). -->

## Why
After T-0402a–c, everything for production exists but is switched off: the prod job waits on
`PROD_DEPLOY_ENABLED`, `site_url` still says `http://localhost:3000` (D-0011), and prod is on the
Free plan. D-0012 moves prod to **Pro** at the first production deploy, with the **spend cap
on**. Free projects pause after 7 days idle and have no backups, and neither is acceptable for
real users. Gate 2 (money) and gate 3 (the first prod deploy) both sit with the human at H-06.
This ticket turns the switches in a safe order and proves each one with a read-only check.

## Scope
- **In,** in this order:
  1. **Preparation (agent):**
     - `infra/deploy/go-live.md`: the human's checklist, in the order below, with the exact
       commands;
     - the `auth-patch.mjs --set site_url=https://app.workout.vestgote.com` preview run, without
       `--apply` (a read-only GET), with its before/after in the log;
     - `infra/auth/expected-auth.json` gets `site_url` updated in the same commit (D-0185 §4).
  2. **Pro upgrade (human, gate 2):** in the Supabase dashboard, org → Billing, Free → Pro, with
     the **spend cap left on**.
  3. **`site_url` switch (human):** run `auth-patch.mjs … --apply` with `CONFIRM_PROD_AUTH`.
  4. **Turn on prod deploys (human):** set the repo variable `PROD_DEPLOY_ENABLED=true`, then
     re-run the newest green CI on `main`, or push the go-live commit. The `production` job
     deploys web and landing.
  5. **Verification (agent, read-only):** AC-2 to AC-6.
  - `docs/infra-costs.md`: the "Launch" column becomes actuals (Pro, 25 USD), and a monthly
    actuals row is added (T-0405's table).
- **Out:**
  - Any add-on (PITR, compute, IPv4): gate 2, not in D-0012.
  - Publishing the Google OAuth app out of testing mode (gate 6, a separate human decision).
  - Adding the landing host to the allow-list (D-0186 §1).
  - Database or function releases. They're done in T-0402b. A later one reruns T-0402b's
    script.

### Edge cases that are in scope
- **H-10 isn't done** (landing copy or privacy mailbox). The prod job deploys both apps. If the
  human wants the app live without the landing page, the prod job's landing step needs its own
  switch, `vars.PROD_DEPLOY_LANDING`. Add it in this ticket only if H-06 is approved while H-10
  is still open, and record that choice.
- **The upgrade turns off the spend cap by default**, or the human can't find it. Stop before
  step 4. A prod deploy with an uncapped bill crosses D-0012.
- **Prod CI on `main` is red at go-live.** The prod job doesn't run (T-0402a AC-2). Fix forward
  through the normal ticket flow. Never deploy around CI.
- **An existing session on a preview origin after the `site_url` switch.** Unaffected: the
  allow-list still contains the preview pattern.

## Acceptance criteria
- **AC-1 [static]** `infra/auth/expected-auth.json` has `site_url` `https://app.workout.vestgote.com`,
  and the T-0500 tests still pass on it.
- **AC-2 [live, read-only] The plan and the cap.** `GET /v1/organizations/<org>` shows plan
  `pro`. The spend cap is confirmed on by the human, with a screenshot or a written note in the
  log, because no read-only API exposes it. `cost-check.mjs` (T-0405) runs, with its output in
  the log, and its plan alert is expected and gets cleared by the doc update.
- **AC-3 [live, read-only]** The T-0500 drift check exits 0 after the human's PATCH, and
  `auth-patch`'s `others_sha256` was unchanged.
- **AC-4 [live, read-only] Prod deployments exist.**
  - `GET …/pages/projects/workoutlab-web/deployments?env=production` and the same for
    `workoutlab-landing` each show one newest deployment, from `main`'s head SHA, with status
    `success`.
- **AC-5 [live, read-only] The sites answer.**
  - `curl -sS -o /dev/null -w '%{http_code} %{ssl_verify_result}'` on
    `https://app.workout.vestgote.com/`, `https://app.workout.vestgote.com/auth/callback` and
    `https://workout.vestgote.com/` gives `200 0` for each.
  - The landing page's `a[data-cta="primary"]` `href` is `https://app.workout.vestgote.com/`.
- **AC-6 [live, human] Sign-in on prod (UF-01.5).** The human requests a magic link on
  `https://app.workout.vestgote.com` and lands signed in on that origin. Google sign-in works for
  a listed test user (D-0011). The orchestrator records it.
- **AC-7 [static] The doc reflects reality.** `docs/infra-costs.md` has a monthly actuals row
  with plan Pro and 25 USD. T-0405's AC-5 test still passes.

## Paths you may change
- `infra/deploy/go-live.md` (new), `infra/auth/expected-auth.json`, `docs/infra-costs.md`.
- `.github/workflows/deploy.yml`: only for the optional `PROD_DEPLOY_LANDING` switch (edge
  case), with its `check-deploy-workflow` test updated to match.
- `.github/scripts/check-deploy-workflow.mjs`, `.github/scripts/check-deploy-workflow.test.mjs`:
  only alongside that switch.
- **Listed extras:**
  - `docs/tickets/T-0402d-go-live-prod-deploy.md`, for the build and accept logs.

## Contract impact
None to the schema, API, engine or tokens. **Recurring cost +25 USD/month (Supabase Pro)**,
already budgeted in D-0012 and `docs/infra-costs.md`. It's gate 2, approved through H-06.

## Definition of done
- **Gate:** the agent prepares (step 1) and hands back `blocked`: "go-live checklist ready
  (H-06)". The human does steps 2–4. A verify run does step 5. No agent changes a billing
  setting, sets `PROD_DEPLOY_ENABLED`, or sends the PATCH.
- AC-1 and AC-7 pass in `-w test:repo-checks`. Every live AC's output is in the log.
- `npx -y pnpm@10.28.2 -w test:repo-checks`, `-w format:check` and
  `node .github/scripts/check-all.mjs` pass.
- Commits start `T-0402d` and cite UF-01.5.

## Notes
- **H-06** already exists in `.squad/needs-human.md`. When this ticket is groomed into a build,
  the orchestrator adds the go-live checklist link to H-06's text.
- **Depends on T-0403** (the release check's go/no-go), because H-06 is answered from T-0403's
  review.

## Build / accept log

### Go-live (2026-10-05, human-approved H-06) - live
- Plan stays **Free** (human decision, D-0189); no Pro upgrade, so AC-2 expects `free`.
- `site_url` → `https://app.workout.vestgote.com` via human-applied keys-only PATCH; `others_sha256` unchanged; `expected-auth.json` updated; drift check green (17 keys).
- **Manual deploy** from the human's terminal (`deploy-prod.sh`), because GitHub Actions runners were unavailable — mirrors the CI `production` job. Local gate on main beforehand: unit 19/19, repo-checks 275/0 (after a fixture fix), check-all clean, e2e 237/237. Bundle secret scan: clean (first, over-broad version false-positived on supabase-js's own `startsWith("sb_secret_")`; tightened to real keys only).
- **AC-4:** production deployments for `workoutlab-web` and `workoutlab-landing` both from `b81ff98` (= `main` head), status `deploy/success`.
- **AC-5:** `https://app.workout.vestgote.com/` 200, `/auth/callback` 200, `https://workout.vestgote.com/` 200, all `ssl_verify_result=0`; landing `a[data-cta="primary"]` href = `https://app.workout.vestgote.com/`; app bundle references the prod Supabase origin and no localhost.
- Headers served: only `x-content-type-options: nosniff`, `referrer-policy` (no HSTS/CSP/frame-ancestors) → T-0510/T-0511.
- **AC-6 (human sign-in on prod, email + Google)**: pending.
- `PROD_DEPLOY_ENABLED` not set: CI-driven prod deploys stay off until runners work (then set it, T-0402a live ACs).
