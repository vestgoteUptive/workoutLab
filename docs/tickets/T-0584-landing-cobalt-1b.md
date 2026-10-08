---
id: T-0584
title: "Landing page: Cobalt option 1b (plan blue, lift-coloured Set screen in the hero, numbered 2 x 2 hairline grid, privacy on paper), plus 404 and Privacy restyle (D-0208)"
lane: landing
screens: []
decisions: [D-0208, D-0194, T-0309]
deps: [T-0583]
status: done
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
- `apps/landing/**`, `docs/security/T-0584-*.md` (security-reviewer sign-off, AC8)

## Contract impact
None. Uses the T-0583 tokens.

## Definition of done
Every AC has a test, and each is proven by a planted fault where one applies · `pnpm -w typecheck lint test --concurrency=1` green · landing `test:browser` and lhci green · `format:check` and `check-all` green · security-reviewer sign-off recorded · commits start with `T-0584`.

## Build / accept log

### Build log (frontend-dev)
- Built option 1b: `SiteHeader`/`SiteFooter` components shared by `/`, `/privacy/`, 404; `global.css` rewritten on plan/paper tokens, rem font sizes; `fonts-state.css` + one preload (Familjen; Bricolage is declared but unused so never fetched); `theme-color` = `tokens.color.plan.bg`.
- AC5 choice: static WebP `src/assets/hero-set.webp` (680x1280, 27 KB), rendered from canvas `#1b` hero phone at DPR 2 (Playwright, local font files), PIL-encoded; CTA arrow and 01-04 are CSS generated content (no text nodes).
- AC->test: AC1/2/5/8 `test/t0584-cobalt.test.ts`; AC3/4/6/7/9/10/12 and AC5 CLS `browser/cobalt-1b.spec.ts`; AC8 CSP `t0511` (unchanged) + AC8 test; AC11 `ac13` (updated); `ac12`, `t0547` updated deliberately for the new tokens/fonts.
- Planted faults (all red, restored from backup): px font-size, extra literal in index.astro, img alt text, CSP font-src loosened, h1 clamp max 7.5rem, focus ring colour, transition added.
- Deviations: headline has no trailing full stop (canvas shows one; copy is from landing.ts); contrast README value 5.9 for ink-muted on plan.bg is 5.85 exactly, test compares at one decimal; hero bottom row is stacked between 1024 and 1199 px (sub text would be ~120 px wide); Bricolage is not preloaded. Security-reviewer sign-off on `_headers` still needed (file unchanged).
- Browser suite: `browser/fonts.spec.ts` (Familjen) and `browser/keyboard-focus.spec.ts` (CTA within 3 Tabs: skip link, header pill, CTA; skip link + Tab lands on CTA) updated deliberately. test:browser 46 passed; lhci green locally (needs `CHROME_PATH` + `--no-sandbox` here). Gate, repo-checks, format, check-all exit 0.
- Screenshots (AC12): `index-1440`, `index-390`, `privacy-390`, `404-390` via `testInfo.outputPath`; copies and canvas #1b in the scratchpad `t0584-shots/`. Visual review by orchestrator/owner: pending.
- Review rework: `.feature-card { align-content: start }` (cells 02/03 had an h3 box stretched to 53.8 px, so the h3-to-body gap was about 27.8 px instead of 14); h1 is `8rem` from 1024 (the clamp gave 122.9 px at 1024); skip-link comment fixed. Tests: gap/h3-height at 1280 and 1440, h1 at 1024/1050/1066/1100. Red without the fix (h3 height 53.77 vs 40, 2 failed), green with it.
- T-0309 AC18 amended: the CTA is reached within 3 Tabs (skip link, header pill, CTA), or by skip link + Tab. Forced by the README header "Open the app" pill, which sits before the hero.

- 2026-10-08 orchestrator: code review requested changes (grid gap), fixed in cc61a4b. Security sign-off: approve (docs/security/T-0584-landing-cobalt-headers.md). QA: pass (planted faults on AC4/6/7/10/11 red; lhci exit 0). AC12 visual review: the 1440 shot matches canvas #1b, with the gap even after the fix; the 390 shot follows the README mobile rules. Accepted.
