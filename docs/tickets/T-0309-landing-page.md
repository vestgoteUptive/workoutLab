---
id: T-0309
title: Landing page "workout LAB by Uptive" on workout.vestgote.com — content (T-0309a, design) and static Astro build (T-0309b, landing)
lane: landing
screens: []                 # the landing has no UF ID; its CTA leads into the app (UF-01.1 for new users)
decisions: [D-0001, D-0002, D-0010, D-0016, D-0017, D-0019, D-0023, D-0037, D-0046]
deps: [T-0003]
status: ready
---
<!-- Groomed 2026-09-28 by product-owner. Board flow: wl-design → wl-build-web. Split into T-0309a (design) and T-0309b (landing) per D-0046 §1. ACs are tagged [a] or [b]. -->

## Why
`workout.vestgote.com` is the public front door (D-0010). It says what workoutLab does and sends
people to the app at `app.workout.vestgote.com`. It carries the privacy notice that NFR-PRIV-6
requires, and it has its own performance budget (NFR-PERF-5: Lighthouse Performance ≥ 95). PRD
names the product "workout LAB by Uptive", PWA only, free in v1. Today `apps/landing` is the T-0002
bootstrap: one bare `<h1>`, no tokens, and a `@placeholder T-0309` test (D-0016, D-0023). The page
must use the Chalk & Iron tokens (D-0019) and load no third-party font, script or tracker (D-0017,
NFR-AN-1).

## Split (D-0046 §1–§2)
| Child | Lane / flow | Deps | Size | What |
|---|---|---|---|---|
| **T-0309a** | design / `wl-design` | T-0003 (done) | ~2 h | Copy as typed modules in `apps/landing/src/content/**`, with their tests. AC1–AC7. |
| **T-0309b** | landing / `wl-build-web` | T-0309a | ~0.5–1 day | Astro pages, styles, config, app-URL helper, favicon, Vitest over the built `dist/`, browser checks (axe, Playwright, Lighthouse), placeholder removal. AC8–AC24. |

Why split: the flow crosses two lanes, and `ownership.yaml` gives `src/content/**` to design. The
children share that path, so they run one after the other. The **board keeps `T-0309` as the parent
row** (`split → T-0309a, T-0309b`), following TR-0015 / D-0037 §12. The marker stays
`@placeholder T-0309` and is valid until the parent is `done`. T-0309b deletes the file (AC21).

## Scope
- In:
  - [a] `src/content/types.ts`, `src/content/landing.ts` (brand, meta, hero, features, privacy summary, footer, 404), `src/content/privacy.ts` (the NFR-PRIV-6 notice), and `src/content/content.test.ts`.
  - [b] `src/pages/index.astro`, `src/pages/privacy.astro`, `src/pages/404.astro`, `src/pages/favicon.svg.ts`, one layout, one stylesheet using only `var(--wl-…)`, `src/lib/app-url.ts`, `astro.config.mjs` (`site`, static output), `vitest.config.ts` with a global setup that builds into a temp dir, `browser/**` Playwright specs, `lighthouserc.cjs`, and `package.json` scripts and devDependencies.
- Out: service worker / offline caching of the landing (it's a static page with nothing to log. Offline, time running out, zero history and 10 days off are app states the landing doesn't have). Self-hosted woff2 (design follow-up; fallback stacks until then, D-0046 §6). `og:image` / social artwork. Blog, pricing, sign-up form, email capture, cookie banner (we set no cookies). Deploy, custom domain and DNS (T-0401/T-0402). CI wiring of `test:browser` (infra follow-up). Any copy that names a person.

### Edge cases that are in scope
- The build runs with `PUBLIC_APP_URL` unset (prod), set to a preview URL, or set to something invalid (AC8, AC10).
- JavaScript disabled. Narrow screens (320 px) and large ones (1440 px). `prefers-reduced-motion` (AC18–AC20).
- A broken link to the landing gets a 404 page with a way home (AC7, AC15).
- Fonts not installed on the device: system fallback, with no layout shift beyond CLS 0.1 (AC23).

## Layout (for T-0309b; the designer may refine it in T-0309a without new ACs)
Mobile first at 390 px, one column. On ≥ 960 px the features go in a 2-column grid (up to 4 cards), with max content width 1120 px.
1. **Header:** the wordmark `brand.name` (display font, 800), then `brand.byline` (body font, `text-muted`).
2. **Hero:** `<h1>` = `hero.headline` (display font), then `hero.sub` (`text-muted`). A primary CTA (`accent` background, `on-accent` text, `accent-hover` on hover, min height 52 px) and `hero.ctaNote` below it (small, `text-muted`). On a 390×844 viewport the CTA sits above the fold.
3. **Features:** `<h2>` = `featuresHeading`, then 3–4 cards (`surface` background, 1 px `line` border). Each card has an `<h3>` title and a body.
4. **Privacy summary:** `<h2>` = `privacy.heading`, the summary, and a link to `/privacy/`.
5. **Footer:** `footer.legal`, plus links to Privacy and to the app (`footer.appLinkLabel`).
Page background `bg`, text `text`. Focus ring: 2 px `accent` outline with 2 px offset.

