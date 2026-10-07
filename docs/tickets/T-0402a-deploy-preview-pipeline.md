---
id: T-0402a
title: "Deploy pipeline: .github/workflows/deploy.yml uploads apps/web and apps/landing with wrangler to their Pages projects; branch previews behind PREVIEWS_ENABLED, the main→prod job wired but switched off until H-06 (D-0184 §5, D-0186 §1)"
lane: infra
screens: []
decisions: [D-0006, D-0010, D-0012, D-0184, D-0185, D-0186]
deps: [T-0401]
status: ready
groomed: 2026-10-05
---
<!-- Groomed 2026-10-05 by product-owner against main c378ddf (D-0186 §1: T-0402 split into
a/b/c/d). Build flow: wl-build-infra. About ½ day. The static part is buildable now. The live
AC needs H-18 (a CI-only Cloudflare token and the repo variables). Build the static part first,
and if H-18 isn't done, hand back `blocked` naming H-18 with the static ACs green. -->

## Why
T-0401 created the empty Pages projects `workoutlab-web` and `workoutlab-landing`. Nothing puts a
build in them yet. D-0006 says CI deploys, and D-0184 §5 (a human decision) says there is no
staging: **branch previews point at the prod Supabase project.**

That's a named risk. A signed-in tester on a preview build reads and writes **real prod data**,
and only RLS limits them to their own rows. Two things in this ticket keep the risk shut until it
is proven safe:
- Previews start signed-out by construction. Prod's redirect allow-list doesn't contain the
  preview pattern, so Supabase sends any sign-in from a preview back to `site_url`, never to the
  preview.
- Adding that pattern is T-0402c's job, and it happens only after RLS is proven on prod (D-0184
  §6, D-0186 §1).

The production job for `main` exists but is switched off. The first prod deploy is gate 3
(H-06, T-0402d).

## Scope
- **In:**
  - A new `.github/workflows/deploy.yml`:
    - **Top level:** `permissions: contents: read`. `concurrency: deploy-${{ github.ref }}`
      with `cancel-in-progress: true`.
    - **Job `preview`:**
      - Trigger: `on: push` with `branches-ignore: [main]`.
      - `if: vars.PREVIEWS_ENABLED == 'true' && github.ref != 'refs/heads/main'`.
      - Steps: checkout, pnpm, `pnpm install --frozen-lockfile`.
      - Build web with `pnpm --filter @workoutlab/web build`, env `VITE_SUPABASE_URL: ${{
        vars.VITE_SUPABASE_URL }}` and `VITE_SUPABASE_ANON_KEY: ${{ vars.VITE_SUPABASE_ANON_KEY
        }}`.
      - Deploy web with wrangler pinned to an exact version (e.g. `npx -y wrangler@<x.y.z>
        pages deploy apps/web/dist --project-name workoutlab-web --branch "${{ github.ref_name
        }}"`, or `cloudflare/wrangler-action` with `wranglerVersion` pinned).
      - Read the deployment's **alias URL** from the deploy output. Don't compute it: Pages
        lower-cases the branch name, replaces `/` and other characters, and truncates it.
      - Build landing (`pnpm --filter @workoutlab/landing build`) with `PUBLIC_APP_URL` set to
        that web alias URL, so the preview CTA opens the same branch's app (T-0309 AC10), then
        deploy it to `workoutlab-landing` with the same `--branch`.
      - Write both URLs to `$GITHUB_STEP_SUMMARY`.
    - **Job `production`:**
      - Trigger: `on: workflow_run` of workflow `CI`, `types: [completed]`, `branches: [main]`.
      - `if: github.event.workflow_run.conclusion == 'success' && vars.PROD_DEPLOY_ENABLED ==
        'true'`.
      - Check out `github.event.workflow_run.head_sha`. Build both apps with the same variables
        (landing with `PUBLIC_APP_URL` **unset**, which defaults to the prod app, T-0309), then
        deploy with `--branch main`.
      - `PROD_DEPLOY_ENABLED` stays unset until T-0402d (H-06). This ticket never sets it.
    - **Secrets:** `CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_PAGES_TOKEN }}` and
      `CLOUDFLARE_ACCOUNT_ID: ${{ vars.CLOUDFLARE_ACCOUNT_ID }}`, set as env on the deploy step
      only.
  - `.github/workflows/ci.yml`: delete the placeholder `deploy` job (its comment says T-0402
    replaces it). Change nothing else in `ci.yml`.
  - `.github/scripts/check-deploy-workflow.mjs` + `.test.mjs`. This is a static checker for the
    ACs below. It may read YAML through the `yaml` package if the builder adds it to the root
    `devDependencies` at an exact version, or through a small structural parse. It runs from
    `test:repo-checks` like the other infra checks, and isn't added to `check-all.mjs`, which
    every lane shares.
  - `infra/deploy/README.md` explains:
    - the variables and the secret, and where each comes from (H-18);
    - how to turn previews on and off (`PREVIEWS_ENABLED`);
    - that `PROD_DEPLOY_ENABLED` is flipped only at H-06 (T-0402d);
    - the preview risk paragraph from **Why**.
