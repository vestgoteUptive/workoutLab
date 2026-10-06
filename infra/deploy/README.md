# Deploy pipeline (T-0402a)

`.github/workflows/deploy.yml` is the only thing that deploys the two Cloudflare Pages projects
(`workoutlab-web`, `workoutlab-landing`). Agents never run wrangler against the real account.

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
both sides. To close the door again, run `auth-patch.mjs --set uri_allow_list=<the list without it>`
(reviewed, keys-only) and update `infra/auth/expected-auth.json` in the same change.

**rls-coverage and dynamic `.from(x)`:** the rls-coverage check resolves `.from(x)` only when `x`
is typed `(typeof C)[number]` and `C` is an `as const` string-literal array in the same file
(today: `EXPORT_TABLES` in `apps/web/src/lib/account/export.ts`). Any other dynamic form fails as
unresolved, on purpose (D-0190 §6).