## Acceptance criteria
Each criterion becomes at least one automated test. [a] tests live in `apps/landing/src/content/content.test.ts`. [b] Vitest tests live in `apps/landing/test/**` and run against the built `dist/` (global setup: Astro `build()` into a temp dir, once with `PUBLIC_APP_URL` unset and once with `PUBLIC_APP_URL=https://preview-t0309.workoutlab-web.pages.dev`). [b] browser tests live in `apps/landing/browser/**`, run with `pnpm --filter @workoutlab/landing test:browser` against a static server over `dist/`, at a 390×844 viewport unless stated otherwise.

**T-0309a — content (design lane)**
- AC1 [a] **Brand and meta.** Given `landing` from `src/content/landing.ts`, When the test reads it, Then `brand.name === "workout LAB"`, `brand.byline === "by Uptive"`, `meta.title` starts with `"workout LAB by Uptive"` and has ≤ 60 characters, and `meta.description` has 50–160 characters.
- AC2 [a] **Hero.** Given `landing.hero`, Then `headline` has 1–60 characters, `sub` has 1–160, `ctaLabel` has 2–24 and doesn't match `/^(click here|here|learn more|more|go)$/i` (link purpose, WCAG 2.4.4), and `ctaNote` has ≤ 80 characters and matches `/free/i` (PRD: free in v1).
- AC3 [a] **Features reflect the principles.** Given `landing.features`, Then it has 3 or 4 items with unique `id`s from `{"balance","time-budget","focus","adaptive"}`, and `balance`, `time-budget` and `focus` are all present. Each `title` has ≤ 32 characters and each `body` ≤ 160. `balance.body` matches `/14/` and `/hard sets/i`. `time-budget.body` matches `/minutes|time/i`. `focus.body` matches `/\bone\b/i` (one task on screen, principle 1). `featuresHeading` is non-empty.
- AC4 [a] **Privacy summary and footer.** Given `landing.privacy` and `landing.footer`, Then `privacy.heading` is non-empty, `privacy.summary` matches `/\bEU\b/` and `/no third-party (analytics|trackers)/i`, `privacy.linkLabel === "Privacy"`, `footer.legal` matches `/Uptive/`, and `footer.appLinkLabel` has 2–24 characters.
- AC5 [a] **Privacy notice (NFR-PRIV-6).** Given `privacy` from `src/content/privacy.ts`, Then:
  - `title === "Privacy"`, and `updated` matches `/^\d{4}-\d{2}-\d{2}$/`.
  - The `sections[].id` are exactly `["what-we-store","why","where","export-and-delete","no-tracking","contact"]`, in that order, and each has a non-empty `heading` and `body`.
  - `what-we-store` matches `/email/i`, `/training/i` and `/plan settings/i`. It also says what we *don't* collect: `/date of birth/i`, `/body weight/i` and `/heart rate/i` (NFR-PRIV-2).
  - `where` matches `/\bEU\b/` (NFR-PRIV-1).
  - `export-and-delete` matches `/JSON/` and `/delete/i` (NFR-PRIV-4/5).
  - `no-tracking` matches `/no third-party analytics/i` (NFR-AN-1).
  - `contactEmail === "privacy@workout.vestgote.com"` (D-0046 §8).
- AC6 [a] **Copy hygiene across every string.** Given a recursive walk over every string value in `landing` and `privacy`, Then no string:
  - is empty or has leading or trailing whitespace;
  - matches `/\bAI\b/`, `/\b(LLM|GPT|artificial intelligence|machine learning)\b/i` (principle 3: the engine picks, not a model);
  - matches `/\blbs?\b/i` (kg only, NFR-I18N-3);
  - matches `/\b(guarantee|cure|diagnos\w*|injury-free)\b/i`;
  - matches `/https?:\/\//` (URLs come from code, not copy);
  - matches `/#[0-9a-f]{3,8}\b/i` (colours come from tokens).
- AC7 [a] **404 copy.** Given `landing.notFound`, Then `title`, `body` and `homeLinkLabel` are non-empty, and `homeLinkLabel` has ≤ 24 characters. `astro check` (the `typecheck` script) passes with every module typed by `src/content/types.ts`.

