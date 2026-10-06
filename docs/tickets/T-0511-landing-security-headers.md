---
id: T-0511
title: "Landing security headers: a static public/_headers (HSTS, a strict zero-JS CSP with frame-ancestors 'none', X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy), pinned by a dist test (go-live review F-1, D-0190 §2)"
lane: landing
screens: []
decisions: [D-0190, D-0046, D-0010]
deps: [T-0403]
status: ready
groomed: 2026-10-06
---
<!-- Groomed 2026-10-06 by product-owner against main fa4171e (D-0190 §2). Build flow:
wl-build-web. About ⅛ day. The live check (AC-5) waits for the human redeploy (H-24). -->

## Why
`workout.vestgote.com` sends no security headers beyond Cloudflare's defaults
(`docs/security/go-live-review.md` F-1): no HSTS, no CSP, nothing that stops framing. The
landing is zero-JS static HTML (D-0046 §4, `apps/landing/astro.config.mjs`; AC11 test). Its
built `dist/` holds:
- one same-origin stylesheet (`/_astro/*.css`, with `inlineStylesheets: "never"`);
- an SVG favicon;
- no inline `<style>`, no `style=` attribute and no `<script>`.

A very strict CSP therefore fits. It doesn't depend on any build-time value, so a static file in
`apps/landing/public/` (Astro copies it to the root of `dist/`) is enough.

## Scope
- **In:**
  - Create `apps/landing/public/_headers` with one `/*` block:
    - `Strict-Transport-Security: max-age=31536000`
    - `Content-Security-Policy: default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'`
    - `X-Frame-Options: DENY`
    - `X-Content-Type-Options: nosniff`
    - `Referrer-Policy: strict-origin-when-cross-origin`
    - `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), screen-wake-lock=()`
      (the landing never needs wake lock, unlike the app).
  - Add a new test, `apps/landing/test/t0511-headers.test.ts`, that reads the default build from
    `test/global-setup.ts`.
- **Out:**
  - Any change to page markup or styles.
  - The web app (T-0510).
  - The astro bump (T-0512, which follows this ticket in the same app).
  - The deploy (H-24).

### Edge cases that are in scope
- **Preview builds** (`PUBLIC_APP_URL` set, `previewDistDir()`) ship the same `_headers`. The CTA
  is a plain link to the app host, which CSP doesn't govern (AC-2).
- **A future inline style or script** would be blocked silently in production while every test
  still passed. AC-3 makes it fail at build time instead.

## Acceptance criteria
Every test title starts with `T-0511 AC-n`. Parse `_headers` the same way T-0510 does: a `/*` line
followed by indented `Name: value` lines. Header names compare case-insensitively.

- **AC-1 (default build, red on main)**
  - **Given** `defaultDistDir()`.
  - **When** `_headers` is read and parsed.
  - **Then**:
    - there is a `/*` block holding exactly the six headers in Scope, with those values;
    - the CSP, split on `;` and trimmed, equals the set of its seven directives;
    - HSTS has no `includeSubDomains` and no `preload`.

  **Red:** on main, `dist/_headers` doesn't exist.
- **AC-2 (preview build)** `previewDistDir()/_headers` is byte-identical to the default
  build's file.
- **AC-3 (the CSP really covers the output)** For every `.html` file in the default dist:
  - no `<script` tag (reuse `hasScriptTag` from `test/html.ts`);
  - no `<style` tag;
  - no `style=` attribute;
  - every `<link rel="stylesheet">` and every `<img>`/`<link rel="icon">` `src`/`href` is
    root-relative.

  Planted fault: on a backup copy of `src/pages/index.astro`, add `<p style="color:inherit">`.
  AC-3 must fail. Restore with `cp`.
- **AC-4 (CSP planted fault)** On a backup copy of `public/_headers`, change `frame-ancestors 'none'`
  to `frame-ancestors *`. AC-1 must fail. Restore with `cp`. Record the run.
- **AC-5 (live, read-only, after H-24)**
  - **Given** the human has redeployed `workoutlab-landing` from a `main` with this ticket
    (H-24).
  - **When** an agent runs `curl -sI https://workout.vestgote.com/` and
    `curl -sI https://workout.vestgote.com/privacy/`.
  - **Then** both carry the six headers with the AC-1 values. Record the header lines in the
    log.
  - The human loads both pages in a browser and sees them styled, with no CSP violation in the
    console.
  - This AC closes after H-24.

## Paths you may change
- `apps/landing/**` (the lane: `public/_headers` new, `test/t0511-headers.test.ts` new).
- **Listed extras:**
  - `docs/tickets/T-0511-landing-security-headers.md`, for the build and accept logs.

## Contract impact
None.

## Definition of done
- Tests for every AC pass. The red run and the two planted faults are recorded.
- `npx -y pnpm@10.28.2 --filter @workoutlab/landing test` is green, then `-w typecheck lint test
  --concurrency=1`, `-w test:repo-checks`, `-w format:check` and
  `node .github/scripts/check-all.mjs`, each through `scripts/locked.sh` (D-0169).
- Commits start `T-0511`.
- AC-5 is recorded after H-24.

## Notes
- **Parallel:** runs alongside T-0510, T-0505, T-0507, T-0508 and T-0513. T-0512 (astro bump)
  waits for this ticket, because both change `apps/landing`, and this ticket's tests become its
  regression check.
- Check that `wl-check-colours` and `prettier` ignore a file with no extension, or add
  `public/_headers` to the landing's ignore list if one of them complains.

## Build / accept log
