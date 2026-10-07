---
id: T-0545
title: Web app loads the self-hosted fonts — import fonts.css, preload both woff2, precache woff2 in Workbox (visual-foundation F-3 to F-5)
lane: web-shell
screens: [UF-01.1, UF-11.2]
decisions: [D-0203, D-0204, D-0017, D-0190, D-0031]
deps: [T-0544]
status: todo
---
<!-- Written by product-owner 2026-10-07 (groom, D-0203 §1; split from the web-shell work per D-0204 §1). Flow: wl-build-web (agent frontend-dev). About ⅓ day. Touches vite.config.ts and the service worker precache, so the full web e2e suite runs. May run in parallel with T-0546 (different files). -->

## Why
GitHub #37/#45: every heading on prod renders in the iOS system font because no font ships (`docs/specs/visual-foundation.md` §1). T-0544 puts the woff2 files and `fonts.css` in `@workoutlab/design-tokens`; this ticket makes the web app load them, preload them and keep them offline (D-0017 NFR-OFF). The web CSP (D-0190) stays unchanged: `default-src 'self'` already allows same-origin fonts.

## Scope
- In:
  - `apps/web/src/main.tsx`: import `@workoutlab/design-tokens/fonts.css` **before** `tokens.css`.
  - `apps/web/vite.config.ts`:
    - the build plugin (`buildMetaPlugin` or a sibling) adds one `<link rel="preload" href="/assets/<hashed>.woff2" as="font" type="font/woff2" crossorigin>` per emitted woff2 to `dist/index.html`. The hrefs come from the bundle (for example `generateBundle`/`transformIndexHtml` with the emitted asset names), never hard-coded hashes;
    - `workbox.globPatterns` becomes `["**/*.{js,css,html,webmanifest,png,woff2}"]`.
  - `apps/web/build.test.ts`: F-3.
  - A new e2e spec `tests/e2e/fonts.spec.ts` (guarded fixture): F-4, F-5.
  - Optional (spec §1): `/assets/*` gets `Cache-Control: public, max-age=31536000, immutable` in the emitted `_headers` via `security-headers.mjs`. If done, `security-headers` tests are extended and the CSP string is unchanged.
- Out:
  - Type scale, heading styles, `.wl-page` (T-0546).
  - The landing (T-0547).
  - Any CSP change on the web app.

### Edge cases that are in scope
- **Offline:** after the service worker is active, fonts render from the precache with the network off (F-5).
- **First cold visit:** `font-display: swap` shows the fallback until the file arrives; the preload starts the fetch early. No test asserts first-paint timing.
- **Precache count grows by 2.** Offline e2e specs that wait for the precache to settle (`offline.spec.ts`, T-0904) must still pass; their wait is count-stable, not a fixed number. If one pins a count, raise a qa follow-up rather than editing it here.
- **Double fetch:** a preload without `crossorigin` makes Chromium fetch the font twice. F-4 asserts exactly one response per font file.

## Acceptance criteria
- **AC1 (F-3, build output)** Given `apps/web` built with the test env, When `build.test.ts` reads `dist/`, Then:
  - `dist/assets/` contains exactly 2 `.woff2` files;
  - `dist/index.html` has exactly 2 `<link rel="preload" as="font" type="font/woff2" crossorigin>` tags, and each `href` names a file that exists in `dist/`;
  - the generated `dist/sw.js` precache manifest lists both woff2 URLs;
  - the CSP meta content in `dist/index.html` and the CSP line in `dist/_headers` equal today's strings byte for byte (`cspMetaContent` / `headersFile` output);
  - no file in `dist/` contains `fonts.googleapis` or `fonts.gstatic`.
- **AC2 (F-3 fault)** Given `globPatterns` without `woff2` (planted on a backup copy, restored with `cp`), When AC1 runs, Then it fails on the precache assertion. Recorded in the log.
- **AC3 (F-4, fonts load, online)** Given the built app at 390 × 844, When `/welcome` and then `/plan` (an injected session, mocked Supabase) load and `document.fonts.ready` resolves, Then on each page:
  - `document.fonts.check('800 40px "Big Shoulders Display"')` and `document.fonts.check('400 16px "DM Sans"')` both return `true`;
  - every `FontFace` in `document.fonts` whose family is one of the two has `status === "loaded"` after `document.fonts.load('800 40px "Big Shoulders Display"')` and `document.fonts.load('400 16px "DM Sans"')`;
  - every response with a `font` resource type came from the app's origin with status 200, and each woff2 URL was requested at most once per page load.
- **AC4 (F-5, fonts load, offline)** Given AC3's `/plan` visit and the service worker's precache settled (the `offline.spec.ts` pattern), When the context goes offline and `/plan` reloads, Then AC3's two `document.fonts.check` calls return `true` and no font request fails.
- **AC5 (online/offline pair)** AC3 is online and AC4 is offline; both are required.
- **AC6 (nothing else changes)** The existing `build.test.ts` cases (AC-A2, AC-A3, AC-A5, T-0429 AC4, AC-A6) and `check:size` pass unchanged. The full web e2e suite is green.

Checklist (D-0197 §7): online/offline covered by AC3/AC4. First launch vs returning: the first, cold load is the swap case (not asserted by timing); the returning load is AC4.

## Paths you may change
- `apps/web/*.*` (lane: vite.config.ts, build.test.ts, security-headers.mjs and its test)
- `apps/web/src/main.tsx` (lane)
- `tests/e2e/fonts.spec.ts` (new file)

## Contract impact
None. `tokens.json` and the web CSP are unchanged.

## Definition of done
Every AC has a passing test · `pnpm --filter @workoutlab/web typecheck` green · `pnpm --filter @workoutlab/web lint` green · `pnpm --filter @workoutlab/web test` green · the cached full gate green · the full web e2e suite green (vite config and service worker change) · contracts unchanged · commits start with `T-0545:` and cite UF-01.1 / UF-11.2.

## Build / accept log

### Build log (frontend-dev)
- Changes: main.tsx imports fonts.css before tokens.css; vite.config.ts `buildMetaPlugin.transformIndexHtml` adds one preload link per emitted woff2 (from `ctx.bundle`), `globPatterns` gains `woff2`. CSP and `security-headers.mjs` untouched (optional immutable cache header not done).
- AC1: `build.test.ts` "T-0545 AC1" (4 tests: 2 woff2, preload tags, sw.js manifest, CSP byte-equal + no remote font host). AC3/AC4/AC5: `tests/e2e/fonts.spec.ts` (online /welcome, /plan; offline /plan reload).
- AC2 fault: `woff2` removed from globPatterns (backup copy, restored with cp) -> "sw precache manifest lists both woff2 URLs" red. Fault 2: preload without `crossorigin` -> both online e2e tests red (woff2 requested twice). Restored.