**T-0309b — build (landing lane)**
- AC8 [b] **App URL helper.** Given `appUrl` from `src/lib/app-url.ts`:
  - When called with `undefined` or `""`, Then it returns `"https://app.workout.vestgote.com/"`.
  - `"https://preview-t0309.workoutlab-web.pages.dev"` returns `"https://preview-t0309.workoutlab-web.pages.dev/"` (trailing slash normalised).
  - `"http://localhost:5173"` returns `"http://localhost:5173/"`.
  - `"http://example.com"`, `"javascript:alert(1)"` and `"not a url"` each throw an `Error` whose message contains `PUBLIC_APP_URL`.
- AC9 [b] **Index document.** Given the default build, When `dist/index.html` is parsed, Then:
  - `<html lang="en">`;
  - `<title>` equals `landing.meta.title`, and `meta[name=description]` equals `landing.meta.description`;
  - `meta[name=viewport]` is `width=device-width, initial-scale=1`;
  - `link[rel=canonical]` is `https://workout.vestgote.com/`;
  - there is exactly one `<h1>`, and its text equals `landing.hero.headline`;
  - the visible text contains `"workout LAB"` and `"by Uptive"`;
  - every `features[].title` appears as an `<h3>`, and every `features[].body` appears in the text (entities decoded).
- AC10 [b] **CTA.** Given the default build, Then `dist/index.html` has exactly one `a[data-cta="primary"]`. Its `href` is `"https://app.workout.vestgote.com/"`, its text is `landing.hero.ctaLabel`, and it has no `target` attribute. Given the preview build, Then the same element's `href` is `"https://preview-t0309.workoutlab-web.pages.dev/"`. Given `PUBLIC_APP_URL=http://example.com`, When `build()` runs, Then it rejects with a message containing `PUBLIC_APP_URL`.
- AC11 [b] **Zero JS, no third party (D-0046 §4, NFR-AN-1, D-0019).** Given the default `dist/`:
  - no `.html` file contains a `<script` element;
  - every `src`, `srcset` and `link[href]` (except `rel=canonical`) is root-relative or relative;
  - every `url(` and `@import` in `dist/**/*.css` is relative, or `data:` for inline SVG;
  - no file in `dist/` contains any of `fonts.googleapis`, `fonts.gstatic`, `typekit`, `googletagmanager`, `google-analytics`, `plausible`, `segment.`, `hotjar` or `sentry`;
  - no `@font-face` has an `http` source.
- AC12 [b] **Tokens consumed.** Given the default `dist/` CSS, Then:
  - it contains `--wl-color-bg:`, `--wl-font-display:` and `--wl-font-body:` (from `@workoutlab/design-tokens/tokens.css`);
  - the rule that styles `body` sets its background to `var(--wl-color-bg)`, its `color` to `var(--wl-color-text)` and its `font-family` to `var(--wl-font-body)`;
  - the `h1` rule sets `font-family: var(--wl-font-display)`.
  - When `pnpm --filter @workoutlab/landing lint` runs (ESLint plus `wl-check-colours .`, which scans `public/` too), Then it exits 0.
- AC13 [b] **Theme colour and favicon from tokens (D-0046 §7).** Given the default build:
  - `meta[name=theme-color]` `content` equals `tokens.color.bg` from `@workoutlab/design-tokens/tokens.json`;
  - `link[rel=icon][type="image/svg+xml"]` has `href="/favicon.svg"`;
  - `dist/favicon.svg` starts with `<svg`, has `xmlns="http://www.w3.org/2000/svg"`, and every `fill`/`stroke` colour in it is a value of `tokens.color`;
  - `apps/landing/public/` doesn't exist or holds no file with a colour literal (covered by AC12's lint).
- AC14 [b] **Privacy page (NFR-PRIV-6).** Given the default build:
  - `dist/privacy/index.html` exists, and its `<title>` is `"Privacy — workout LAB by Uptive"`;
  - it has exactly one `<h1>` with text `privacy.title`;
  - it renders every `privacy.sections[].heading` as an `<h2>`, in order;
  - it contains `a[href="mailto:privacy@workout.vestgote.com"]` and a link to `/`;
  - `dist/index.html` has a footer `a[href="/privacy/"]` with text `landing.privacy.linkLabel`.