- **Out:**
  - Adding the preview redirect pattern to prod auth: that's T-0402c, after the RLS proof.
  - Pushing the prod schema, seed or functions: T-0402b. Until then a preview loads but can't
    read a plan. That's expected and recorded, not fixed here.
  - Setting `PROD_DEPLOY_ENABLED`, the first prod deploy, and the `site_url` switch: T-0402d
    (H-06).
  - Lighthouse CI on UF-02.1 and the landing `test:browser` CI job: follow-ups (D-0186).
  - Pages env vars or Functions settings in Terraform, and any Terraform change at all.
  - Running wrangler from an agent shell against the real account. Only CI deploys (the
    permission mode blocks prod writes for agents anyway).

### Edge cases that are in scope
- **A branch named `main` in a preview context.** It can't happen through `branches-ignore`, but
  the job's `if` also checks the ref, and the static check asserts that the preview step's
  `--branch` is never the literal `main`.
- **Variables unset** (before H-18, or previews switched off). The `preview` job is **skipped**,
  not failed, so every in-flight ticket branch stays green.
- **A long or slashed branch name** (`t/T-0402a-deploy-preview-pipeline`). The alias comes from
  the wrangler output (see Scope). The landing build uses it as is. `appUrl()` accepts any
  `https:` URL.
- **SPA deep links.** Pages serves `index.html` for unknown paths only when there is no top-level
  `404.html`. `/auth/callback` must load the app (AC-6).
- **CI is red on `main`.** The production job doesn't run, because the conclusion isn't
  `success`.
- **The same branch pushed twice quickly.** Concurrency cancels the older preview run.

## Acceptance criteria
`[static]` checks run in `-w test:repo-checks`. Node:test titles start with `T-0402a AC-n`.

- **AC-1 [static] Preview job shape.**
  - **Given** `deploy.yml`, **then** the job `preview` runs only on `push`, has a
    `branches-ignore` containing `main`, and its `if` contains both `vars.PREVIEWS_ENABLED ==
    'true'` and a `refs/heads/main` exclusion.
  - **And** every `pages deploy` command in it carries `--branch` with a value other than the
    literal `main`.
  - **And** it names the project `workoutlab-web` for `apps/web/dist` and `workoutlab-landing`
    for the landing `dist`.
  - Planted fault, recorded: a copy with `--branch main` in `preview` goes red.
- **AC-2 [static] The prod job is switched off and only follows green CI.**
  - **Given** `deploy.yml`, **then** the job `production` is triggered only by `workflow_run`
    of `CI` on `main`.
  - **And** its `if` requires both `conclusion == 'success'` and `vars.PROD_DEPLOY_ENABLED ==
    'true'`.
  - Planted fault, recorded: a copy whose `if` drops the `PROD_DEPLOY_ENABLED` clause goes red.
- **AC-3 [static] Secrets and prod guards.**
  - **Given** `deploy.yml`, **then** the only `secrets.*` reference is
    `secrets.CLOUDFLARE_PAGES_TOKEN`.
  - **And** the Supabase values come from `vars.VITE_SUPABASE_URL` /
    `vars.VITE_SUPABASE_ANON_KEY`.
  - **And** the file names neither the prod project ref nor `service_role`, and runs no
    `supabase link`, `db push` or `functions deploy` (the same patterns as
    `supabase/tests/scripts/prod-guard.test.mjs`, extended to this file).
  - **And** wrangler has an exact pinned version (no `latest`, no range).
  - **And** `permissions` is `contents: read`.
- **AC-4 [static] The placeholder is gone.** **Given** `ci.yml`, **then** it has no job named
  `deploy`, and the jobs `checks`, `supabase` and `e2e` are still present, with CI's workflow
  `name: CI` unchanged (the `workflow_run` trigger depends on it).
  - The log records `git diff main -- .github/workflows/ci.yml` showing deletions only. That's
    a log entry, not a committed test, since the state.md trap bans `git diff main` assertions
    in tests.
