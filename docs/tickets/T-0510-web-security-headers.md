---
id: T-0510
title: "Web security headers: the build writes dist/_headers (HSTS, CSP as a real header with frame-ancestors/base-uri/form-action/object-src, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy that keeps wake lock), from the same CSP source as the meta tag (go-live review F-1/F-5, D-0190 §2)"
lane: web-shell
screens: [UF-01.5, UF-09.1]
decisions: [D-0190, D-0117, D-0001, D-0184]
deps: [T-0403]
status: ready
groomed: 2026-10-06
---
<!-- Groomed 2026-10-06 by product-owner against main fa4171e (D-0190 §2). Build flow:
wl-build-web. About ¼ day. Highest priority of the post-go-live batch: the live app sends only
Cloudflare's nosniff + referrer-policy today. The live check (AC-7) waits for the human redeploy
(H-24). -->

## Why
The go-live review (`docs/security/go-live-review.md` F-1, F-5) found that the web app sends no
HTTP security headers. There is no HSTS, and nothing stops the app from being framed: a
`<meta>` CSP can't carry `frame-ancestors`, so the clickjacking defence is missing. The CSP
itself only exists as a `<meta>` that `buildMetaPlugin` in `apps/web/vite.config.ts` appends
before `</head>`, after the entry `<script>`.

Cloudflare Pages reads a `_headers` file from the root of the deployed directory. The CSP needs
the Supabase origin, which is only known at build time (`VITE_SUPABASE_URL`), so the build has
to generate the file. A static `public/_headers` won't do.

## Scope
- **In** (`apps/web/vite.config.ts`, plus one new module next to it, e.g.
  `apps/web/security-headers.mjs`, and `apps/web/build.test.ts`):
  - **One CSP source.** A pure function `cspDirectives(supabaseOrigin)` returns the D-0190 §2
    web policy:
    `default-src 'self'; connect-src 'self' <origin>; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`.
    - The `<meta>` tag uses it **minus `frame-ancestors`** (browsers ignore that directive in a
      meta).
    - The header uses all of it.
    - Both strings are built from this one function, never typed twice.
  - **`dist/_headers`.** A build-only plugin step emits it at the root of the output directory
    (`this.emitFile({ type: "asset", fileName: "_headers", … })` or equivalent). It holds one
    `/*` block with exactly these headers:
    - `Strict-Transport-Security: max-age=31536000`
    - `Content-Security-Policy: <full policy>`
    - `X-Frame-Options: DENY`
    - `X-Content-Type-Options: nosniff`
    - `Referrer-Policy: strict-origin-when-cross-origin`
    - `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), screen-wake-lock=(self)`
  - `_headers` must not be precached by the service worker. It has no extension, so the current
    `globPatterns` already skip it; AC-4 pins that.
- **Out:**
  - Removing `style-src 'unsafe-inline'`. 16 React `style` props need it (D-0190 §2).
  - The landing site (T-0511).
  - Any zone-level HSTS setting. The Terraform deliberately leaves zone settings alone (T-0401).
  - The secret-key guard (T-0514a, which edits the same two files after this ticket).
  - Any deploy. The human redeploys at H-24.

### Edge cases that are in scope
- **Previews** (`*.workoutlab-web.pages.dev`) build with prod's `VITE_SUPABASE_URL`, so
  `connect-src` names prod Supabase and `'self'` covers the preview host. AC-1 builds with a
  non-prod origin, which proves the origin comes from the variable and isn't hard-coded.
- **Offline:** the precached `index.html` keeps the `<meta>` CSP, so a shell served by the
  service worker is still covered when the cached response has no CSP header. AC-2 pins that
  the meta survives.
- **Google OAuth, magic link, export:**
  - Google OAuth is a top-level navigation (`supabase.auth.signInWithOAuth` in
    `features/UF-01/AccountScreen.tsx`).
  - The magic link returns to `/auth/callback` on the same origin.
  - The UF-11.4 export is a `blob:` `<a download>` (`lib/account/download.ts`).
  - CSP governs none of these three. `form-action 'self'` and `base-uri 'self'` don't affect
    them, and AC-5 guards that the app has no cross-origin `<form action>` and no `<base>`.
- **UF-09.1 focus mode** uses `navigator.wakeLock` and `AudioContext` (`features/UF-09/device.ts`).
  The Permissions-Policy keeps `screen-wake-lock=(self)` and doesn't list `autoplay` (AC-3).

## Acceptance criteria
Every test title starts with `T-0510 AC-n`. The tests extend `apps/web/build.test.ts`, which
already runs one real `vite build` in `beforeAll` with `SUPABASE_URL = "https://abc.supabase.co"`.
Add a small `_headers` parser in the test: a `/*` line followed by indented `Name: value` lines.
Header names compare case-insensitively.