- AC15 [b] **404 page.** Given the default build, Then `dist/404.html` exists, has one `<h1>` with text `landing.notFound.title`, and has `a[href="/"]` with text `landing.notFound.homeLinkLabel`.
- AC16 [b] **Accessibility (NFR-A11Y-1).** Given `test:browser`, When axe-core runs on `/`, `/privacy/` and `/404.html` with tags `wcag2a, wcag2aa, wcag21aa, wcag22aa`, Then there are 0 violations of impact `serious` or `critical`.
- AC17 [b] **Touch targets (NFR-A11Y-2).** Given `/` at 390×844, Then the CTA's bounding box is ≥ 44×44 and the CTA's height is ≥ 52 px. Every footer link and the `/privacy/` home link has a box ≥ 44×44 (links inside prose are exempt under WCAG 2.5.8).
- AC18 [b] **Keyboard and focus.** Given a fresh load of `/`, When Tab is pressed at most 2 times (a skip link may come first), Then the CTA is focused. Its computed style has an `outline-style` other than `none` and an `outline-width` ≥ 2 px.
- AC19 [b] **Responsive.** Given `/` and `/privacy/` at 320×640, Then `document.documentElement.scrollWidth` ≤ 320 (no horizontal scroll). Given `/` at 390×844, and again at 1440×900, Then the `<h1>` and the CTA bounding boxes end within the first viewport height.
- AC20 [b] **Reduced motion and no JS.** Given `/` with `reducedMotion: "reduce"`, Then `document.getAnimations().length === 0` after load. Given `javaScriptEnabled: false`, Then the `<h1>` and the CTA render, and the CTA has the same `href` as in AC10.
- AC21 [b] **Placeholder replaced (D-0023, D-0046 §2).** Given branch `t/T-0309b-*`, Then `apps/landing/test/placeholder.test.ts` doesn't exist, no file under `apps/landing` contains `@placeholder T-0309`, `apps/landing` has at least one test file with no literal assertion (`expect(true)` etc.), and `node .github/scripts/check-all.mjs` exits 0.
- AC22 [b] **Only first-party requests at runtime (NFR-AN-1).** Given `test:browser`, When `/` and `/privacy/` load with JS on and every request is recorded, Then every request's origin equals the preview server's origin. The combined transfer size of all responses for `/` is ≤ 100 KB.
- AC23 [b] **Lighthouse (NFR-PERF-5, D-0046 §10).** Given `lhci autorun` with `lighthouserc.cjs` over `dist/` (`/` and `/privacy/`, mobile form factor, default simulated throttling, `numberOfRuns: 3`, `upload.target: "filesystem"`, never temporary-public-storage), When the assertions run, Then:
  - `categories:performance` ≥ 0.95, `categories:accessibility` ≥ 0.95 and `categories:best-practices` ≥ 0.95;
  - `largest-contentful-paint` ≤ 2500 ms and `cumulative-layout-shift` ≤ 0.1;
  - all pass on the median run.
- AC24 [b] **Config and scripts.** Given `apps/landing`:
  - `astro.config.mjs` sets `site: "https://workout.vestgote.com"` and static output;
  - `package.json` has `test` (Vitest, no browser) and `test:browser` (Playwright + lhci) scripts;
  - `vitest.config.ts` excludes `browser/**`;
  - When `pnpm -w typecheck lint test` runs, Then it is green without a network or a browser installed.

## Paths you may change
- **T-0309a (design):** `apps/landing/src/content/**` only.
- **T-0309b (landing):** `apps/landing/**` except `apps/landing/src/content/**`, which is read-only here. If copy needs to change, add a follow-up for design, and don't edit it. Extra path: `pnpm-lock.yaml`, only for the new `apps/landing` devDependencies (`@playwright/test`, `@axe-core/playwright`, `@lhci/cli`, an HTML parser such as `node-html-parser`, and a static server if needed). Don't touch `turbo.json`, `.github/**` or the root ESLint config.

## Contract impact
none. The ticket reads `packages/design-tokens/src/tokens.json` and `tokens.css` and doesn't change them. No API or data-model use.

## Definition of done
Tests for every AC pass. `pnpm -w typecheck lint test` is green. `pnpm --filter @workoutlab/landing test:browser` is green, run locally by the T-0309b builder, with its output attached for accept. Contracts are unchanged. Commit messages start with `T-0309a:` / `T-0309b:`.

## Follow-ups (not in this ticket)
- orchestrator: split the board row per D-0046 §2. Add to `needs-human.md`: approve the landing and privacy copy, and confirm the `privacy@workout.vestgote.com` mailbox, both before the first prod deploy of the landing (gates 3 and 6).
- infra: a CI job that runs `pnpm --filter @workoutlab/landing test:browser` (Chromium install, lhci filesystem upload). Set `PUBLIC_APP_URL` to the web preview URL on landing preview builds (T-0402).
- design: self-hosted woff2 for Big Shoulders Display and DM Sans in `@workoutlab/design-tokens` (already on the board). Then landing: import it and re-run AC23.
- web-feature:UF-01: UF-01.5 links to `https://workout.vestgote.com/privacy/` (NFR-PRIV-6).
- security (T-0406): review `src/content/privacy.ts` against `docs/security/`. Security's text wins (D-0046 §8).
