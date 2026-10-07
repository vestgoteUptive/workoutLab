---
id: T-0547
title: Landing loads the self-hosted fonts — fonts.css and preload in Layout.astro, `font-src 'self'` in the landing CSP (security sign-off), re-run T-0309 AC23
lane: landing
screens: []
decisions: [D-0203, D-0046, D-0190, D-0031]
deps: [T-0544]
status: todo
---
<!-- Written by product-owner 2026-10-07 (groom, D-0203 §1; spec docs/specs/visual-foundation.md §1 "Loading in the apps" and "CSP impact"). Flow: wl-build-web (agent frontend-dev) + security review (agent security-reviewer): the CSP widens by one directive. About ¼ day. -->

## Why
The landing (`workout.vestgote.com`) has used the system fallback since T-0309 (D-0046 §6: "fallback until woff2 ships"). T-0544 ships the woff2. The landing CSP is `default-src 'none'; style-src 'self'; …`, which blocks every font, so it needs `font-src 'self'` (spec "CSP impact"). That is a security-header change, so the security reviewer signs it off.

## Scope
- In:
  - `apps/landing/src/layouts/Layout.astro`: import `@workoutlab/design-tokens/fonts.css` before `tokens.css`; add one `<link rel="preload" as="font" type="font/woff2" crossorigin href={…}>` per woff2, with the href from a `?url` import of `@workoutlab/design-tokens/fonts/<file>.woff2` (never a hard-coded hash).
  - `apps/landing/public/_headers`: the CSP becomes `default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'`. No other header changes.
  - `apps/landing/test/t0511-headers.test.ts`: the pinned `EXPECTED` CSP string and the directive set gain `font-src 'self'` (8 directives). This is a spec change, not a weakened test; the log says so.
  - A new test `apps/landing/test/t0547-fonts.test.ts` (F-6, built output).
  - Re-run `test:browser` (Playwright + Lighthouse, T-0309 AC23).
- Out:
  - Any other CSP directive, `script-src`, or a font CDN.
  - Landing copy or layout changes.

### Edge cases that are in scope
- **Zero JS.** The landing ships no `<script>` (T-0309 `ac11-zero-js`, T-0511 AC-3). Preload links are `<link>`, not script; those tests pass unchanged.
- **CLS with the swap (AC23).** `font-display: swap` swaps the fallback for the web font. AC23's CLS ≤ 0.1 must still hold. If it fails, the fix is a fallback `size-adjust` face or similar inside this lane, recorded in the log; never a looser budget.
- **Offline.** The landing has no service worker; not applicable.

## Acceptance criteria
- **AC1 (F-6 CSP)** Given the default build's `dist/_headers`, When `t0511-headers.test.ts` runs, Then the `/*` block's CSP equals exactly the string in Scope, its directive set has 8 members including `font-src 'self'`, and the other five headers are unchanged. T-0511 AC-2 (preview build byte-identical) still passes.
- **AC2 (F-6 built CSS)** Given `dist/`, When `t0547-fonts.test.ts` reads every emitted `.css` file, Then exactly 2 `@font-face` rules exist, with families `"Big Shoulders Display"` and `"DM Sans"`, and each `src` `url()` is root-relative (`/` then not `/`) and names a `.woff2` file that exists in `dist/`. No CSS or HTML file contains `http://`, `https://` inside a `url()`, `fonts.googleapis` or `fonts.gstatic`.
- **AC3 (preload)** Given `dist/index.html` and `dist/privacy/index.html`, Then each has exactly 2 `<link rel="preload" as="font" type="font/woff2" crossorigin>` whose hrefs exist in `dist/` and equal the two `@font-face` `url()`s from AC2.
- **AC4 (fonts render, browser)** Given `test:browser`'s preview server, When `/` loads and `document.fonts.ready` resolves, Then `document.fonts.check('800 40px "Big Shoulders Display"')` and `document.fonts.check('400 16px "DM Sans"')` are `true`, and the console has no CSP violation.
- **AC5 (T-0309 AC23 re-run)** Given `npx -y @lhci/cli@0.15.0 autorun --config=lighthouserc.cjs` over the new `dist/`, Then every assertion passes unchanged: performance, accessibility and best-practices ≥ 0.95, LCP ≤ 2500 ms, CLS ≤ 0.1 on `/` and `/privacy/`. The log records the median CLS and LCP before (on `main`) and after.
- **AC6 (fault)** Given the `font-src 'self'` directive removed from `_headers` on a backup copy, When AC1 runs, Then it fails, and AC4 (if run against that build) logs a CSP violation. Restored with `cp`; recorded in the log.
- **AC7 (security sign-off)** The security reviewer's verdict on the CSP change is recorded in this ticket's log before merge.

Checklist (D-0197 §7): font loaded (AC4) vs not loaded: the swap case is AC5's CLS bound; first visit vs return doesn't apply (no service worker on the landing).

## Paths you may change
- `apps/landing/**` (lane)

## Contract impact
None (no tokens change). A security-header change, signed off in AC7.

## Definition of done
Every AC has a passing test · `pnpm --filter @workoutlab/landing typecheck` green · `pnpm --filter @workoutlab/landing lint` green · `pnpm --filter @workoutlab/landing test` green · `pnpm --filter @workoutlab/landing test:browser` green (AC23) · the cached full gate green · security sign-off recorded · commits start with `T-0547:`.

## Build / accept log

### Build log (frontend-dev, 2026-10-07)
- Changed: Layout.astro (fonts.css import before tokens.css, 2 `?url` preloads), `_headers` (+`font-src 'self'`), t0511 `EXPECTED` + directive set (8) updated as a spec change, not a weakening; new `test/t0547-fonts.test.ts` (AC2, AC3), `browser/fonts.spec.ts` (AC4).
- CSP before: `default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'`. After: `default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'`.
- AC1 t0511 AC-1/AC-2 · AC2/AC3 t0547-fonts.test.ts · AC4 browser/fonts.spec.ts (requires loaded faces too: `fonts.check` alone is vacuously true with no @font-face; the first draft passed with fonts.css removed, so strengthened) · AC5 lhci.
- AC5 (lhci, local Chromium with --no-sandbox): all assertions pass. Median CLS before 0 / after 0 on `/` and `/privacy/`; median LCP `/` 906 ms -> 1359 ms, `/privacy/` 904 -> 1355 ms; perf 1 both.
- Planted faults (backup + cp restore): font-src removed -> t0511 AC-1 red; preload links removed -> t0547 AC3 red; fonts.css import removed -> t0547 AC2+AC3 red and browser/fonts.spec red. `astro preview` does not serve `_headers`, so the browser run cannot show a CSP violation for AC6; AC1 is the CSP guard.
- Gate: landing vitest 153 pass (ac21 check-all failed only because origin/main lacks T-0544 paths); full `-w typecheck lint test`, test:repo-checks, format:check green. AC7 security sign-off pending.
