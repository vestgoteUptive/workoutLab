---
id: T-0546
title: Global type scale (body, h1, h2) and the shared .wl-page / .wl-card / .wl-row / .wl-label / .wl-stat / .wl-muted / button / text-input classes in main.css (visual-foundation §2–§3)
lane: web-shell
screens: [UF-02.1, UF-04.1, UF-06.1, UF-10.1, UF-11.2, UF-11.4]
decisions: [D-0203, D-0204, D-0019, D-0017]
deps: []
status: ready
---
<!-- Written by product-owner 2026-10-07 (groom, D-0203 §2 §5; split from the web-shell work per D-0204 §1). Flow: wl-build-web (agent frontend-dev). About ½ day. Global h1/h2 rules change every screen at once (D-0203 §5): the full web e2e suite runs and the log records a visual check of each tab screen. May run in parallel with T-0545 (different files). -->

## Why
GitHub #37/#45: `apps/web/src/main.css` styles only `body`, so a bare `<h1>`/`<h2>` gets the browser default, and the UF-11 screens have no side gutter (`docs/specs/visual-foundation.md` §2, §3, root causes 2 and 3). D-0203 §2 puts one shared page class, a global type scale and the shared card/row/label/button/input classes in `main.css`, built from existing tokens only (no new token groups). T-0548, T-0549 and T-0550 then adopt them on UF-11.

## Scope
- In (`apps/web/src/main.css`):
  - **Type scale** (spec §3 table), sizes in `rem` only:
    - `body`: `var(--wl-font-body)`, 1rem / 1.5, weight 400, `var(--wl-color-text)`;
    - `h1`: `var(--wl-font-display)`, `clamp(2rem, 10vw, 2.5rem)` / 1.0, 800, uppercase, `letter-spacing: 0.01em`, margin 0, `overflow-wrap: anywhere` (never truncated);
    - `h2`: display, 1.5rem / 1.1, 800, uppercase, 0.01em, margin 0;
    - `.wl-label`: body, 0.75rem / 1.33, 700, uppercase, 0.08em, `text-muted` (applies to an `h2`/`h3`/`legend` inside a card and overrides the `h2` rule);
    - `.wl-stat` (1.75rem, 800, display, `font-variant-numeric: tabular-nums`) and `.wl-stat--hero` (2.125rem);
    - `.wl-muted` (0.875rem / 1.4, `text-muted`) and `.wl-caption` (0.8125rem / 1.3, 500, `text-muted`).
  - **`.wl-page`**: exactly the spec §2 block (box-sizing, `max-inline-size: 640px`, `margin-inline: auto`, `padding-inline: max(20px, env(safe-area-inset-left)) max(20px, env(safe-area-inset-right))`, `padding-block: max(24px, env(safe-area-inset-top)) 32px`, flex column, `gap: 16px`).
  - **`.wl-card`**, **`.wl-row`** (min 56 px, chevron slot), **`.wl-button--primary`** (accent / on-accent, min 54 px, radius 14 px, 700), **`.wl-button--secondary`** (surface-2, 1 px line-strong, min 48 px, radius 14 px, 500), **`.wl-button--text`** (no fill, underline, min 44 × 44 px), a 2 px `accent` `:focus-visible` ring at 2 px offset on all three, and **`.wl-input`** (bg fill, 1 px `text-muted` border, radius 12 px, min 48 px). Disabled buttons: `surface-2` fill, `text-muted` text.
  - Colours only through `var(--wl-color-*)`.
  - Tests: `apps/web/src/app/__tests__/main-css.test.ts` (T-4 and the class shapes) and a new e2e spec `tests/e2e/visual-foundation.spec.ts` (T-1 on non-UF-11 screens, G-1 on `/`, `/library`, `/progress`, `/balance`).
- Out:
  - Adopting `.wl-page` on any screen. UF-11 adopts it in T-0548 / T-0550; the other screens migrate later, one feature ticket each (spec §2 "Migration").
  - Fonts loading (T-0545). This ticket's checks read computed `fontFamily`, which doesn't need the file.
  - New tokens (D-0203 §2).
  - UF-09 focus mode (`.wl-uf09`) and the C-02 tab bar: exempt from `.wl-page`. Their own heading sizes must not change. If a global `h1`/`h2` rule changes a UF-09 element, scope it back in UF-09's CSS through a web-feature:UF-09 follow-up, or exclude it with a selector here (`.wl-uf09 h1` reset); record which.

