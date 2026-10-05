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

There is no staging. Branch previews point at the **prod Supabase project**. A signed-in tester on
a preview would read and write real prod data, with only RLS limiting them to their own rows.
Two things keep this shut until it is proven safe: previews start signed-out by construction, and
prod's redirect allow-list does not contain the preview pattern, so Supabase sends any sign-in
from a preview back to `site_url`. Adding that pattern is T-0402c, after RLS is proven on prod
(D-0184 §6, D-0186 §1). Until T-0402b pushes the schema, a preview loads but cannot read a plan.
