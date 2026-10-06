---
id: D-0196
title: "GitHub #36: C-02 tab bar is fixed to the bottom of the viewport, padded by the safe-area inset, with an in-flow spacer and scroll padding so no content or focus hides under it; viewport-fit=cover; the keyboard overlays it; still never rendered in UF-08/UF-09"
status: revisit
date: 2026-10-06
by: product-owner (GitHub #36 intake)
area: web
builds-on: D-0045 §3, D-0071 §2, D-0003
amends: D-0045 §3 (C-02 placement)
---
## Context
GitHub #36 (the owner, installed PWA): "Navigation buttons in the bottom should be fixed. Now you
need to scroll to bottom to see them."

Cause (main da5c366): `Shell` in `apps/web/src/app/App.tsx` renders `<TabBar />` after `<Routes>`
as an ordinary block, and `.wl-tab-bar` in `apps/web/src/components/tab-bar/tab-bar.css` has no
`position` rule. The bar is simply the last thing in the document: on a long screen it's below
the fold, on a short one it floats mid-screen under the content. D-0045 §3 says what's in C-02
but never where it sits. `index.html`'s viewport meta has no `viewport-fit=cover`, and nothing
in `apps/web/src` reads a safe-area inset.

## Decision
1. **Fixed.** `.wl-tab-bar` is `position: fixed` at the bottom of the viewport, full width
   (`inset-inline: 0; inset-block-end: 0`), `z-index: 5` (below the overlays at 10), with its
   existing surface background and top border.
2. **Safe area.** `index.html`'s viewport meta becomes
   `width=device-width, initial-scale=1.0, viewport-fit=cover`. The bar pads
   `env(safe-area-inset-bottom, 0px)` below its links and `env(safe-area-inset-left/right, 0px)`
   at its sides, so the iPhone home indicator never sits on a tab. Link hit areas stay ≥ 44×44
   (T-0300 AC-A7).
3. **Nothing hides under it.**
   - Clearance: an in-flow spacer as tall as the bar (bar height plus the bottom inset), rendered
     with the bar (`aria-hidden="true"`), so it exists exactly where the bar does. A route without
     the bar gets no extra space.
   - Focus: while the bar is rendered, the root scroller gets `scroll-padding-block-end` equal to
     the bar's height, so a focused element scrolled into view isn't covered (WCAG 2.4.11).
   - The bar's height lives in one CSS custom property in `tab-bar.css`
     (`--wl-tab-bar-block-size`), used by the bar, the spacer and the scroll padding. It's a size,
     not a colour or font, so it doesn't go in `tokens.json`.
4. **Keyboard.** No `interactive-widget=resizes-content`: the on-screen keyboard overlays the
   layout viewport (the default on iOS Safari and Chrome for Android since 108), so the bar
   stays behind the keyboard instead of riding up over the field being typed in.
5. **Principle 1 unchanged.** `showTabBar` in `routes.ts` still decides; `/session/*`, `/welcome/*`,
   `/account`, `/auth/*` and the `/plan/*` editing routes render neither the bar nor the spacer.
6. The top inset isn't changed here: the manifest has no translucent status bar, so content
   already starts below it. If the owner's iPhone shows content under the status bar after the
   deploy, that's a new ticket.

## Consequences
- web-shell (T-0527): `tab-bar.css`, `TabBar.tsx`, `index.html`, a vitest and an e2e in
  `tests/e2e/shell.spec.ts` (listed extra).
- The owner can confirm the safe-area padding on the installed iPhone PWA after the next deploy.
  That isn't a gate for done (Chromium can't emulate the inset).
