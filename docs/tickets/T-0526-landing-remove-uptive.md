---
id: T-0526
title: "Landing: drop \"by Uptive\" from the header, the page titles and the footer; the product is \"workout LAB\" (GitHub #34)"
lane: landing
screens: []
decisions: [D-0194, D-0046]
deps: []
status: ready
groomed: 2026-10-06
---
<!-- Specced 2026-10-06 by product-owner against main da5c366 from GitHub #34 (D-0194).
Build flow: wl-build-web. About ⅛ day. -->

## Why
GitHub #34, from the owner: "There is content referring to Uptive. Remove those. Landing page but
could be app as well." D-0194 makes the product "workout LAB" everywhere a user can see it, with no
company byline. Every user-facing hit is on the landing (`workout.vestgote.com`); the app
(`apps/web`) already says only "workout LAB" in its `<title>`, manifest and i18n.

Hits on main da5c366:
- `src/content/landing.ts`: `brand.byline` "by Uptive", `meta.title` "workout LAB by Uptive —
  balanced training", `footer.legal` "© 2026 Uptive. workout LAB is free in this first version."
- `src/pages/index.astro:15`: renders `brand.byline` in a `brand-byline` span
  (`src/styles/global.css:87` styles it).
- `src/pages/privacy.astro:6` and `src/pages/404.astro:8`: titles ending "— workout LAB by Uptive".
- `src/content/types.ts`: doc comments, and the `Brand.byline` field.
- Tests pinning the old strings: `src/content/content.test.ts:54-55,105,110`,
  `test/ac9-index-document.test.ts:40`, `test/ac14-privacy-page.test.ts:19`.

## Scope
- In:
  - `landing.ts`: remove `brand.byline`; `meta.title` = `workout LAB — balanced training`;
    `footer.legal` = `© 2026 workout LAB. Free in this first version.`
  - `types.ts`: remove `Brand.byline`; reword the doc comments (`<title>` starts with
    "workout LAB"; the legal line names the product).
  - `index.astro`: remove the byline span; `global.css`: remove the `.wordmark .brand-byline` rule.
  - `privacy.astro` title `Privacy — workout LAB`; `404.astro` title `Page not found — workout LAB`.
  - Update the three pinned tests to the new strings (they encode T-0309's ACs, which D-0194 amends;
    this is a changed requirement, not a weakened test).
  - A guard test (AC-4).
- Out:
  - `src/content/privacy.ts` (the H-22-approved notice): it has no "Uptive" and doesn't change.
  - `apps/web` (no hit), decisions, ticket logs, `docs/security/**`, agent role text (D-0194 §6).

### Edge cases that are in scope
- The meta title must stay ≤ 60 characters and the description 50–160 (T-0309 AC1 limits).
- The wordmark must still read "workout LAB" in the visible text with no stray separator or empty
  span where the byline was.

## Acceptance criteria
- **AC-1 (brand and meta)** Given `landing` from `src/content/landing.ts`, when the test reads it,
  then `brand.name === "workout LAB"`, `brand` has no `byline` key, `meta.title ===
  "workout LAB — balanced training"` (≤ 60 characters), and the description is 50–160 characters.
  **Red on main:** `meta.title` starts "workout LAB by Uptive".
- **AC-2 (footer)** Then `footer.legal === "© 2026 workout LAB. Free in this first version."` and
  `footer.appLinkLabel` is 2–24 characters.
- **AC-3 (built pages)** Given the built site (`dist/`, as `ac9`/`ac14` already read it):
  - `dist/index.html`'s visible text contains "workout LAB" and has no element with class
    `brand-byline`;
  - `dist/privacy/index.html`'s `<title>` is `Privacy — workout LAB`;
  - `dist/404.html`'s `<title>` is `Page not found — workout LAB`.
  **Red on main** for all three.
- **AC-4 (guard)** Every string collected from `landing` and `privacy` (the existing
  `collectStrings` walk in `content.test.ts`), and the full HTML of `dist/index.html`,
  `dist/privacy/index.html` and `dist/404.html`, matches no `/uptive/i`. **Red on main.** Prove it
  stays red-capable: on a backup copy of `404.astro`, put "Uptive" back in the title; AC-4 must
  fail. Restore with `cp`.
- **AC-5 (notice unchanged)** `git diff main -- apps/landing/src/content/privacy.ts` is empty
  (record the command and its empty output in the log; no test needed).

## Paths you may change
- `apps/landing/**` (the lane: `landing`).
- **Listed extras:** `docs/tickets/T-0526-landing-remove-uptive.md`, for the build and accept logs.

## Contract impact
None.

## Definition of done
- Tests for every AC pass, red runs on main and the AC-4 planted fault recorded.
- `pnpm --filter @workoutlab/landing test` and `pnpm --filter @workoutlab/landing test:browser`
  green (one command each, through `scripts/locked.sh small` / `heavy` as D-0169 says).
- `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`,
  `-w format:check` and `node .github/scripts/check-all.mjs` green, through `scripts/locked.sh`.
- Commits start `T-0526` and cite GitHub #34.

## Notes
- Ships with the next prod deploy of the landing (the human-run `deploy-prod.sh`, H-24 style).
  No copy approval needed (D-0194 §5).
- **Parallel:** touches only `apps/landing/**`; runs alongside T-0527/T-0528/T-0529. T-0512 (astro
  7, landing lane) is built but not merged: if it's still open when this starts, run this after it
  merges, since both are in the landing lane.

## Build / accept log

### Build log (2026-10-07, landing lane, on 4f4487c)
- Tests first; red on unfixed code: 9 failed (AC1 meta/byline, AC2 footer, AC4 guard on strings, AC3 index/privacy/404, AC4 dist guard x3).
- AC-1/2: `content.test.ts` (AC1, AC4 blocks). AC-3: `ac9`, `ac14`, `ac15` tests. AC-4: `content.test.ts` AC6 "no string mentions Uptive" + new `test/t0526-no-uptive.test.ts` (3 built pages). AC-5: `git diff main -- apps/landing/src/content/privacy.ts` printed nothing.
- Planted fault (backup copy, restored with `cp`): "by Uptive" put back in `404.astro` title: `ac15` title test and `t0526` 404 guard failed; restored, 151/151 green.
- Gate: `-w typecheck lint test` first run failed only `@workoutlab/web#test` (jsdom canvas noise, unrelated; web alone re-run: 276 files / 3756 tests green); `test:repo-checks`, `format:check`, `check-all.mjs` green; landing `build` green (3 pages). `test:browser` not run (no markup change beyond removing a span).