- **AC-5 [live, needs H-18] A preview deploys from a pushed branch.**
  - **Given** H-18 done (`gh secret list` shows `CLOUDFLARE_PAGES_TOKEN`, and `gh variable
    list` shows the four variables, names only), **when** the orchestrator pushes this ticket's
    branch, **then** the `deploy` workflow's `preview` job succeeds.
  - **And** the step summary lists two alias URLs under `*.workoutlab-web.pages.dev` and
    `*.workoutlab-landing.pages.dev`.
  - **And** `GET /accounts/<id>/pages/projects/workoutlab-web/deployments` (read-only) shows the
    newest deployment with `environment: preview`.
  - **And** there is **no** deployment with `environment: production` in either project.
  - The run URL and the filtered GET output go in the log.
- **AC-6 [live] The preview serves the app, the landing CTA points at it, and sign-in stays
  closed.**
  - `curl -sS -o /dev/null -w '%{http_code}'` on the web alias URL `/` and `/auth/callback`
    both give `200`, and the body of `/auth/callback` contains the app's root element id.
  - The landing alias's `a[data-cta="primary"]` `href` equals the web alias URL plus `/`.
  - **And**, if T-0500 is on `main` by then, its drift check exits 0, so the allow-list still
    holds only the three D-0011 entries. If it isn't, say so in the log. Never GET the raw
    auth config by hand.
- **AC-7 [live] Nothing reached prod.**
  - **Given** `GET .../pages/projects/<name>/deployments?env=production` (read-only) for both
    projects, **then** each returns zero deployments.
  - **And** `curl https://app.workout.vestgote.com/` still answers as before T-0402a. The code
    (522 or 404) is recorded, not asserted.

## Paths you may change
- `.github/workflows/deploy.yml` (new), `.github/workflows/ci.yml` (delete the `deploy` job only).
- `.github/scripts/check-deploy-workflow.mjs`, `.github/scripts/check-deploy-workflow.test.mjs`,
  `.github/scripts/fixtures/deploy-workflow/**` (new).
- `infra/deploy/README.md` (new).
- `package.json`, `pnpm-lock.yaml`: only to add `yaml` as an exact-version root devDependency, if
  used.
- **Listed extras:**
  - `docs/tickets/T-0402a-deploy-preview-pipeline.md`, for the build and accept logs.

## Contract impact
None. No recurring cost: Cloudflare Free allows 500 builds a month (`docs/infra-costs.md`).
GitHub Actions minutes rise slightly, by about 2–3 minutes per pushed branch. Note that in the
log. It stays within the free private-repo minutes, so `docs/infra-costs.md` doesn't change.

## Definition of done
- Every `[static]` AC has a passing node:test, and both planted faults are recorded. Every
  `[live]` AC has its output in the log. If H-18 isn't done, hand back `blocked` naming H-18,
  with the static ACs green and the live ACs listed as pending.
- `node --test .github/scripts/check-deploy-workflow.test.mjs` passes while you work. Before
  handing back, `npx -y pnpm@10.28.2 -w test:repo-checks`, `-w format:check` and
  `node .github/scripts/check-all.mjs` pass. If `package.json` changes, run
  `npx -y pnpm@10.28.2 install --frozen-lockfile` cleanly as well.
- Nothing under `apps/` or `packages/` changes, so the `-w typecheck lint test` gate and e2e
  aren't needed (D-0178).
- Contracts are unchanged. Commits start `T-0402a`.

## Notes
- **H-18 (raise before the live ACs):**
  - Create a Cloudflare API token with **Account: Cloudflare Pages: Edit** only, not the H-03
    token, which also has DNS edit. Add it as the GitHub Actions secret `CLOUDFLARE_PAGES_TOKEN`.
  - Add the repo variables `CLOUDFLARE_ACCOUNT_ID`, `VITE_SUPABASE_URL` (the prod API URL) and
    `VITE_SUPABASE_ANON_KEY` (the prod anon/publishable key, public by design, see
    `apps/web/.env.example`).
  - Set `PREVIEWS_ENABLED=true`.
  - Never set `PROD_DEPLOY_ENABLED`.
- **The agent never pushes.** The orchestrator pushes the branch for AC-5. A preview deploy is
  not a prod deploy (gate 3), and it can't sign anyone in until T-0402c.
- **Parallel:** the only file shared with the rest of the batch is `ci.yml`, and only this
  ticket touches it.
- **Unblocks:** T-0402c (needs previews to exist) and T-0402d.

## Build / accept log
Archived in `docs/tickets/log/T-0402a.md` (D-0157).
