---
id: D-0190
title: "Groom the post-go-live security follow-ups (T-0505..T-0515): exact header set and one CSP source for web + landing; accept the Edge Function rate-limit risk on Free; prod CORS = app host only (previews get no Edge Functions); drop localhost from the prod auth allow-list; eu-west-1 is the prod region; T-0514 splits, T-0506 closes here, T-0238 folds into T-0513"
status: revisit
date: 2026-10-06
by: product-owner (groom)
area: product
amends: D-0011, D-0017, D-0184 §5, D-0186
---
## Context
The app went live on 2026-10-05 (D-0189, manual deploys from the human's terminal because
GitHub Actions runners are unavailable). The go-live review (`docs/security/go-live-review.md`,
F-1..F-7) and the privacy review (`docs/security/privacy.md`, P1-a, P1-b, P4-a) left eleven
one-line follow-ups. Checked against `main` at `fa4171e`:

- The live sites send only Cloudflare's defaults (`nosniff`, `strict-origin-when-cross-origin`).
  The web CSP is a `<meta>` built in `apps/web/vite.config.ts` (`buildMetaPlugin`), so it can't
  carry `frame-ancestors`. Neither app has a `public/` dir or a `_headers` file.
- `apps/web/src` calls only its own origin and the Supabase origin. Google OAuth is a top-level
  navigation (`AccountScreen.tsx` → `signInWithOAuth`); the export is a `blob:` `<a download>`
  (`lib/account/download.ts`); neither is governed by `connect-src`. UF-09 uses
  `navigator.wakeLock` and `AudioContext` (`features/UF-09/device.ts`), and 16 places use React
  `style` props, so `style-src 'unsafe-inline'` is still needed.
- The landing is zero-JS static HTML: one same-origin stylesheet, an SVG favicon, no inline
  `<style>` and no `style=` attributes in `dist/`.
- `supabase/functions/_shared/cors.ts` matches origins exactly. Its default list (used when
  `ALLOWED_ORIGINS` is unset, as in prod today) is two localhost origins plus the app host. A
  `*.workoutlab-web.pages.dev` preview is **not** on it, so a preview's Edge Function calls
  already fail CORS today.
- On Free, an Edge Function invocation is counted before any code in the function runs.

## Decision
1. **Region (closes T-0506, P1-a).** Prod data lives in Supabase **`eu-west-1` (Ireland)**, which
   is an EU region. NFR-PRIV-1 now says "an EU region; prod is `eu-west-1`" and no longer names
   `eu-north-1`/`eu-central-1` as the default. The product owner made that edit in
   `docs/specs/non-functional.md` during this groom. The guard is a static test that the region
   in `infra/terraform/supabase-prod/main.tf` matches `eu-*` (T-0507). T-0506 is done with this
   decision, and its test half is T-0507.
2. **Security headers (T-0510 web, T-0511 landing; F-1, F-5).**
   - Both sites send, on `/*`:
     - `Strict-Transport-Security: max-age=31536000`, without `includeSubDomains` or `preload`
       (the zone is the human's personal `vestgote.com`);
     - `X-Frame-Options: DENY`;
     - `X-Content-Type-Options: nosniff`;
     - `Referrer-Policy: strict-origin-when-cross-origin`;
     - `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), screen-wake-lock=(self)`.
       Wake lock stays allowed for UF-09 (T-0304g), and `autoplay` isn't listed (its default
       is `self`).
   - **Web CSP header:**
     `default-src 'self'; connect-src 'self' <supabase origin>; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`.
     - One function builds it, and the build writes it into `dist/_headers`, because the
       Supabase origin is only known at build time.
     - The `<meta>` CSP stays, built from the same function **minus `frame-ancestors`** (a meta
       can't carry it). That keeps `vite preview`, the e2e suite and a cached offline shell
       covered by the same policy.
     - Removing `'unsafe-inline'` from styles is out (16 `style` props).
   - **Previews:** `connect-src` takes `VITE_SUPABASE_URL`'s origin, which is prod for previews
     too, and `'self'` covers the preview host. Previews need nothing extra.
   - **Landing CSP header (static file):**
     `default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'`.
3. **Edge Function rate limit (T-0513, F-3; folds in T-0238): accept the risk on Free, build no
   limiter.**
   - A limiter inside a function runs after the invocation has been counted, so it can't protect
     the Free invocation quota, which is the resource an abuser would burn.
   - A real per-user limit needs one of two things, and the cost of either outweighs the benefit
     at 1–10 users:
     - an external store (Redis/Upstash). That's a new processor, a new DPA, and a change to the
       privacy notice.
     - a Postgres counter table. That's a migration, a `docs/data-model.md` contract change and
       an extra write on every call, and it still protects only database work. Per-user RLS
       already bounds that work to the caller's own rows.
   - Every route needs a valid user JWT, so abuse needs a signed-up account. On Free, a breached
     quota restricts the project and doesn't send a bill.
   - Mitigation: T-0513 adds Edge Function invocations to the cost guard's quota list (manual
     source if no read-only API exposes it), and the runbook gets one line: ban the abusing user
     in the dashboard.
   - T-0238's second half also lands in T-0513: a static test that the prod release deploys
     functions with `config.toml`'s `verify_jwt` (no override flag), plus one read-only check of
     the live per-function `verify_jwt`.