### Edge cases that are in scope
- **Every screen at once (D-0203 §5).** Existing `getByRole('heading', { name })` tests keep passing because uppercase is CSS `text-transform` only; DOM text is unchanged.
- **Text zoom (WCAG 1.4.4).** rem sizes double at a 200 % root size (T-3 is proved on `/plan` in T-0548; here the T-4 "no px font sizes" check covers it).
- **Focus mode (principle 1).** UF-09's layout and numbers (104–180 px) are unchanged (AC5).
- **Offline / zero history.** Not affected: CSS only.

## Acceptance criteria
- **AC1 (T-4, main.css as text)** Given `apps/web/src/main.css` read as text, Then:
  - a rule whose selector list includes `h1` and `h2` (or one rule each) sets `font-family: var(--wl-font-display)`, and `body` sets `font-family: var(--wl-font-body)`;
  - no `font-size` value anywhere in the file uses `px` (every one uses `rem` or a `clamp()` of `rem`/`vw`);
  - no raw colour (`#`, `rgb(`, `hsl(`, named colours): the existing `check-colours` guard passes on it;
  - `.wl-page` declares `max-inline-size: 640px`, `margin-inline: auto` and a `padding-inline` whose two values are each `max(20px, env(safe-area-inset-*))`;
  - `.wl-input` declares a 1 px border with `var(--wl-color-text-muted)`;
  - `.wl-button--primary` uses `var(--wl-color-accent)` and `var(--wl-color-on-accent)`.
- **AC2 (T-4 fault)** Given `h2 { font-size: 24px }` planted in a backup copy of `main.css`, When AC1 runs, Then it fails on the "no px font sizes" assertion. Restored with `cp`; recorded in the log.
- **AC3 (T-1 on the tab screens, Playwright 390 × 844)** Given the built app with an injected session and mocked Supabase, When `/`, `/progress`, `/balance` and `/plan` load (and `/welcome` with no session), Then on each: `getComputedStyle(h1).fontFamily` starts with `"Big Shoulders Display"`, `fontWeight` is `800`, `textTransform` is `uppercase`, `fontSize` is between 32 px and 40 px; and `getComputedStyle(document.body).fontFamily` starts with `"DM Sans"`. (On `/plan` this holds before T-0548 because the rule is global.)
- **AC4 (G-1 on the screens that already pad, Playwright 360 × 740)** Given `/`, `/library`, `/progress` and `/balance`, Then the `h1`'s left edge is ≥ 16 px from the viewport's left edge, every visible text node and control inside the screen root has its right edge ≤ 344 px, and `document.documentElement.scrollWidth` ≤ 360.
- **AC5 (focus mode untouched)** Given a running session at `/session/S1` (UF-09.1), When it renders at 390 × 844, Then the current-step number's computed `fontSize` and the screen root's padding equal their values on `main` (read on `main` first and written into the test as constants, with a comment naming the commit). No `h1`/`h2` in UF-09 gets a different `fontSize` than on `main`.
- **AC6 (no regression)** The full web e2e suite is green with no test edited except new specs. The log lists each tab screen (UF-02.1, UF-04.1, UF-06.1, UF-10.1, UF-11.2, UF-11.4) with a 390 × 844 screenshot path from a local run and a one-line visual verdict (headings not clipped, no overlap).

Checklist (D-0197 §7): signed in and signed out are both in AC3 (`/welcome`, UF-01.1, has no session). Online/offline doesn't apply to CSS.

## Paths you may change
- `apps/web/src/main.css` (listed extra: the global stylesheet)
- `apps/web/src/app/__tests__/main-css.test.ts` (lane, new file)
- `tests/e2e/visual-foundation.spec.ts` (new file)
- `apps/web/src/features/UF-09/**` only for an `h1`/`h2` reset that AC5 needs, recorded in the log

## Contract impact
None. Existing tokens only (D-0203 §2).

## Definition of done
Every AC has a passing test · `pnpm --filter @workoutlab/web typecheck` green · `pnpm --filter @workoutlab/web lint` green · `pnpm --filter @workoutlab/web test` green · the cached full gate green · the full web e2e suite green (global CSS, D-0203 §5) · contracts unchanged · commits start with `T-0546:` and cite the screen IDs.

## Build / accept log
Archived in `docs/tickets/log/T-0546.md` (D-0157).
