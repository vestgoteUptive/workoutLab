# Go-live security review (T-0403 release check)

- **Date:** 2026-10-05
- **Commit reviewed:** `main` at `330373934d2bcae7c956c738550647de6a3d5efa` (working tree clean)
- **Reviewer:** security-reviewer (read-only; no writes to any real account, no deploys)
- **Scope:** first manual production deploy (`wrangler pages deploy` from the human's terminal) of
  `apps/web` → `app.workout.vestgote.com` and `apps/landing` → `workout.vestgote.com`. The
  Supabase side (RLS, functions, auth triggers, SMTP, allow-list) is already live and was
  verified in earlier tickets; this review checks what the deploy adds and re-checks the parts
  the brief names.

## Verdict: GO, with conditions

No finding is high or critical in this deployment context. Ship it, and file the medium items
below as follow-ups. Before you flip H-06, the human needs to clear these
(they're not code findings):

1. **H-21:** accept the DPAs/SCCs for Supabase and Resend, and note Cloudflare's. The privacy
   notice relies on them (`.squad/needs-human.md:25`).
2. **H-23, last open item:** one real Google sign-in against prod after the claim-strip triggers
   (`.squad/needs-human.md:27`).
3. **`site_url` switch** to `https://app.workout.vestgote.com`. `infra/auth/expected-auth.json`
   already expects this value, so after the patch the auth drift check must come back green.
4. **Post-deploy header check** (F-1): run `curl -sI https://app.workout.vestgote.com/` and
   `curl -sI https://workout.vestgote.com/` and record the output in the T-0403/T-0402d log.
   During this review both hosts and both `*.pages.dev` hosts returned Cloudflare 522 (nothing
   deployed yet), so I couldn't observe the live headers.
5. **Build hygiene for the manual deploy** (F-4): build with only the two `VITE_` variables
   set, build into the default `dist/` (see F-7), and run the bundle scan below before
   `wrangler pages deploy`.

## Findings, ranked by severity

| ID | Severity | Title | Blocks go-live? | Follow-up lane |
|----|----------|-------|-----------------|----------------|
| F-1 | medium | No HTTP security headers on either Pages site (no `_headers`): no HSTS, no `frame-ancestors`/`X-Frame-Options`, no `Permissions-Policy` | no | web-shell (+ landing) |
| F-2 | medium | Landing build-time dependency `astro@5.18.2` has 1 critical, 3 high and 5 moderate advisories (plus `sharp`, `http-cache-semantics`) | no (static output, none of the vulnerable features used) | landing |
| F-3 | low | Edge Functions have no per-user rate limit | no | backend |
| F-4 | low | The build doesn't refuse a secret key in `VITE_SUPABASE_ANON_KEY`; there's no manual-deploy runbook | no | web-shell / infra |
| F-5 | low | CSP gaps: delivered by `<meta>` after the entry script; no `base-uri`/`form-action`; `style-src 'unsafe-inline'` | no | web-shell |
| F-6 | low | The prod CORS default and auth allow-list include `http://localhost:*`; the allow-list has the `*.workoutlab-web.pages.dev` preview wildcard while previews use prod Supabase | no | backend / infra |
| F-7 | info | `astro build --outDir <outside repo>` leaves server-build `.mjs` files (with absolute local paths) in the output | no (default `dist/` is tested clean) | landing (doc only) |

### F-1 (medium): No HTTP security headers on the Pages sites
- **Evidence:** neither `apps/web/public/_headers` nor `apps/landing/public/_headers` exists
  (`git ls-files | grep _headers` is empty, and there's no `public/` dir in either app). The
  Cloudflare Terraform deliberately leaves zone settings alone, HSTS included
  (`docs/tickets/T-0401-terraform-cloudflare-pages-domains.md:74-76`, gate 4).
- **What the deployed sites will send:**
  - **CSP (web):** only as a `<meta http-equiv>` tag, injected at build time
    (`apps/web/vite.config.ts:23-37`, policy string at `:28`). The built value was
    `default-src 'self'; connect-src 'self' https://csgjsdwuxqtuqpuazzpz.supabase.co; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'`.
  - **`connect-src`:** limited to `'self'` plus the prod Supabase origin. It's built from
    `VITE_SUPABASE_URL` (`vite.config.ts:51`) and pinned by `apps/web/build.test.ts:260-269`.
    There's no wildcard and no `wss:` (realtime isn't used).
  - **CSP (landing):** none. The landing is zero-JS static HTML (`apps/landing/astro.config.mjs`,
    AC11 test), so the risk is small.
  - **HSTS:** none. Pages doesn't add it, and the zone setting is out of scope. The
    `Strict-Transport-Security` header wasn't on the 522 responses either, which suggests zone
    HSTS is off.
  - **`frame-ancestors` / `X-Frame-Options`:** none. A `<meta>` CSP can't carry
    `frame-ancestors` (browsers ignore it there), so the app can be framed. Clickjacking risk
    is limited: auth uses bearer tokens in localStorage (no ambient cookies), and account
    deletion needs an extra confirm-input step (`apps/web/src/features/UF-11/AccountSettingsBody.tsx:80-121`).
  - **`X-Content-Type-Options` / `Referrer-Policy`:** these come from Cloudflare Pages' defaults
    (`nosniff`, `strict-origin-when-cross-origin`). Confirm them with the post-deploy curl
    (condition 4).
  - **`Permissions-Policy`:** none.
- **Why it's not a blocker:** script injection and exfiltration are already constrained by the
  CSP (`script-src 'self'`, no `unsafe-eval`, D-0117). Pages serves HTTPS only on custom
  domains, and every link we publish is `https://`.
- **Fix:** add `apps/web/public/_headers` and `apps/landing/public/_headers` with
  `/*` → `Strict-Transport-Security: max-age=31536000` (start without `includeSubDomains`,
  since the zone is the human's personal `vestgote.com`), `Content-Security-Policy` as a real
  header (the same policy plus `frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`),
  `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, and
  `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`. Add a build test
  that reads `dist/_headers`. The CSP header needs the Supabase origin, so generate it at build
  time like the meta tag, not as a static file.

### F-2 (medium): Landing build-time dependency advisories
- **Evidence:** `pnpm audit --prod` found 14 advisories, all on the `apps__landing>astro`
  path. The installed version is `astro@5.18.2` (`apps/landing/package.json:16` `^5.1.1`).
  - **critical:** GHSA-26w7-cxv4-gfx2 (AVIF image-optimisation RCE).
  - **high:** GHSA-2pvr-wf23-7pc7 (SSR error-page SSRF), GHSA-8hv8-536x-4wqp (slot-name XSS),
    GHSA-f88m-g3jw-g9cj and GHSA-rgj7-g3m4-5g8c (`sharp`/libvips/libheif), and
    GHSA-ch52-4w7c-c8xp (`http-cache-semantics`).
  - **Web app:** `apps/web` has no advisories in its prod dependency tree.
- **Context that lowers the severity:**
  - Output is `static` with no adapter.
  - No `astro:assets`, `<Image>`, `define:vars`, `server:defer` or `transition:` use appears
    in `apps/landing/src`.
  - There are no AVIF/HEIC sources.
  - Nothing in the build takes untrusted input.
  - The deployed artefact is plain HTML/CSS, so none of these advisories can be reached at
    runtime.
- **Fix:** bump to a patched Astro (≥ 7.2.8 covers all of them, but it's a major bump; check
  for a patched 5.x line first) and re-run the landing tests.

### F-3 (low): No rate limit on Edge Functions
- **Evidence:** there's no throttling code in `supabase/functions/**` (`grep -i rate.?limit` finds
  nothing). Every route needs a valid user JWT (`supabase/functions/_shared/auth.ts:52-69`), so
  any abuse comes from a signed-up account. Auth endpoints do have limits
  (`infra/auth/expected-auth.json` `rate_limit_email_sent: 10`, plus Supabase's per-IP defaults).
- **Risk:** a cost/quota DoS on the Free plan by an authenticated user. There's no
  confidentiality impact.
- **Fix:** a per-user token bucket (for example a small table or Postgres advisory counter), or
  accept the risk explicitly in a decision until Pro.

### F-4 (low): No guard against a secret key in the client build; no manual-deploy runbook
- **Evidence:** `apps/web/vite.config.ts:40-50` only checks that the two variables are
  non-empty. Nothing rejects a `sb_secret_…` value or a JWT with `role: service_role` in
  `VITE_SUPABASE_ANON_KEY`. `infra/deploy/README.md` documents only the CI path ("Agents never
  run wrangler", `:4`). There are no manual steps for this first deploy.
- **What protects us today:** Vite exposes only `VITE_`-prefixed variables. The repo-root
  `.env.local` (`SUPABASE_ACCESS_TOKEN`, `PROD_DB_URL`, `CLOUDFLARE_API_TOKEN`,
  `GOOGLE_OAUTH_CLIENT_SECRET`, `RESEND_API_KEY`, …) has none, and it isn't in the web
  `envDir` anyway. `apps/web/.env.local` defines only the two `VITE_` names, both empty. A
  wrong key would therefore take a manual copy-paste mistake.
- **Fix:** have the build throw when the key starts with `sb_secret_` or decodes to
  `role=service_role`, and add a short manual-deploy section to `infra/deploy/README.md`
  (build commands, the scan below, then `wrangler pages deploy … --branch main`).

### F-5 (low): CSP delivery and gaps
- **Evidence:** in the built `index.html`, the entry `<script type="module" src="/assets/index-*.js">`
  is on line 7 and the CSP `<meta>` is on line 10. The meta is appended before `</head>`
  (`vite.config.ts:29-35`), so the policy doesn't cover the entry-script fetch itself. That
  fetch is same-origin, so nothing is exposed today. The policy has no `base-uri`, `form-action`
  or `frame-ancestors` (see F-1), and it has `style-src 'unsafe-inline'`.
- **Fix:** covered by F-1 (send the CSP as a header). Remove `'unsafe-inline'` from styles when
  that's practical.

### F-6 (low): Dev origins in prod CORS and the redirect allow-list
- **Evidence:**
  - `supabase/functions/_shared/cors.ts:3-7`: the default CORS list (used when `ALLOWED_ORIGINS`
    is unset) includes `http://localhost:3000` and `http://localhost:5173` next to
    `https://app.workout.vestgote.com`. Only exact matches are reflected (`:23`), with
    `Vary: Origin`, and there's no `Allow-Credentials`.
  - The prod `uri_allow_list` (`infra/auth/expected-auth.json`) has the same two localhost
    entries, the app host, and `https://*.workoutlab-web.pages.dev/**`.
  - Preview builds point at prod Supabase (`.github/workflows/deploy.yml:5-6`).
- **Risk:** a token-bearing request from a localhost page is still bound by the user's JWT and
  RLS. Only someone with deploy rights on the `workoutlab-web` Pages project can create a
  preview host, so the wildcard can't be claimed by a third party. A magic link or OAuth flow
  can't be steered to an attacker-controlled origin.
- **Fix:** set `ALLOWED_ORIGINS=https://app.workout.vestgote.com` as a prod function secret,
  and consider dropping the localhost entries from the prod allow-list once local dev uses its
  own Supabase (it already does: `supabase/config.toml:158-167`).

### F-7 (info): `astro build --outDir` outside the project root leaks server-build files
- **Evidence:** a scratch build with `--outDir` outside the repo left 30 `manifest_*.mjs` files
  in the output, 29 of them containing absolute local paths. The default in-root `dist/` build
  is asserted clean by `apps/landing/test/ac11-zero-js.test.ts:112-120`, and both CI and the
  manual deploy use `apps/landing/dist`.
- **Fix:** only document it in the manual-deploy runbook: build in-root and deploy
  `apps/landing/dist`.

## Checks that passed (with evidence)

### 1. The built app's secrets
- **Env handling:** the only `import.meta.env` reads are `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY` (`apps/web/src/lib/auth/client.ts:24-25`,
  `apps/web/src/lib/account/delete.ts:26`) plus `import.meta.env.PROD`
  (`apps/web/src/lib/pwa/register.ts:21`). `vite.config.ts` has no `define`, `envPrefix` or
  `envDir` overrides, so only `VITE_*` variables can reach the bundle.
- **Prod build scan:** `vite build` ran into a scratch dir with
  `VITE_SUPABASE_URL=https://csgjsdwuxqtuqpuazzpz.supabase.co` and the publishable key from
  `gh variable list`. The output was 61 files and no source maps. The scan found:
  - The only `sb_publishable_…`/`sb_secret_…` key-shaped token is the publishable key, and it
    equals the GitHub variable. The single `sb_secret_` string match is supabase-js's prefix
    check (`r.startsWith("sb_secret_")`), not a key.
  - No `service_role`, `SERVICE_ROLE` or `SECRET_KEY` strings.
  - No JWTs (`eyJ…` three-part tokens) at all.
  - The only Supabase origin is the prod one. `localhost`/`127.0.0.1` hits are library
    constants (supabase-js default URLs, react-router's base, a dev-detection regex), not
    config.
  - None of the nine repo-root `.env.local` values appear in any output file. The
    `apps/web/.env.local` values are empty.
- **Service role in functions:** it's read in exactly one file,
  `supabase/functions/account/admin.ts:15`, and used only for `auth.admin.deleteUser`. That is
  fenced by `supabase/tests/scripts/functions-platform.test.mjs:175-232`. Every data read uses
  the caller's JWT (`supabase/functions/_shared/auth.ts:60-63`).

### 2. Auth surface and open redirects
- **Callback redirects:** `emailRedirectTo` and the OAuth `redirectTo` are both
  `${window.location.origin}/auth/callback` (`apps/web/src/lib/auth/magic-link.ts:39`,
  `apps/web/src/features/UF-01/AccountScreen.tsx:97-100`). Neither can be set from user input.
- **PKCE:** the flow is PKCE with `detectSessionInUrl: false`
  (`apps/web/src/lib/auth/client.ts:99-106`). The callback only reads `code` and `error_code`
  (`apps/web/src/features/UF-01/index.tsx:21-44`) and never reflects them into the page.
- **Post-login navigation:** this goes through `consumeReturnTo()`
  (`apps/web/src/lib/auth/return-to.ts:19-58`). It's sessionStorage-sourced, same-origin
  only, rejects `//`, `/\`, backslashes and control characters, and re-checks after URL
  normalisation (T-0392, T-0396). Tests are in `apps/web/src/lib/auth/return-to.test.ts`.
- **After the `site_url` switch:** the allow-list is the three D-0011 entries plus the preview
  wildcard (F-6). There's no open redirect in `apps/web`.

### 3. Edge Functions: CORS and error leakage
- **CORS:** an exact-origin allow-list with no `*` and no credentials
  (`supabase/functions/_shared/cors.ts:19-28`). Preflight methods and headers are listed at
  `:38-42`. Tests: `supabase/tests/functions/unit/platform.test.ts:13-35` (allowed and
  `https://evil.example` cases).
- **Errors:**
  - Any non-`ApiErrorResponse` throw becomes 500 `internal` with the fixed message "Something
    went wrong" (`supabase/functions/_shared/http.ts:96-100`,
    `supabase/functions/_shared/errors.ts:36-38`).
  - The admin errors carry no ids (`account/admin.ts:17,24`).
  - The log line is `{requestId, fn, status, ms}` only (`http.ts:30-33`).
  - `validate.ts:22,46,62,69` 400 messages echo only the caller's own field name or `tz`
    value. They never echo ids or emails.
- **Error-leak tests:** `platform.test.ts:107-175` (AC23: no stack or email in the 500 body;
  one log line with no email or user id). The gateway's prod path form `/functions/v1/<fn>/…` is
  exercised at `platform.test.ts:66-90`, and unauthenticated 401 at `:93`. The account delete
  path is covered by `supabase/tests/functions/unit/account.test.ts` and
  `integration/account-delete.test.ts`.

### 4. Privacy
- The built landing has no `{{HUMAN:…}}` markers (scanned). T-0502 AC-9 is pinned by
  `apps/landing/src/content/content.test.ts:275`.
- The privacy page is reachable from the landing (`https://workout.vestgote.com/privacy/`).
- Export and deletion are covered as NFR-PRIV-4/5 in `docs/security/privacy.md`.
- Two items are still open, both listed as conditions: H-21 (DPAs) and the H-23 Google sign-in
  check.

## Reproduce the bundle scan before the manual deploy
After `pnpm --filter @workoutlab/web build` with the two `VITE_` variables set, the commands
below should print nothing:

- `grep -rlE 'service_role|SERVICE_ROLE|sb_secret_[A-Za-z0-9]' apps/web/dist`
- `grep -rlE 'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.' apps/web/dist`
- `grep -rhoE 'https://[a-z0-9]+\.supabase\.co' apps/web/dist | sort -u` should print exactly
  the prod origin.