4. **CORS and the auth allow-list (T-0515, F-6).**
   - **Prod CORS:** set the prod function secret `ALLOWED_ORIGINS=https://app.workout.vestgote.com`.
     The code default in `cors.ts` doesn't change, because local dev and the tests rely on it.
   - **Previews:** they stay off the CORS list. They keep sign-in and plain supabase-js CRUD (the
     D-0184 §5 preview path), but their Edge Function calls (suggest, balance, finish, account
     delete) fail CORS. That's what already happens today, and previews are off anyway (H-18
     open). Wildcard support in `cors.ts` is out of scope until previews are turned on.
   - **Auth allow-list:** drop `http://localhost:3000/**` and `http://localhost:5173/**` from
     the prod `uri_allow_list`, since local dev uses local Supabase (`supabase/config.toml`).
     The app host and the preview wildcard stay.
   - Both prod changes are human-run:
     - `supabase secrets set`;
     - `infra/scripts/auth-patch.mjs --set … --apply`, with `infra/auth/expected-auth.json`
       updated in the same change (D-0185 §4).
   - Both are verified read-only (an OPTIONS probe and the auth drift check).
5. **Splits, folds, lanes, order.**
   - **T-0514 splits:**
     - **T-0514a** (web-shell): the build refuses a secret key;
     - **T-0514b** (infra): the manual-deploy runbook, `infra/scripts/deploy-prod.sh` folded in
       from the human's go-live script, and a tested Node bundle scan that replaces its Python
       one.
   - **Lane moves:** T-0513 and T-0515 move from `backend` to `infra`, because they change no
     file under `supabase/`.
   - **Order:** T-0512 after T-0511 (same app). T-0514a after T-0510 (`vite.config.ts`,
     `build.test.ts`). T-0509 after T-0508 (lint fixes may touch `auth-patch.mjs`). T-0514b
     after T-0508 (`infra/deploy/README.md`). T-0515 after T-0509 (it uses `--apply`) and
     T-0514b (README, `expected-auth.json` test fixtures).
   - **Parallel:** T-0510, T-0511, T-0505, T-0507, T-0508 and T-0513 can run in parallel (no
     shared file).
6. **rls-coverage's dynamic `.from(ident)` form (T-0402c log asked for a record).** It is
   accepted. `.github/scripts/rls-coverage.test.mjs` resolves `.from(x)` only when `x` is typed
   `(typeof C)[number]` and `C` is an `as const` string-literal array in the same file
   (`EXPORT_TABLES`). Any other dynamic form fails as unresolved. T-0508 writes the one-paragraph
   note in `infra/deploy/README.md`.
7. **Prod writes stay human-run (D-0186), and agents verify read-only.**
   - **H-24:** redeploy both sites from `main` once T-0510 and T-0511 have merged (later merges
     ride the next redeploy). Then run one magic-link sign-in and one Google sign-in on prod, so
     the headers are shown not to break auth.
   - **H-25:** the two T-0515 prod changes.
   - The header check after a deploy is a read-only `curl -sI` by an agent.

## Consequences
- `docs/specs/non-functional.md` NFR-PRIV-1 is reworded (product lane, this groom).
- The ticket files T-0505, T-0507..T-0513, T-0514a, T-0514b and T-0515 are written. The T-0506
  and T-0238 rows close (done and folded), and T-0514 is replaced by T-0514a/b on the board.
- Until previews are turned on, `infra/deploy/README.md` says preview builds can't call Edge
  Functions.
- No contract changes. No migration.

## Revisit when
- Previews are turned on (H-18): decide on preview CORS (single-label wildcard in `cors.ts`, or
  a staging project).
- The plan moves to Pro, users pass ~50, or the invocation metric passes 50 % of quota: rebuild
  the §3 rate-limit case.
- Styles can drop `'unsafe-inline'` (no `style` props left).
- A third-party origin is added to the app (font, analytics, error reporting): the CSP and the
  privacy notice both change.