- **AC-1 (the file exists, CSP header is complete, red on main)**
  - **Given** the shared build.
  - **When** `dist/_headers` is read and parsed.
  - **Then**:
    - the file has a `/*` block;
    - its `Content-Security-Policy`, split on `;` and trimmed, equals the set
      `default-src 'self'`, `connect-src 'self' https://abc.supabase.co`,
      `img-src 'self' data:`, `style-src 'self' 'unsafe-inline'`, `script-src 'self'`,
      `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`;
    - it contains no `unsafe-eval`, no `*` and no `wss:`.

  **Red:** on main, `dist/_headers` doesn't exist.
- **AC-2 (meta and header from one source)**
  - The `<meta http-equiv="Content-Security-Policy">` in `dist/index.html` has exactly the
    header's directives minus `frame-ancestors 'none'` (set equality).
  - The existing AC-A10 meta test stays green, unchanged.
  - A unit test of `cspDirectives("https://x.supabase.co")`, with no build, returns the nine
    directives in that order.
- **AC-3 (the other five headers)** The `/*` block has exactly:
  - `Strict-Transport-Security: max-age=31536000`, with no `includeSubDomains` and no `preload`;
  - `X-Frame-Options: DENY`;
  - `X-Content-Type-Options: nosniff`;
  - `Referrer-Policy: strict-origin-when-cross-origin`;
  - a `Permissions-Policy` whose comma-separated items are the set `camera=()`,
    `microphone=()`, `geolocation=()`, `payment=()`, `usb=()`, `screen-wake-lock=(self)`. No
    item is `autoplay=()` or `screen-wake-lock=()`.
- **AC-4 (not precached)** `sw.js`'s precache list (the `url:"…"` entries the AC-A5 test
  already parses) doesn't contain `_headers`, and the AC-A5 expectations still hold.
- **AC-5 (nothing the new directives would block)**
  - A static scan of `apps/web/src/**/*.{ts,tsx}` (excluding tests) and `apps/web/index.html`
    finds no `<base`, no `<object`, no `<embed`, and no `action=` attribute on a form whose
    value starts with `http`.
  - Planted fault: on a backup copy of a component, add `<form action="https://evil.example">`.
    AC-5 must fail. Restore with `cp`.
- **AC-6 (red proof for the meta/header split)**
  - Planted fault: on a backup copy of `vite.config.ts`, make the meta tag keep
    `frame-ancestors`. AC-2 must fail.
  - Second planted fault: on a backup copy of the new module, drop `object-src 'none'`. AC-1
    must fail.
  - Restore both with `cp` and record each run in the log.
- **AC-7 (live, read-only, after H-24)**
  - **Given** the human has redeployed `workoutlab-web` from a `main` that contains this ticket
    (H-24).
  - **When** an agent runs `curl -sI https://app.workout.vestgote.com/` and
    `curl -sI https://app.workout.vestgote.com/assets/` (any asset path).
  - **Then** both responses carry all six headers with the AC-1/AC-3 values, and the CSP's
    `connect-src` names `https://csgjsdwuxqtuqpuazzpz.supabase.co`.
  - Record the header lines in the log. The human's H-24 sign-ins (magic link and Google) on
    prod complete with no CSP violation in the console. That's the proof that auth still
    works.
  - This AC closes after H-24. The code ACs (1–6) can be accepted first.

## Paths you may change
- `apps/web/*.*` (the lane: `vite.config.ts`, `build.test.ts`, and the new
  `security-headers.mjs` with its `.d.mts` if TypeScript needs one).
- **Listed extras:**
  - `docs/tickets/T-0510-web-security-headers.md`, for the build and accept logs.

## Contract impact
None. Design tokens are untouched; the theme-color meta stays as it is.

## Definition of done
- Tests for every AC pass. The red run on main and the three planted faults are recorded.
- Don't run the full e2e suite. Run these four specs through `scripts/locked.sh heavy`:
  `tests/e2e/csp-session-plan.spec.ts`, `auth.spec.ts`, `uf-11-account.spec.ts` (the
  export download) and `sw-registration.spec.ts`. Together they show that the stricter meta
  (base-uri, form-action, object-src) breaks nothing under the built app.
- `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`,
  `-w format:check` and `node .github/scripts/check-all.mjs` are green, each through
  `scripts/locked.sh` (D-0169).
- Commits start `T-0510`.
- AC-7 is recorded after H-24.

## Notes
- **Parallel:** runs alongside T-0511 (landing), T-0505, T-0507, T-0508 and T-0513, with no
  shared file. T-0514a edits `vite.config.ts` and `build.test.ts` after this ticket merges.
- Cloudflare Pages limits `_headers` to 100 rules and 2,000 characters per line. One rule of
  about 330 characters is well inside that.

## Build / accept log
