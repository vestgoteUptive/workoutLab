# Deploy pipeline (T-0402a)

`.github/workflows/deploy.yml` is the only thing that deploys the two Cloudflare Pages projects
(`workoutlab-web`, `workoutlab-landing`). Agents never run wrangler against the real account; the human runs the manual deploy (below) while
runners are down.

## Secret and variables (H-18)

| Name                      | Kind     | Where it comes from                                                      |
| ------------------------- | -------- | ------------------------------------------------------------------------ |
| `CLOUDFLARE_PAGES_TOKEN`  | secret   | Cloudflare API token with **Account: Cloudflare Pages: Edit** only (not the H-03 token, which can edit DNS) |
| `CLOUDFLARE_ACCOUNT_ID`   | variable | Cloudflare account id                                                    |
| `VITE_SUPABASE_URL`       | variable | prod Supabase API URL                                                    |
| `VITE_SUPABASE_ANON_KEY`  | variable | prod anon/publishable key (public by design, see `apps/web/.env.example`) |
| `PREVIEWS_ENABLED`        | variable | `true` to turn branch previews on                                        |
| `PROD_DEPLOY_ENABLED`     | variable | **never set it here**; see below                                         |

## Previews on and off

Every push to a non-`main` branch runs the `preview` job only when `PREVIEWS_ENABLED` is `true`.
Unset it (or set anything else) and the job is skipped, not failed. The web and landing alias
URLs are read from wrangler's output and written to the run's step summary. The landing build
gets the web alias as `PUBLIC_APP_URL`, so its CTA opens the same branch's app.

## Production

The `production` job follows a green `CI` run on `main` and also needs `PROD_DEPLOY_ENABLED ==
'true'`. That variable is flipped only at gate H-06 (T-0402d), together with the first prod deploy.

## Preview risk (D-0184 §5)

There is no staging. Branch previews point at the **prod Supabase project**, and sign-in works on
them: prod's redirect allow-list holds `https://*.workoutlab-web.pages.dev/**` (T-0402c, applied by
the human-run `infra/scripts/auth-patch.mjs`, D-0185 §4). Supabase's `*` matches one host label,
so it covers both `<hash>.workoutlab-web.pages.dev` and `<branch-alias>.workoutlab-web.pages.dev`.
The landing host is not on the list (D-0186 §1).

**The risk:** a tester signed in on a preview reads and writes **real prod data**. Only row-level
security keeps them inside their own rows, and a preview runs branch code that has not been
reviewed against prod. T-0402c proved RLS before the door opened (D-0184 §6):

- `supabase/tests/database/015_rls_every_table.test.sql`: every `public` table has RLS, owned
  tables have owner-scoped policies for all four commands, library tables are read-only, views are
  `security_invoker`, and `analytics`/`private` are closed to `anon` and `authenticated`.
- `.github/scripts/rls-coverage.test.mjs`: every table, view and function the web app reaches is
  covered by those tests or by `002_rls_owner.test.sql`'s two-user isolation asserts.
- `infra/scripts/rls-fingerprint.sh`: prod's policies, grants and RLS flags hash the same as local.

Before a migration that adds a table or changes a policy reaches prod, re-run the fingerprint on
both sides. Previews cannot call Edge Functions: prod's `ALLOWED_ORIGINS` is the app host only
(CORS, D-0190 §4); sign-in and plain CRUD still work. The two localhost entries are gone from the
allow-list (T-0515); `infra/scripts/prod-origins.sh` plans and applies that change (H-25). To close the door again, run `auth-patch.mjs --set uri_allow_list=<the list without it>`
(reviewed, keys-only) and update `infra/auth/expected-auth.json` in the same change.

**rls-coverage and dynamic `.from(x)`:** the rls-coverage check resolves `.from(x)` only when `x`
is typed `(typeof C)[number]` and `C` is an `as const` string-literal array in the same file
(today: `EXPORT_TABLES` in `apps/web/src/lib/account/export.ts`). Any other dynamic form fails as
unresolved, on purpose (D-0190 §6).

## Manual production deploy (runners down, D-0189)

While GitHub Actions runners are unavailable the human deploys production by hand with
`infra/scripts/deploy-prod.sh` (T-0514b). Agents never run it with `deploy`.

**Prerequisites.** The repo-root `.env.local` (or your shell) holds `CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID` and `PROD_SUPABASE_PUBLISHABLE_KEY` (the public `sb_publishable_...` key;
it stays in `.env.local`, never in the repo). The script stops before building if the key is unset
or is not an `sb_publishable_` key. You must be on a clean `main` equal to `origin/main`.

**Steps.**

1. `bash infra/scripts/deploy-prod.sh` checks git, builds design-tokens, web and landing, and scans
   the output. It uploads nothing.
2. Read the output, then `bash infra/scripts/deploy-prod.sh deploy` repeats the above and uploads
   both sites with `wrangler@4.147.0 pages deploy ... --branch main`.

**What the scan checks** (`infra/scripts/bundle-secret-scan.mjs` over `apps/web/dist` and
`apps/landing/dist`; it prints the kind and file, never the match). It fails on an `sb_secret_` key
body, a JWT whose role is `service_role`, a `*.supabase.co` origin other than the prod project's,
and any `.mjs` file. It ignores supabase-js's bare `"sb_secret_"` prefix string. The web build
itself also refuses a secret key (T-0514a); the scan is the second layer.

**Landing build (F-7).** The landing is always built in-root, to `apps/landing/dist`. An
out-of-root astro build leaks `manifest_*.mjs` and the scan rejects it.

**After the upload** the script prints the response headers of `app.workout.vestgote.com` and
`workout.vestgote.com` (`curl -sI`, read-only) and then `DEPLOY_COMPLETE`. Check the security
headers (CSP, HSTS, `X-Content-Type-Options`) are present.

**Rollback.** Cloudflare dashboard, Pages project, Deployments, "Rollback to this deployment" on the
last good one. Do it for both projects if both changed.

**When runners return,** `.github/workflows/deploy.yml` is the deploy path again: set
`PROD_DEPLOY_ENABLED=true` and prod deploys go back to CI.
