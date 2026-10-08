---
id: T-0584
title: "Landing page: Cobalt option 1b (plan blue, lift-coloured Set screen in the hero, numbered 2 x 2 hairline grid, privacy on paper), plus 404 and Privacy restyle (D-0208)"
lane: landing
screens: []
decisions: [D-0208, D-0194, T-0309]
deps: [T-0583]
status: doing
---
## Why
D-0208 §7: the owner chose landing layout **1b** on 2026-10-08. The spec is the "Landing page" section of `Design-docs/docs/design/redesign-cobalt/README.md` on branch `design/redesign-cobalt`. The visual reference is `canvas/Landing Page.dc.html`, option `#1b`; "Now" is the current page, and 1a is rejected. Read them with `git show origin/design/redesign-cobalt:<path>`, and open the canvas in a browser from a scratch copy.

## Scope
- In:
  - Markup and CSS in `apps/landing`, so the index page matches 1b on desktop, plus the README mobile rules (the canvas has no 1b mobile frame).
  - The same header, footer and plan.bg treatment on `404.astro` and `privacy.astro`.
  - A hero Set-screen image.
  - `theme-color` set to plan.bg.
- Out:
  - Any copy change. **No new strings**; all copy stays in `apps/landing/src/content/landing.ts`.
  - App screens, engine, data and API.

## Acceptance criteria
- AC1 Copy is unchanged: every visible string comes from `landing.ts`, and a test compares the rendered text nodes with the content module, with no literals added in `.astro` files. The section order is header → hero → How it works → privacy → footer. The skip link, `data-cta="primary"` on the hero CTA, and `appUrl()` on every app link are kept.
- AC2 Tokens only:
  - **page:** plan.bg throughout, Familjen Grotesk (`--wl-font-plan`), ink white, secondary text plan.ink-muted;
  - **privacy band:** paper.bg / paper.ink / paper.ink-muted, with the Privacy link in plan.bg;
  - **no raw colours** (the colour guard stays green);
  - **font sizes in rem** (a test scans the landing CSS for `px` font sizes and rejects them).
- AC3 Layout at ≥ 1024 px, per the README:
  - **page:** padding 80 px, `.wrap` max 1120 px;
  - **header:** wordmark 22 px/700, and the "Open the app" pill;
  - **hero grid:** `minmax(0,1fr) 340px`, gap 64;
  - **h1:** 128 px, line-height .86, tracking −.055em, `text-wrap: balance`;
  - **bottom row:** the sub text (22/1.4, max 26em) and the CTA stack (22/700, padding 22 × 34, nowrap, arrow on the right) with ctaNote (14 px, max 18em);
  - **phone:** a 340 × 640 crop with 40 px top corners, flush on the hero's bottom edge;
  - **How it works:** a 1 px plan.line top rule; a 2 × 2 hairline grid with a top border, a first-row bottom border and a vertical rule; each cell a `72px 1fr` grid with padding 40/48; the numbers 01–04 at 40 px/700, ink-muted and **decorative** (CSS counters or `aria-hidden`); h3 40 px; body 19/1.45;
  - **privacy:** padding 72 × 80, 2 columns, h2 56 px;
  - **footer:** padding 28 × 80 × 40.

  Asserted through computed styles in a Playwright test.
- AC4 Mobile (< 1024 px; < 768 px for the grid):
  - padding 24 px;
  - one column;
  - h1 `clamp(3rem, 12vw, 8rem)`;
  - the CTA full width;
  - the phone below the CTA, centred, 280 px wide, cropped at the bottom edge;
  - the grid one column with h3 32 px;
  - privacy one column;
  - the footer stacked.

  Footer and privacy link targets are ≥ 44 × 44 px. No horizontal scroll at 320 px.
- AC5 Hero image:
  - the Set screen (UF-09.3 lift state) from canvas `#1b`, exported as a static **WebP at 2×**;
  - explicit `width`/`height`, `alt=""` and `aria-hidden="true"`;
  - CLS ≤ 0.1 (T-0309 AC23, Lighthouse CI);
  - LCP within the existing budget.

  Inline `aria-hidden` markup is an allowed alternative: note the choice in the Build log.
- AC6 Contrast (WCAG 2.2 AA, axe plus computed pairs). It must meet at least the README corrected values: white on plan.bg 8.6, ink-muted on plan.bg 5.9, paper ink 12.9 and paper ink-muted 6.5 on paper.bg, and plan.bg (the link) on paper.bg ≥ 4.5. axe passes with no serious or critical issues on `/`, `/privacy/` and the 404 page.
- AC7 Focus ring: a 2 px white outline with a 2 px offset on plan.bg, and a plan.bg outline on the paper band. Visible on every link and button (keyboard e2e).
- AC8 Fonts: the landing loads `fonts-state.css` (T-0583), with no font CDN. The CSP keeps `font-src 'self'` (already present since T-0547) and has nothing else looser. The `t0511` headers test stays exact. **Security-reviewer sign-off** on the final `_headers` before merge.
- AC9 Reduced motion: the landing has no motion, or any added transition is disabled under `prefers-reduced-motion: reduce` (test).
- AC10 404 and Privacy: the same header, footer and plan.bg; h1 56 px/700; body 18/1.5 ink-muted, max 60ch; links white and underlined; Privacy h2s 24 px/700. Existing tests ac14/ac15 updated deliberately.
- AC11 `theme-color` meta equals plan.bg `#2337C6` (ac13 updated).
- AC12 Playwright screenshots of `/` at **1440** and **390** width, plus `/privacy/` and the 404 page at 390, saved through `testInfo.outputPath`. Compared by eye against canvas `#1b` by the orchestrator and the owner; the review is recorded in the Build log.

## Paths you may change
- `apps/landing/**`

## Contract impact
None. Uses the T-0583 tokens.

## Definition of done
Every AC has a test, and each is proven by a planted fault where one applies · `pnpm -w typecheck lint test --concurrency=1` green · landing `test:browser` and lhci green · `format:check` and `check-all` green · security-reviewer sign-off recorded · commits start with `T-0584`.

## Build / accept log
